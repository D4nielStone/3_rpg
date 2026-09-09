import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { createEditorGizmos } from './editor-gizmos.js';
import { readSavedMapConfig, saveMapConfig } from './map-config.js';

const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL?.trim();
const httpUrl = (configuredUrl || `${window.location.protocol}//${window.location.hostname}:5174`).replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
const accessTicket = new URLSearchParams(window.location.search).get('access');
const accessResponse = accessTicket ? await fetch(`${httpUrl}/api/map-access?ticket=${encodeURIComponent(accessTicket)}`, { credentials: 'include' }).catch(() => null) : null;
if (!(accessResponse?.ok && (await accessResponse.json()).authorized)) {
  document.body.innerHTML = '<main class="access-denied"><h1>Acesso restrito</h1><p>O editor de mapas está disponível apenas para administradores pelo comando /map.</p></main>';
  throw new Error('Map editor access denied');
}

const canvas = document.querySelector('#map-canvas');
const status = document.querySelector('#map-status');
const coordinates = document.querySelector('#map-coordinates');
const preview = document.querySelector('#json-preview');
const assetList = document.querySelector('#asset-list');
const entityList = document.querySelector('#entity-list');
const entityInspector = document.querySelector('#entity-inspector');
const emptyInspector = document.querySelector('#empty-inspector');
const selectedEntityLabel = document.querySelector('#selected-entity-label');
const entityDiffuseColorInput = document.querySelector('#entity-diffuse-color');
const meshList = document.querySelector('#mesh-list');
const meshCount = document.querySelector('#mesh-count');
const sceneTree = document.querySelector('#scene-tree');
const ambientColorInput = document.querySelector('#ambient-color');
const ambientIntensityInput = document.querySelector('#ambient-intensity');
const ambientIntensityValue = document.querySelector('#ambient-intensity-value');
const skyColorInput = document.querySelector('#sky-color');
const panelToggles = [
  ['assets-toggle', 'assets-panel'],
  ['inspector-toggle', 'inspector-panel'],
];
const inspectorTabs = [...document.querySelectorAll('[data-inspector-tab]')];

let mode = 'select';
let entities = [];
let assets = [];
let enemyAreas = [];
let lighting = { ambientColor: [1, 1, 1], ambientIntensity: 1 };
let skyColor = [0.039, 0.051, 0.047];
let selectedEntityId = null;
let selectedEnemyAreaId = null;
let selectedMaterialIndex = 0;
let nextId = 1;
const history = [];
const future = [];

function newId(prefix) { let id; do { id = `${prefix}-${nextId++}`; } while ([...assets, ...entities, ...enemyAreas].some((item) => item.id === id)); return id; }
function selectedEntity() { return entities.find((entity) => entity.id === selectedEntityId) ?? null; }
function normalizeVector(value, fallback) { return Array.from({ length: 3 }, (_, index) => { const item = value?.[index]; return item === null || item === undefined || !Number.isFinite(Number(item)) ? fallback[index] : Number(item); }); }
function normalizeEntityTransform(entity) { entity.position = normalizeVector(entity.position, [0, 0, 0]); entity.rotation = normalizeVector(entity.rotation, [0, 0, 0]); entity.scale = normalizeVector(entity.scale, [1, 1, 1]); return entity; }
function normalizeColor(value, fallback = [1, 1, 1]) { return normalizeVector(value, fallback).map((channel) => Math.min(1, Math.max(0, channel))); }
function normalizeEntityMaterials(entity) { entity.materials = Array.isArray(entity.materials) ? entity.materials.map((material) => ({ ...material, diffuseColor: normalizeColor(material.diffuseColor) })) : []; return entity; }
function colorToHex(color) { return `#${color.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`; }
function normalizeEnemyArea(area) { area.center = normalizeVector(area.center, [0, 0, 0]); area.width = Math.max(0.1, Number(area.width) || 25); area.depth = Math.max(0.1, Number(area.depth) || 25); area.maxEnemies = Math.max(0, Number(area.maxEnemies ?? 5) || 0); area.enemyType = String(area.enemyType || 'rat'); area.areaLevel = Math.max(1, Number(area.areaLevel ?? 1) || 1); area.spawnIntervalMs = Math.max(0, Number(area.spawnIntervalMs ?? 3000) || 0); return area; }
function normalizeLighting(value = {}) { lighting = { ambientColor: normalizeVector(value.ambientColor, [1, 1, 1]).map((channel) => Math.min(1, Math.max(0, channel))), ambientIntensity: Math.min(2, Math.max(0, Number(value.ambientIntensity ?? 1) || 0)) }; return lighting; }
function normalizeSkyColor(value) { skyColor = normalizeVector(value, [0.039, 0.051, 0.047]).map((channel) => Math.min(1, Math.max(0, channel))); return skyColor; }
function updateSkyColor() { renderer.setClearColor(new THREE.Color(...skyColor)); scene.fog.color.setRGB(...skyColor); skyColorInput.value = colorToHex(skyColor); }
function updateSceneAmbientLight() { ambientLight.color.setRGB(...lighting.ambientColor); ambientLight.intensity = lighting.ambientIntensity; }
function updateLightingInspector() { ambientColorInput.value = `#${lighting.ambientColor.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`; ambientIntensityInput.value = lighting.ambientIntensity; ambientIntensityValue.textContent = lighting.ambientIntensity.toFixed(2); updateSceneAmbientLight(); }
function entitySnapshot(entity) { normalizeEntityTransform(entity); normalizeEntityMaterials(entity); return { ...entity, position: [...entity.position], rotation: [...entity.rotation], scale: [...entity.scale], materials: entity.materials.map((material) => ({ ...material, diffuseColor: [...material.diffuseColor] })) }; }
function captureState() { return exportConfig(); }
function pushHistory() { history.push(captureState()); if (history.length > 20) history.shift(); future.length = 0; }
async function undo() { const state = history.pop(); if (!state) return; future.push(captureState()); await loadWorld(state); setStatus('Alteração desfeita'); }
async function redo() { const state = future.pop(); if (!state) return; history.push(captureState()); await loadWorld(state); setStatus('Alteração refeita'); }

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const editorGl = renderer.getContext();
editorGl.enable(editorGl.CULL_FACE);
editorGl.cullFace(editorGl.BACK);
editorGl.frontFace(editorGl.CCW);
renderer.setClearColor(new THREE.Color(...skyColor));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color(...skyColor), 180, 850);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1600);
camera.position.set(42, 64, 58);
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 0); orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI / 2.05; orbit.minDistance = 4; orbit.maxDistance = 900;
const ambientLight = new THREE.AmbientLight(0xffffff, lighting.ambientIntensity); scene.add(ambientLight);
const worldGroup = new THREE.Group(); scene.add(worldGroup);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1024, 1024), new THREE.MeshStandardMaterial({ color: 0x202522, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.set(-0.5, -0.16, -0.5); worldGroup.add(ground);
const gridHelper = new THREE.GridHelper(1024, 64, 0x53605a, 0x29312d); gridHelper.position.set(-0.5, -0.14, -0.5); gridHelper.material.transparent = true; gridHelper.material.opacity = 0.3; worldGroup.add(gridHelper);
const enemyAreaVisuals = new THREE.Group(); worldGroup.add(enemyAreaVisuals);
const entityGroup = new THREE.Group(); worldGroup.add(entityGroup);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hover = new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 1), new THREE.MeshBasicMaterial({ color: 0xb9ec69, wireframe: true })); hover.visible = false; scene.add(hover);
const gizmos = createEditorGizmos({
  camera,
  canvas,
  scene,
  onDraggingChanged: (event) => { orbit.enabled = !event.value; if (event.value) pushHistory(); },
  onObjectChange: () => { syncSelectedFromObject(); updateInspector(); updateSummary(); },
});

function resize() { const width = canvas.clientWidth; const height = canvas.clientHeight; if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
function setStatus(message) { status.textContent = message; }
function setPanelOpen(panelId, open, toggle) { const panel = document.querySelector(`#${panelId}`); panel.classList.toggle('panel-open', open); toggle?.setAttribute('aria-expanded', String(open)); }
function setInspectorTab(tabId) { inspectorTabs.forEach((tab) => { const active = tab.dataset.inspectorTab === tabId; tab.classList.toggle('inspector-tab-active', active); tab.setAttribute('aria-selected', String(active)); }); document.querySelectorAll('[data-inspector-panel]').forEach((panel) => panel.classList.toggle('panel-section-active', panel.dataset.inspectorPanel === tabId)); }
function disposeObject(object) { object.traverse((child) => { child.geometry?.dispose(); if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose()); else child.material?.dispose(); }); }
function applyEntityTransform(entity) {
  if (!entity.object) return;
  normalizeEntityTransform(entity);
  entity.object.position.fromArray(entity.position); entity.object.rotation.set(...entity.rotation); entity.object.scale.fromArray(entity.scale); entity.object.updateMatrixWorld(true);
}
function applyEntityMaterials(entity) { if (!entity.object) return; normalizeEntityMaterials(entity); let index = 0; entity.object.traverse((child) => { if (!child.isMesh) return; const meshMaterials = Array.isArray(child.material) ? child.material : [child.material]; meshMaterials.forEach((material) => { const definition = entity.materials[index++]; if (!material || !definition) return; if (material.color) material.color.setRGB(...definition.diffuseColor); if ('vertexColors' in material) material.vertexColors = false; material.needsUpdate = true; }); }); }
function readObjectMaterials(object) { const materials = []; object.traverse((child) => { if (!child.isMesh) return; const meshMaterials = Array.isArray(child.material) ? child.material : [child.material]; meshMaterials.forEach((material) => materials.push({ name: material?.name || `material-${materials.length}`, diffuseColor: material?.color ? [material.color.r, material.color.g, material.color.b] : [1, 1, 1] })); }); return materials; }
function materialIndexForObject(entity, target) { let index = 0; let result = 0; entity.object?.traverse((child) => { if (!child.isMesh) return; const count = Array.isArray(child.material) ? child.material.length : 1; if (child === target) result = index; index += count; }); return result; }
function markSelectable(object, id) { object.userData.entityId = id; object.traverse((child) => { child.userData.entityId = id; }); }
function renderEnemyAreaVisuals() {
  while (enemyAreaVisuals.children.length) { const child = enemyAreaVisuals.children.pop(); disposeObject(child); }
  enemyAreas.forEach((area) => {
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(area.width, 0.08, area.depth));
    const material = new THREE.LineBasicMaterial({ color: area.id === selectedEnemyAreaId ? 0xffd166 : 0xe76f51, transparent: true, opacity: area.id === selectedEnemyAreaId ? 1 : 0.7, depthTest: false });
    const outline = new THREE.LineSegments(geometry, material);
    outline.position.set(...area.center); outline.position.y += 0.04; outline.renderOrder = 8;
    enemyAreaVisuals.add(outline);
  });
}
function addEntity(entity, object = null) {
  normalizeEntityTransform(entity);
  entity.object = object ?? new THREE.Group();
  normalizeEntityMaterials(entity);
  entity.object.name = entity.name; markSelectable(entity.object, entity.id); applyEntityTransform(entity); applyEntityMaterials(entity); entityGroup.add(entity.object);
  entities.push(entity); selectEntity(entity.id); renderEntities(); updateSummary();
}
function removeEntity(id) {
  const entity = entities.find((item) => item.id === id); if (!entity) return;
  if (entity.object) { entityGroup.remove(entity.object); disposeObject(entity.object); }
  entities = entities.filter((item) => item.id !== id); if (selectedEntityId === id) selectEntity(null); renderEntities(); updateSummary();
}
function selectEntity(id) {
  selectedEntityId = id; selectedMaterialIndex = 0; const entity = selectedEntity();
  if (entity?.object) { gizmos.attach(entity.object); selectedEntityLabel.textContent = entity.name; }
  else { gizmos.detach(); selectedEntityLabel.textContent = 'Nenhuma'; }
  updateInspector(); renderEntities();
}
function syncSelectedFromObject() { const entity = selectedEntity(); if (!entity?.object) return; entity.position = normalizeVector(entity.object.position.toArray(), [0, 0, 0]); entity.rotation = normalizeVector([entity.object.rotation.x, entity.object.rotation.y, entity.object.rotation.z], [0, 0, 0]); entity.scale = normalizeVector(entity.object.scale.toArray(), [1, 1, 1]); }
function createEntity(name = 'Entidade vazia', assetId = null) { return { id: newId('entity'), name, assetId, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], materials: [], object: null }; }
function renderEntities() {
  entityList.replaceChildren(...entities.map((entity) => { const button = document.createElement('button'); button.className = `entity-item${entity.id === selectedEntityId ? ' entity-item-selected' : ''}`; button.type = 'button'; button.innerHTML = `<span class="asset-icon">${entity.assetId ? '◆' : '○'}</span><span>${entity.name}</span>`; button.addEventListener('click', () => selectEntity(entity.id)); return button; }));
  document.querySelector('#entity-count').textContent = String(entities.length);
  renderSceneTree();
}
function selectedEnemyArea() { return enemyAreas.find((area) => area.id === selectedEnemyAreaId) ?? null; }
function renderEnemyAreas() {
  const list = document.querySelector('#enemy-area-list');
  list.replaceChildren(...enemyAreas.map((area) => { const button = document.createElement('button'); button.className = `entity-item${area.id === selectedEnemyAreaId ? ' entity-item-selected' : ''}`; button.type = 'button'; button.innerHTML = `<span class="asset-icon">⚔</span><span>${area.id}</span>`; button.addEventListener('click', () => selectEnemyArea(area.id)); return button; }));
  document.querySelector('#enemy-area-count').textContent = String(enemyAreas.length);
  renderEnemyAreaVisuals();
  renderSceneTree();
}
function createSceneTreeGroup(label, count, children, open = true) {
  const group = document.createElement('details'); group.className = 'scene-tree-group'; group.open = open;
  const summary = document.createElement('summary'); summary.textContent = `${label} (${count})`; group.append(summary);
  const childContainer = document.createElement('div'); childContainer.className = 'scene-tree-children'; childContainer.append(...children); group.append(childContainer); return group;
}
function createSceneTreeNode(icon, label, onClick, selected = false) {
  const node = document.createElement('button'); node.className = `scene-tree-node${selected ? ' scene-tree-node-selected' : ''}`; node.type = 'button'; node.setAttribute('role', 'treeitem'); node.innerHTML = `<span class="asset-icon">${icon}</span><span>${label}</span>`; node.addEventListener('click', onClick); return node;
}
function renderSceneTree() {
  if (!sceneTree) return;
  const entityNodes = entities.map((entity) => createSceneTreeNode(entity.assetId ? 'M' : 'E', entity.name, () => selectEntity(entity.id), entity.id === selectedEntityId));
  const areaNodes = enemyAreas.map((area) => createSceneTreeNode('A', area.id, () => selectEnemyArea(area.id), area.id === selectedEnemyAreaId));
  const assetNodes = assets.map((asset) => createSceneTreeNode('3D', asset.name, () => instantiateAsset(asset)));
  const settingsNode = createSceneTreeNode('S', 'Luz e cor do céu', () => setPanelOpen('inspector-panel', true, document.querySelector('#inspector-toggle')));
  sceneTree.replaceChildren(createSceneTreeGroup('Cena', 1, [settingsNode]), createSceneTreeGroup('Entidades', entities.length, entityNodes), createSceneTreeGroup('Áreas inimigas', enemyAreas.length, areaNodes), createSceneTreeGroup('Assets', assets.length, assetNodes));
  document.querySelector('#scene-tree-count').textContent = String(entities.length + enemyAreas.length + assets.length);
}
function selectEnemyArea(id) { selectedEnemyAreaId = id; updateEnemyAreaInspector(); renderEnemyAreas(); }
function updateEnemyAreaInspector() {
  const area = selectedEnemyArea(); const inspector = document.querySelector('#enemy-area-inspector'); inspector.hidden = !area; if (!area) return;
  document.querySelector('#enemy-area-id').value = area.id;
  document.querySelectorAll('[data-area-vector="center"] input').forEach((input) => { input.value = Number(area.center[Number(input.dataset.index)]).toFixed(2); });
  document.querySelectorAll('[data-area-field]').forEach((input) => { input.value = area[input.dataset.areaField]; });
}
function createEnemyArea() { return normalizeEnemyArea({ id: newId('enemy-area'), center: [0, 0, 0], width: 25, depth: 25, maxEnemies: 5, enemyType: 'rat', areaLevel: 1, spawnIntervalMs: 3000 }); }
function updateEnemyAreaField(input) {
  const area = selectedEnemyArea(); if (!area) return; pushHistory(); const field = input.dataset.areaField; const value = field === 'enemyType' ? input.value.trim() || 'rat' : Number(input.value); area[field] = field === 'enemyType' ? value : (Number.isFinite(value) ? value : 0); normalizeEnemyArea(area); updateEnemyAreaInspector(); renderEnemyAreaVisuals(); updateSummary();
}
function makeAreaVectorFields() {
  const container = document.querySelector('[data-area-vector="center"]');
  container.replaceChildren(...['x', 'y', 'z'].map((axis, index) => { const label = document.createElement('label'); label.textContent = axis.toUpperCase(); const input = document.createElement('input'); input.type = 'number'; input.step = '0.1'; input.dataset.areaIndex = String(index); input.addEventListener('change', () => { const area = selectedEnemyArea(); if (!area) return; pushHistory(); const value = Number(input.value); area.center[index] = Number.isFinite(value) ? value : 0; normalizeEnemyArea(area); updateEnemyAreaInspector(); renderEnemyAreaVisuals(); updateSummary(); }); label.append(input); return label; }));
}
function assetFormat(name) { return name.split('?')[0].split('.').pop().toLowerCase(); }
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.addEventListener('load', () => resolve(String(reader.result))); reader.addEventListener('error', () => reject(reader.error ?? new Error('Não foi possível ler o arquivo'))); reader.readAsDataURL(file); }); }
function readFileAsText(file) { return file.text(); }
function renderAssets() {
  assetList.replaceChildren(...assets.map((asset) => { const item = document.createElement('div'); item.className = 'asset-item'; const addButton = document.createElement('button'); addButton.className = 'asset-add'; addButton.type = 'button'; addButton.innerHTML = `<span class="asset-icon">3D</span><span>${asset.name}</span>`; addButton.title = 'Adicionar à cena'; addButton.addEventListener('click', () => instantiateAsset(asset)); const removeButton = document.createElement('button'); removeButton.className = 'asset-remove icon-button'; removeButton.type = 'button'; removeButton.textContent = '×'; removeButton.title = `Remover ${asset.name}`; removeButton.addEventListener('click', () => removeAsset(asset.id)); item.append(addButton, removeButton); return item; }));
  document.querySelector('#asset-count').textContent = String(assets.length);
  renderSceneTree();
}
function removeAsset(assetId) {
  const asset = assets.find((item) => item.id === assetId); if (!asset) return;
  pushHistory();
  entities.filter((entity) => entity.assetId === assetId).forEach((entity) => { if (entity.object) { entityGroup.remove(entity.object); disposeObject(entity.object); } });
  entities = entities.filter((entity) => entity.assetId !== assetId);
  if (selectedEntityId && !selectedEntity()) { selectedEntityId = null; gizmos.detach(); }
  assets = assets.filter((item) => item.id !== assetId);
  renderAssets(); renderEntities(); updateInspector(); updateSummary(); setStatus(`Asset ${asset.name} removido`);
}
function makeVectorFields() {
  document.querySelectorAll('[data-vector]').forEach((container) => {
    const vector = container.dataset.vector;
    container.replaceChildren(...['x', 'y', 'z'].map((axis, index) => { const label = document.createElement('label'); label.textContent = axis.toUpperCase(); const input = document.createElement('input'); input.type = 'number'; input.step = vector === 'rotation' ? '1' : '0.1'; input.dataset.vector = vector; input.dataset.index = String(index); input.addEventListener('change', () => updateVector(input)); label.append(input); return label; }));
  });
}
function renderMeshList(entity) {
  const materials = entity?.materials ?? [];
  meshCount.textContent = String(materials.length);
  meshList.replaceChildren(...materials.map((material, index) => {
    const button = document.createElement('button');
    button.className = `mesh-item${index === selectedMaterialIndex ? ' mesh-item-selected' : ''}`;
    button.type = 'button';
    button.innerHTML = `<span class="mesh-swatch" style="background:${colorToHex(material.diffuseColor)}"></span><span>Mesh ${index + 1} · ${material.name}</span>`;
    button.addEventListener('click', () => { selectedMaterialIndex = index; updateInspector(); });
    return button;
  }));
}
function updateInspector() {
  const entity = selectedEntity(); const active = Boolean(entity); entityInspector.hidden = !active; emptyInspector.hidden = active; if (!entity) return;
  document.querySelector('#entity-name').value = entity.name;
  if (selectedMaterialIndex >= (entity.materials?.length ?? 0)) selectedMaterialIndex = 0;
  renderMeshList(entity);
  entityDiffuseColorInput.value = colorToHex(entity.materials?.[selectedMaterialIndex]?.diffuseColor ?? [1, 1, 1]);
  document.querySelectorAll('.vector-fields input').forEach((input) => { const value = entity[input.dataset.vector][Number(input.dataset.index)]; input.value = input.dataset.vector === 'rotation' ? THREE.MathUtils.radToDeg(value).toFixed(1) : Number(value).toFixed(2); });
}
function updateVector(input) {
  const entity = selectedEntity(); if (!entity) return; normalizeEntityTransform(entity); const vector = input.dataset.vector; const index = Number(input.dataset.index); const value = Number(input.value); const safeValue = Number.isFinite(value) ? value : 0; entity[vector][index] = vector === 'rotation' ? THREE.MathUtils.degToRad(safeValue) : safeValue; applyEntityTransform(entity); gizmos.update(entity.object); updateInspector(); updateSummary();
}
function setMode(next) { mode = next; document.querySelectorAll('.mode-button').forEach((button) => button.classList.toggle('mode-button-active', button.dataset.mode === mode)); orbit.enabled = true; gizmos.setMode(mode); canvas.style.cursor = 'default'; }
function exportConfig() { return { format: 'webrpg.world', version: 2, scene: { name: 'main-world', units: 'world', skyColor: [...skyColor] }, lighting: { ambientColor: [...lighting.ambientColor], ambientIntensity: lighting.ambientIntensity }, assets: assets.map(({ id, name, url, source, format, dependencies }) => ({ id, name, url, source, format, dependencies })), entities: entities.map(({ object, ...entity }) => entitySnapshot(entity)), enemyAreas: enemyAreas.map((area) => ({ ...normalizeEnemyArea(area), center: [...area.center] })) }; }
function updateSummary() { const config = exportConfig(); document.querySelector('#entity-summary-count').textContent = String(config.entities.length); document.querySelector('#enemy-area-count').textContent = String(config.enemyAreas.length); preview.textContent = JSON.stringify(config, null, 2); }
async function loadModel(url, format = null, dependencies = null) { const extension = format ?? url.split('?')[0].split('.').pop().toLowerCase(); if (extension === 'obj') { const loader = new OBJLoader(); const mtlName = Object.keys(dependencies ?? {}).find((name) => name.toLowerCase().endsWith('.mtl')); const mtlData = mtlName ? dependencies[mtlName] : null; try { if (mtlData) { let text = await (await fetch(mtlData)).text(); text = text.replace(/^\s*map_Kd\s+(.+)$/gim, (line, path) => { const key = path.trim().replaceAll('\\', '/').split('/').pop(); return dependencies[key] ? `map_Kd ${dependencies[key]}` : line; }); const materials = new MTLLoader().parse(text, '/'); materials.preload(); loader.setMaterials(materials); } } catch { /* OBJ sem MTL continua usando material padrão. */ } return loader.loadAsync(url); } const result = await new GLTFLoader().loadAsync(url); return result.scene; }
async function instantiateAsset(asset) { try { setStatus(`Carregando ${asset.name}...`); const object = await loadModel(asset.url, asset.format, asset.dependencies); object.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } }); const entity = asset._definition ? { ...asset._definition, object } : { ...createEntity(asset.name, asset.id), materials: readObjectMaterials(object), object }; addEntity(entity, object); setMode('translate'); setStatus(`${asset.name} adicionado à cena`); } catch (error) { setStatus(`Falha ao carregar ${asset.name}: ${error.message}`); } }
async function registerAsset(url, name, source = url, format = assetFormat(name), dependencies = null) { const asset = { id: newId('asset'), name, url, source, format, dependencies }; assets.push(asset); renderAssets(); updateSummary(); await instantiateAsset(asset); }
function download() { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(exportConfig(), null, 2)], { type: 'application/json' })); link.download = 'main-world.world'; link.click(); URL.revokeObjectURL(link.href); setStatus('Cena .world exportada'); }
async function applyToGame() { const config = exportConfig(); const response = await fetch(`${httpUrl}/api/map-config`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(config) }).catch(() => null); if (!response?.ok) { const result = await response?.json().catch(() => null); setStatus(result?.error ?? 'Não foi possível aplicar o mundo no servidor'); return; } saveMapConfig(config); setStatus('Mundo aplicado no jogo'); }
async function loadWorld(config) {
  normalizeSkyColor(config?.scene?.skyColor); updateSkyColor(); normalizeLighting(config?.lighting); updateLightingInspector(); assets = []; entities = []; enemyAreas = (Array.isArray(config?.enemyAreas) ? config.enemyAreas : []).map((area) => normalizeEnemyArea({ ...area })); entityGroup.clear(); selectedEntityId = null; selectedEnemyAreaId = null;
  for (const asset of config?.assets ?? []) { if (asset.url && !asset.url.startsWith('blob:')) assets.push({ ...asset, format: asset.format ?? assetFormat(asset.name ?? asset.url) }); }
  renderAssets();
  renderEnemyAreas();
  for (const definition of config?.entities ?? []) { const asset = assets.find((item) => item.id === definition.assetId); if (asset) await instantiateAsset({ ...asset, _definition: definition }); else { const entity = { ...definition, object: null }; addEntity(entity); } }
  selectEntity(null); updateSummary();
}
async function loadSavedWorld() { const response = await fetch(`${httpUrl}/api/map-config`, { credentials: 'include' }).catch(() => null); const remoteConfig = response?.ok ? await response.json() : null; await loadWorld(remoteConfig?.entities ? remoteConfig : readSavedMapConfig()); }

document.querySelectorAll('.mode-button').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelector('#model-file').addEventListener('change', async (event) => { const files = [...event.target.files]; const model = files.find((file) => /\.(glb|gltf|obj)$/i.test(file.name)); if (!model) return; try { const dependencies = Object.fromEntries(await Promise.all(files.filter((file) => file !== model).map(async (file) => [file.name, await readFileAsDataUrl(file)]))); const url = await readFileAsDataUrl(model); await registerAsset(url, model.name, `local:${model.name}`, assetFormat(model.name), dependencies); } catch (error) { setStatus(`Falha ao ler ${model.name}: ${error.message}`); } event.target.value = ''; });
document.querySelector('#add-url-button').addEventListener('click', async () => { const input = document.querySelector('#model-url'); const url = input.value.trim(); if (!url) return; await registerAsset(url, url.split('/').pop() || 'Modelo 3D'); input.value = ''; });
document.querySelector('#create-empty-button').addEventListener('click', () => { pushHistory(); addEntity(createEntity()); setMode('translate'); setStatus('Entidade vazia criada'); });
document.querySelector('#create-enemy-area-button').addEventListener('click', () => { pushHistory(); const area = createEnemyArea(); enemyAreas.push(area); selectEnemyArea(area.id); updateSummary(); setStatus('Área inimiga criada'); });
document.querySelector('#delete-enemy-area-button').addEventListener('click', () => { if (!selectedEnemyAreaId) return; pushHistory(); enemyAreas = enemyAreas.filter((area) => area.id !== selectedEnemyAreaId); selectedEnemyAreaId = null; updateEnemyAreaInspector(); renderEnemyAreas(); updateSummary(); setStatus('Área inimiga excluída'); });
document.querySelector('#enemy-area-id').addEventListener('change', (event) => { const area = selectedEnemyArea(); if (!area) return; pushHistory(); area.id = event.target.value.trim() || newId('enemy-area'); updateEnemyAreaInspector(); renderEnemyAreas(); updateSummary(); });
document.querySelectorAll('[data-area-field]').forEach((input) => input.addEventListener('change', () => updateEnemyAreaField(input)));
document.querySelector('#delete-entity-button').addEventListener('click', () => { if (selectedEntityId) { pushHistory(); removeEntity(selectedEntityId); setStatus('Entidade excluída'); } });
document.querySelector('#entity-name').addEventListener('input', (event) => { const entity = selectedEntity(); if (!entity) return; entity.name = event.target.value || 'Entidade'; entity.object.name = entity.name; selectedEntityLabel.textContent = entity.name; renderEntities(); updateSummary(); });
entityDiffuseColorInput.addEventListener('input', () => { const entity = selectedEntity(); if (!entity) return; const hex = entityDiffuseColorInput.value.slice(1); const color = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255); normalizeEntityMaterials(entity); const material = entity.materials[selectedMaterialIndex]; if (!material) return; material.diffuseColor = [...color]; applyEntityMaterials(entity); renderMeshList(entity); updateSummary(); });
document.querySelector('#clear-button').addEventListener('click', () => { pushHistory(); entities.slice().forEach((entity) => removeEntity(entity.id)); updateSummary(); setStatus('Cena limpa'); });
document.querySelector('#export-button').addEventListener('click', download);
document.querySelector('#apply-button').addEventListener('click', applyToGame);
document.querySelector('#undo-button').addEventListener('click', undo);
document.querySelector('#redo-button').addEventListener('click', redo);
ambientColorInput.addEventListener('input', () => { const hex = ambientColorInput.value.slice(1); lighting.ambientColor = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255); updateSceneAmbientLight(); updateSummary(); });
ambientIntensityInput.addEventListener('input', () => { lighting.ambientIntensity = Number(ambientIntensityInput.value); ambientIntensityValue.textContent = lighting.ambientIntensity.toFixed(2); updateSceneAmbientLight(); updateSummary(); });
skyColorInput.addEventListener('input', () => { const hex = skyColorInput.value.slice(1); skyColor = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255); updateSkyColor(); updateSummary(); });
panelToggles.forEach(([toggleId, panelId]) => { const toggle = document.querySelector(`#${toggleId}`); toggle.addEventListener('click', () => setPanelOpen(panelId, !document.querySelector(`#${panelId}`).classList.contains('panel-open'), toggle)); });
inspectorTabs.forEach((tab) => tab.addEventListener('click', () => setInspectorTab(tab.dataset.inspectorTab)));
document.querySelectorAll('[data-close-panel]').forEach((button) => { button.addEventListener('click', () => { const panelId = button.dataset.closePanel; setPanelOpen(panelId, false, document.querySelector(`[aria-controls="${panelId}"]`)); }); });
document.querySelector('#import-world').addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; try { await loadWorld(JSON.parse(await file.text())); setStatus(`Mundo carregado: ${file.name}`); } catch { setStatus('Arquivo .world inválido'); } event.target.value = ''; });
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const shortcuts = { w: 'translate', e: 'rotate', r: 'scale' };
  const nextMode = shortcuts[event.key.toLowerCase()];
  if (nextMode) setMode(nextMode);
});
canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObject(entityGroup, true)[0]; const id = hit?.object?.userData.entityId; if (id) { selectEntity(id); selectedMaterialIndex = materialIndexForObject(selectedEntity(), hit.object) + (hit.face?.materialIndex ?? 0); updateInspector(); }
});
canvas.addEventListener('pointermove', (event) => { const rect = canvas.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObject(ground, false)[0]; if (hit) coordinates.textContent = `x: ${hit.point.x.toFixed(1)}, y: 0, z: ${hit.point.z.toFixed(1)}`; });
canvas.addEventListener('pointerleave', () => { hover.visible = false; });
window.addEventListener('resize', resize);
makeVectorFields(); makeAreaVectorFields(); normalizeSkyColor(); updateSkyColor(); normalizeLighting(); updateLightingInspector(); renderEnemyAreas(); await loadSavedWorld(); resize(); setMode('select');
function animate() { requestAnimationFrame(animate); orbit.update(); renderer.render(scene, camera); }
animate();
