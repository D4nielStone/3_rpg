import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { AnimationMixer, LoopOnce, LoopRepeat } from 'three';
import { createEditorGizmos } from './editor-gizmos.js';
import { readSavedMapConfig, saveMapConfig } from '../map-config.js';
import { getMultiplayerHttpUrl } from '../multiplayer-url.js';

const httpUrl = getMultiplayerHttpUrl();
const accessTicket = new URLSearchParams(window.location.search).get('access');
const accessResponse = accessTicket ? await fetch(`${httpUrl}/api/map-access?ticket=${encodeURIComponent(accessTicket)}`, { credentials: 'include' }).catch(() => null) : null;
if (!(accessResponse?.ok && (await accessResponse.json()).authorized)) {
  document.body.innerHTML = '<main class="access-denied"><h1>Acesso restrito</h1><p>O editor de mapas está disponível apenas para administradores pelo comando /map.</p></main>';
  throw new Error('Map editor access denied');
}
function normalizeCollision(entity) {
  const collision = entity.collision ?? {};
  entity.collision = {
    enabled: collision.enabled === true,
    shape: ['model', 'box', 'convex', 'capsule'].includes(collision.shape) ? collision.shape : 'box',
  };
  return entity;
}

const canvas = document.querySelector('#map-canvas');
const status = document.querySelector('#map-status');
const coordinates = document.querySelector('#map-coordinates');
const preview = document.querySelector('#json-preview');
const assetList = document.querySelector('#asset-list');
const soundType = document.querySelector('#sound-type');
const soundUrl = document.querySelector('#sound-url');
const soundList = document.querySelector('#sound-list');
const entityList = document.querySelector('#entity-list');
const entityInspector = document.querySelector('#entity-inspector');
const emptyInspector = document.querySelector('#empty-inspector');
const selectedEntityLabel = document.querySelector('#selected-entity-label');
const entityDiffuseColorInput = document.querySelector('#entity-diffuse-color');
const entityTextureFileInput = document.querySelector('#entity-texture-file');
const entityReceiveLightInput = document.querySelector('#entity-receive-light');
const entityCastShadowInput = document.querySelector('#entity-cast-shadow');
const playerPreviewInspector = document.querySelector('#player-preview-inspector');
const meshList = document.querySelector('#mesh-list');
const meshCount = document.querySelector('#mesh-count');
const animationControls = document.querySelector('#animation-controls');
const animationSelect = document.querySelector('#animation-select');
const animationPlayButton = document.querySelector('#animation-play');
const animationPauseButton = document.querySelector('#animation-pause');
const animationStopButton = document.querySelector('#animation-stop');
const animationLoopInput = document.querySelector('#animation-loop');
const animationSpeedInput = document.querySelector('#animation-speed');
const animationSpeedValue = document.querySelector('#animation-speed-value');
const componentTabs = [...document.querySelectorAll('[data-component-tab]')];
const animationComponentTab = document.querySelector('[data-component-tab="animation"]');
const sceneTree = document.querySelector('#scene-tree');
const ambientColorInput = document.querySelector('#ambient-color');
const ambientIntensityInput = document.querySelector('#ambient-intensity');
const ambientIntensityValue = document.querySelector('#ambient-intensity-value');
const directionalIntensityInput = document.querySelector('#directional-intensity');
const directionalIntensityValue = document.querySelector('#directional-intensity-value');
const pointLightInspector = document.querySelector('#point-light-inspector');
const entityLightColorInput = document.querySelector('#entity-light-color');
const entityLightIntensityInput = document.querySelector('#entity-light-intensity');
const entityLightIntensityValue = document.querySelector('#entity-light-intensity-value');
const entityLightDistanceInput = document.querySelector('#entity-light-distance');
const entityLightDistanceValue = document.querySelector('#entity-light-distance-value');
const skyColorInput = document.querySelector('#sky-color');
const fogColorInput = document.querySelector('#fog-color');
const fogNearInput = document.querySelector('#fog-near');
const fogNearValue = document.querySelector('#fog-near-value');
const fogFarInput = document.querySelector('#fog-far');
const fogFarValue = document.querySelector('#fog-far-value');
const panelToggles = [
  ['assets-toggle', 'assets-panel'],
  ['inspector-toggle', 'inspector-panel'],
];
const inspectorTabs = [...document.querySelectorAll('[data-inspector-tab]')];

let mode = 'select';
let entities = [];
let assets = [];
let sounds = { slash: '', pulse: '', arc: '' };
let enemyAreas = [];
let enemyTypes = [];
let lighting = {
  ambientColor: [1, 1, 1],
  ambientIntensity: 1,
  directional: { direction: [-0.45, 0.85, 0.35], color: [1, 0.95, 0.85], intensity: 0.8 },
  point: { position: [0, 8, 0], color: [1, 0.72, 0.45], intensity: 2, distance: 18 },
};
let skyColor = [0.039, 0.051, 0.047];
let fog = { color: [0.63, 0.69, 0.68], near: 180, far: 850 };
let player = {
  model: '', modelFormat: 'glb',
  position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], speed: 3,
  materials: [],
  status: { level: 1, hp: 20, maxHp: 20, mana: 20, xp: 0, strength: 1, accuracy: 1, magic: 1, money: 0 },
  inventory: [], collision: { enabled: false, shape: 'model' }, animation: { name: '', loop: true, speed: 1 },
};
let selectedEntityId = null;
let selectedEnemyAreaId = null;
let selectedMaterialIndex = 0;
let playerPreview = null;
let nextId = 1;
const history = [];
const future = [];

function newId(prefix) { let id; do { id = `${prefix}-${nextId++}`; } while ([...assets, ...entities, ...enemyAreas].some((item) => item.id === id)); return id; }
function normalizeSounds(value) { return ['slash', 'pulse', 'arc', 'level-up'].reduce((result, name) => ({ ...result, [name]: typeof value?.[name] === 'string' ? value[name] : '' }), {}); }
function renderSounds() {
  soundList.replaceChildren(...Object.entries(sounds).map(([name, source]) => {
    const item = document.createElement('div');
    item.className = 'asset-item';
    const label = document.createElement('span');
    label.className = 'asset-icon';
    label.textContent = name[0].toUpperCase();
    const value = document.createElement('span');
    value.textContent = source ? `${name}: ${source.startsWith('data:') ? 'arquivo importado' : source}` : `${name}: padrão do jogo`;
    item.append(label, value);
    return item;
  }));
}
function selectedEntity() { return entities.find((entity) => entity.id === selectedEntityId) ?? null; }
function normalizeVector(value, fallback) { return Array.from({ length: 3 }, (_, index) => { const item = value?.[index]; return item === null || item === undefined || !Number.isFinite(Number(item)) ? fallback[index] : Number(item); }); }
function normalizeEntityTransform(entity) { entity.position = normalizeVector(entity.position, [0, 0, 0]); entity.rotation = normalizeVector(entity.rotation, [0, 0, 0]); entity.scale = normalizeVector(entity.scale, [1, 1, 1]); return entity; }
function normalizeColor(value, fallback = [1, 1, 1]) { return normalizeVector(value, fallback).map((channel) => Math.min(1, Math.max(0, channel))); }
function normalizeEntityMaterials(entity) { entity.materials = Array.isArray(entity.materials) ? entity.materials.map((material) => ({ ...material, diffuseColor: normalizeColor(material.diffuseColor) })) : []; return entity; }
function normalizeEntityShadows(entity) { entity.receiveLight = entity.receiveLight !== false; entity.castShadow = entity.castShadow !== false; return entity; }
function normalizeEntityAnimation(entity) {
  entity.animation = {
    name: String(entity.animation?.name ?? ''),
    speed: Math.max(0, Number(entity.animation?.speed ?? 1) || 0),
    loop: entity.animation?.loop !== false,
    playing: entity.animation?.playing !== false,
  };
  return entity;
}
function normalizePointLight(entity) {
  entity.light = {
    color: normalizeColor(entity.light?.color, [1, 0.72, 0.45]),
    intensity: Math.min(10, Math.max(0, Number(entity.light?.intensity ?? 2) || 0)),
    distance: Math.min(200, Math.max(0.1, Number(entity.light?.distance ?? 18) || 18)),
  };
  return entity;
}
function colorToHex(color) { return `#${color.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`; }
function normalizeEnemyArea(area) { area.center = normalizeVector(area.center, [0, 0, 0]); area.width = Math.max(0.1, Number(area.width) || 25); area.depth = Math.max(0.1, Number(area.depth) || 25); area.maxEnemies = Math.max(0, Number(area.maxEnemies ?? 5) || 0); area.enemyType = String(area.enemyType || 'rat'); area.areaLevel = Math.max(1, Number(area.areaLevel ?? 1) || 1); area.spawnIntervalMs = Math.max(0, Number(area.spawnIntervalMs ?? 3000) || 0); return area; }
function normalizeEnemyType(type, index = 0) {
  type.id = String(type.id || `enemy-${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || `enemy-${index + 1}`;
  type.name = String(type.name || type.id);
  type.model = String(type.model || '');
  type.modelFormat = String(type.modelFormat || '').toLowerCase();
  type.level = Math.max(1, Math.floor(Number(type.level) || 1));
  type.maxHp = Math.max(1, Number(type.maxHp) || 1);
  type.speed = Math.max(0, Number(type.speed) || 0);
  type.defense = Math.max(0, Number(type.defense) || 0);
  type.damage = Math.max(0, Number(type.damage) || 0);
  type.experience = Math.max(0, Number(type.experience) || 0);
  type.scale = Math.max(0.01, Number(type.scale) || 1);
  type.gold = { min: Math.max(0, Math.floor(Number(type.gold?.min) || 0)), max: Math.max(0, Math.floor(Number(type.gold?.max) || 0)) };
  type.gold.max = Math.max(type.gold.min, type.gold.max);
  type.itemDrops = Array.isArray(type.itemDrops) ? type.itemDrops : [];
  return type;
}
function normalizeLighting(value = {}) {
  const normalizeLight = (light, defaults, maxIntensity) => {
    const normalized = {
      ...defaults,
      ...light,
      color: normalizeColor(light?.color, defaults.color),
      intensity: Math.min(maxIntensity, Math.max(0, Number(light?.intensity ?? defaults.intensity) || 0)),
    };
    if (defaults.direction) normalized.direction = normalizeVector(light?.direction, defaults.direction);
    if (defaults.position) normalized.position = normalizeVector(light?.position, defaults.position);
    if (defaults.distance) normalized.distance = Math.min(200, Math.max(0.1, Number(light?.distance ?? defaults.distance) || defaults.distance));
    return normalized;
  };
  lighting = {
    ambientColor: normalizeVector(value.ambientColor, [1, 1, 1]).map((channel) => Math.min(1, Math.max(0, channel))),
    ambientIntensity: Math.min(2, Math.max(0, Number(value.ambientIntensity ?? 1) || 0)),
    directional: normalizeLight(value.directional, { direction: [-0.45, 0.85, 0.35], color: [1, 0.95, 0.85], intensity: 0.8 }, 4),
    point: normalizeLight(value.point, { position: [0, 8, 0], color: [1, 0.72, 0.45], intensity: 2, distance: 18 }, 10),
  };
  return lighting;
}
function normalizeSkyColor(value) { skyColor = normalizeVector(value, [0.039, 0.051, 0.047]).map((channel) => Math.min(1, Math.max(0, channel))); return skyColor; }
function normalizeFog(value = {}) {
  fog = {
    color: normalizeColor(value.color, [0.63, 0.69, 0.68]),
    near: Math.max(0, Number(value.near ?? 180) || 0),
    far: Math.max(Number(value.far ?? 850) || 850, Number(value.near ?? 180) + 1),
  };
  return fog;
}
function updateSceneAtmosphere() {
  renderer.setClearColor(new THREE.Color(...skyColor));
  if (!scene.fog) scene.fog = new THREE.Fog(new THREE.Color(...fog.color), fog.near, fog.far);
  scene.fog.color.setRGB(...fog.color);
  scene.fog.near = fog.near;
  scene.fog.far = fog.far;
  skyColorInput.value = colorToHex(skyColor);
  fogColorInput.value = colorToHex(fog.color);
  fogNearInput.value = fog.near;
  fogNearValue.textContent = fog.near.toFixed(2);
  fogFarInput.value = fog.far;
  fogFarValue.textContent = fog.far.toFixed(2);
}
const updateSkyColor = () => updateSceneAtmosphere();
function updateSceneAmbientLight() {
  ambientLight.color.setRGB(...lighting.ambientColor);
  ambientLight.intensity = lighting.ambientIntensity;
  directionalLight.position.set(...lighting.directional.direction).multiplyScalar(-20);
  directionalLight.color.setRGB(...lighting.directional.color);
  directionalLight.intensity = lighting.directional.intensity;
}
function updateLightingInspector() {
  ambientColorInput.value = `#${lighting.ambientColor.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;
  ambientIntensityInput.value = lighting.ambientIntensity;
  ambientIntensityValue.textContent = lighting.ambientIntensity.toFixed(2);
  directionalIntensityInput.value = lighting.directional.intensity;
  directionalIntensityValue.textContent = lighting.directional.intensity.toFixed(2);
  updateSceneAmbientLight();
}
function entitySnapshot(entity) { normalizeEntityTransform(entity); normalizeEntityMaterials(entity); normalizeEntityAnimation(entity); normalizeCollision(entity); normalizeEntityShadows(entity); return { id: entity.id, name: entity.name, assetId: entity.assetId, primitive: entity.primitive ?? null, type: entity.type ?? null, light: entity.type === 'pointLight' ? { ...normalizePointLight(entity).light, color: [...entity.light.color] } : null, position: [...entity.position], rotation: [...entity.rotation], scale: [...entity.scale], receiveLight: entity.receiveLight, castShadow: entity.castShadow, materials: entity.materials.map((material) => ({ ...material, diffuseColor: [...material.diffuseColor], texture: material.texture ?? null })), animation: { ...entity.animation }, collision: { ...entity.collision } }; }
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
scene.fog = new THREE.Fog(new THREE.Color(...fog.color), fog.near, fog.far);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1600);
camera.position.set(42, 64, 58);
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 0); orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI / 2.05; orbit.minDistance = 4; orbit.maxDistance = 900;
const ambientLight = new THREE.AmbientLight(0xffffff, lighting.ambientIntensity);
const directionalLight = new THREE.DirectionalLight(0xffffff, lighting.directional.intensity);
scene.add(ambientLight, directionalLight);
const worldGroup = new THREE.Group(); scene.add(worldGroup);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1024, 1024), new THREE.MeshStandardMaterial({ color: 0x202522, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.set(-0.5, -0.16, -0.5); worldGroup.add(ground);
const gridHelper = new THREE.GridHelper(1024, 64, 0x53605a, 0x29312d); gridHelper.position.set(-0.5, -0.14, -0.5); gridHelper.material.transparent = true; gridHelper.material.opacity = 0.3; worldGroup.add(gridHelper);
const enemyAreaVisuals = new THREE.Group(); worldGroup.add(enemyAreaVisuals);
const entityGroup = new THREE.Group(); worldGroup.add(entityGroup);
const collisionGroup = new THREE.Group(); worldGroup.add(collisionGroup);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hover = new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 1), new THREE.MeshBasicMaterial({ color: 0xb9ec69, wireframe: true })); hover.visible = false; scene.add(hover);
let gizmoDragging = false;
const gizmos = createEditorGizmos({
  camera,
  canvas,
  scene,
  onDraggingChanged: (event) => { gizmoDragging = event.value; orbit.enabled = !event.value; if (event.value) pushHistory(); },
  onObjectChange: () => { syncSelectedFromObject(); const entity = selectedEntity(); if (entity) updateCollisionVisual(entity); updateInspector(); updateSummary(); },
});

function resize() { const width = canvas.clientWidth; const height = canvas.clientHeight; if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
function setStatus(message) { status.textContent = message; }
function setPanelOpen(panelId, open, toggle) { const panel = document.querySelector(`#${panelId}`); panel.classList.toggle('panel-open', open); toggle?.setAttribute('aria-expanded', String(open)); }
function setInspectorTab(tabId) { inspectorTabs.forEach((tab) => { const active = tab.dataset.inspectorTab === tabId; tab.classList.toggle('inspector-tab-active', active); tab.setAttribute('aria-selected', String(active)); }); document.querySelectorAll('[data-inspector-panel]').forEach((panel) => panel.classList.toggle('panel-section-active', panel.dataset.inspectorPanel === tabId)); }
function disposeObject(object) { object.traverse((child) => { child.geometry?.dispose(); if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose()); else child.material?.dispose(); }); }
function clearCollisionVisual(entity) {
  const visual = collisionGroup.getObjectByName(`collision-${entity.id}`);
  if (!visual) return;
  collisionGroup.remove(visual);
  disposeObject(visual);
}
function updateCollisionVisual(entity) {
  clearCollisionVisual(entity);
  if (!entity?.object || !entity.collision?.enabled) return;
  const group = new THREE.Group();
  group.name = `collision-${entity.id}`;
  const material = new THREE.LineBasicMaterial({ color: 0x42ff72, depthTest: false, transparent: true, opacity: 0.95 });
  if (entity.collision.shape === 'model') {
    entity.object.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry), material.clone());
      lines.matrix.copy(child.matrixWorld);
      lines.matrixAutoUpdate = false;
      group.add(lines);
    });
  } else {
    const bounds = new THREE.Box3().setFromObject(entity.object);
    if (entity.collision.shape === 'box') {
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(
        bounds.max.x - bounds.min.x,
        bounds.max.y - bounds.min.y,
        bounds.max.z - bounds.min.z,
      )), material);
      box.position.copy(bounds.getCenter(new THREE.Vector3()));
      group.add(box);
    } else if (entity.collision.shape === 'capsule') {
      const radius = Math.max(0.25, Math.min(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 0.5);
      const height = Math.max(radius * 2, bounds.max.y - bounds.min.y);
      const capsule = new THREE.LineSegments(new THREE.EdgesGeometry(
        new THREE.CapsuleGeometry(radius, Math.max(0, height - radius * 2), 8, 16),
      ), material);
      capsule.position.copy(bounds.getCenter(new THREE.Vector3()));
      group.add(capsule);
    } else {
      const points = [];
      entity.object.traverse((child) => {
        if (!child.isMesh || !child.geometry?.attributes?.position) return;
        const position = child.geometry.attributes.position;
        for (let index = 0; index < position.count; index += 1) {
          points.push(new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld));
        }
      });
      if (points.length >= 4) group.add(new THREE.LineSegments(new THREE.EdgesGeometry(new ConvexGeometry(points)), material));
    }
  }
  group.renderOrder = 20;
  collisionGroup.add(group);
}
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
// Adiciona uma entidade à cena, normalizando seus dados e aplicando transformações e materiais.
function uniqueEntityName(name, ignoredId = null) {
  const baseName = String(name).trim() || 'Entidade vazia';
  const normalizedNames = new Set(entities.filter((item) => item.id !== ignoredId).map((item) => String(item.name).trim().toLowerCase()));
  let uniqueName = baseName;
  let suffix = 2;
  while (normalizedNames.has(uniqueName.toLowerCase())) {
    uniqueName = `${baseName} ${suffix}`;
    suffix += 1;
  }
  return uniqueName;
}
function addEntity(entity, object = null, animations = []) {
  entity.name = uniqueEntityName(entity.name, entity.id);
  normalizeEntityTransform(entity);
  normalizeEntityAnimation(entity);
  normalizeCollision(entity);
  normalizeEntityShadows(entity);
  if (entity.type === 'pointLight') normalizePointLight(entity);
  entity.object = object ?? new THREE.Group();
  entity.animations = animations;
  entity.animationMixer = animations.length ? new AnimationMixer(entity.object) : null;
  entity.animationAction = null;
  normalizeEntityMaterials(entity);
  entity.object.name = entity.name;
  markSelectable(entity.object, entity.id);
  applyEntityTransform(entity);
  applyEntityMaterials(entity);
  entity.object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = entity.castShadow;
    child.receiveShadow = entity.receiveLight;
  });
  applyEntityAnimation(entity);
  entityGroup.add(entity.object);
  updateCollisionVisual(entity);
  entities.push(entity); selectEntity(entity.id); renderEntities(); updateSummary();
}
function syncPlayerFromPreview(entity) {
  if (!entity?.isPlayerPreview) return;
  player.position = [...entity.position];
  player.rotation = [...entity.rotation];
  player.scale = [...entity.scale];
  player.materials = entity.materials.map((material) => ({ ...material, diffuseColor: [...material.diffuseColor], texture: material.texture ?? null }));
  updatePlayerInspector();
}
async function applyStoredTextures(entity) {
  for (const [index, definition] of (entity.materials ?? []).entries()) {
    if (!definition.texture) continue;
    const texture = await new THREE.TextureLoader().loadAsync(definition.texture);
    let materialIndex = 0;
    entity.object.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (materialIndex === index) {
          material.map = texture;
          material.needsUpdate = true;
        }
        materialIndex += 1;
      });
    });
  }
}
function removePlayerPreview() {
  if (!playerPreview) return;
  clearCollisionVisual(playerPreview);
  if (playerPreview.object) {
    entityGroup.remove(playerPreview.object);
    disposeObject(playerPreview.object);
  }
  entities = entities.filter((entity) => entity !== playerPreview);
  playerPreview = null;
}
async function refreshPlayerPreview() {
  removePlayerPreview();
  const asset = assets.find((item) => item.id === player.assetId);
  let object;
  let animations = [];
  if (asset?.url) {
    const loaded = await loadModel(asset.url, asset.format, asset.dependencies);
    object = loaded.object;
    animations = loaded.animations;
  } else {
    object = createPrimitiveObject('box');
  }
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  playerPreview = {
    id: 'player-preview',
    name: 'Player (Preview)',
    isPlayerPreview: true,
    assetId: player.assetId ?? null,
    type: 'player',
    position: [...player.position],
    rotation: [...player.rotation],
    scale: [...player.scale],
    materials: player.materials?.length ? player.materials.map((material) => ({ ...material, diffuseColor: [...material.diffuseColor] })) : readObjectMaterials(object),
    animation: { ...player.animation },
    collision: { ...player.collision },
    object,
  };
  addEntity(playerPreview, object, animations);
  await applyStoredTextures(playerPreview);
  selectEntity(null);
  renderEntities();
}
function createPrimitiveObject(type) {
  const geometries = {
    box: () => new THREE.BoxGeometry(1, 1, 1),
    sphere: () => new THREE.SphereGeometry(0.5, 32, 16),
    cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
    cone: () => new THREE.ConeGeometry(0.5, 1, 32),
    capsule: () => new THREE.CapsuleGeometry(0.35, 0.3, 8, 16),
    plane: () => new THREE.PlaneGeometry(1, 1),
  };
  const geometry = geometries[type]?.();
  if (!geometry) return null;
  if (type === 'plane') geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0x7eb6ff, roughness: 0.72, metalness: 0.05 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function createPrimitive(type) {
  const labels = { box: 'Cubo', sphere: 'Esfera', cylinder: 'Cilindro', cone: 'Cone', capsule: 'Cápsula', plane: 'Plano' };
  const object = createPrimitiveObject(type);
  if (!object) return;
  pushHistory();
  const entity = { ...createEntity(labels[type] ?? 'Primitiva'), primitive: type, materials: readObjectMaterials(object), object };
  addEntity(entity, object);
  setMode('translate');
  setStatus(`${labels[type] ?? 'Primitiva'} adicionada à cena`);
}
function createPointLight() {
  pushHistory();
  const entity = {
    ...createEntity('Luz pontual'),
    type: 'pointLight',
    light: { color: [1, 0.72, 0.45], intensity: 2, distance: 18 },
    position: [0, 8, 0],
  };
  const object = new THREE.PointLight(0xffb873, entity.light.intensity, entity.light.distance);
  object.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb873 }),
  ));
  addEntity(entity, object);
  setMode('translate');
  setStatus('Luz pontual adicionada à cena');
}
function removeEntity(id) {
  const entity = entities.find((item) => item.id === id); if (!entity) return;
  clearCollisionVisual(entity);
  if (entity.object) { entityGroup.remove(entity.object); disposeObject(entity.object); }
  entities = entities.filter((item) => item.id !== id); if (selectedEntityId === id) selectEntity(null); renderEntities(); updateSummary();
}
function cloneEntityObject(object) {
  const clone = object.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry = child.geometry?.clone();
    if (Array.isArray(child.material)) child.material = child.material.map((material) => material.clone());
    else if (child.material) child.material = child.material.clone();
  });
  return clone;
}
function duplicateSelectedEntity() {
  const source = selectedEntity();
  if (!source) return;
  pushHistory();
  const duplicate = {
    ...source,
    id: newId('entity'),
    name: uniqueEntityName(`${source.name} cópia`),
    position: [...source.position],
    rotation: [...source.rotation],
    scale: [...source.scale],
    materials: source.materials.map((material) => ({ ...material, diffuseColor: [...material.diffuseColor] })),
    animation: { ...source.animation },
    collision: { ...source.collision },
    object: cloneEntityObject(source.object),
  };
  duplicate.position[0] += 1;
  addEntity(duplicate, duplicate.object, source.animations ?? []);
  setMode('translate');
  setStatus(`Entidade ${duplicate.name} criada`);
}
function selectEntity(id) {
  if (gizmoDragging && id !== selectedEntityId) return;
  selectedEntityId = id; selectedMaterialIndex = 0; const entity = selectedEntity();
  if (entity?.object) { gizmos.attach(entity.object); selectedEntityLabel.textContent = entity.name; }
  else { gizmos.detach(); selectedEntityLabel.textContent = 'Nenhuma'; }
  updateInspector(); renderEntities();
}
function setComponentTab(tabId) {
  componentTabs.forEach((tab) => {
    const active = tab.dataset.componentTab === tabId;
    tab.classList.toggle('component-tab-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-component-panel]').forEach((panel) => {
    panel.classList.toggle('component-panel-active', panel.dataset.componentPanel === tabId);
  });
}
function applyEntityAnimation(entity) {
  if (!entity?.animationMixer || !entity.animations.length) return;
  const selected = entity.animations.find((clip) => clip.name === entity.animation.name) ?? entity.animations[0];
  entity.animation.name = selected.name;
  entity.animationAction?.stop();
  entity.animationAction = entity.animationMixer.clipAction(selected);
  entity.animationAction.reset();
  entity.animationAction.setLoop(entity.animation.loop ? LoopRepeat : LoopOnce, entity.animation.loop ? Infinity : 1);
  entity.animationAction.clampWhenFinished = !entity.animation.loop;
  entity.animationAction.timeScale = entity.animation.speed;
  if (entity.animation.playing) entity.animationAction.play();
}
function updateAnimationInspector() {
  const entity = selectedEntity();
  const available = entity?.animations?.length > 0;
  animationControls.hidden = !available;
  animationComponentTab.hidden = !available;
  if (!available && animationComponentTab.classList.contains('component-tab-active')) setComponentTab('transform');
  if (!available) return;
  animationSelect.replaceChildren(...entity.animations.map((clip) => {
    const option = document.createElement('option');
    option.value = clip.name;
    option.textContent = clip.name;
    option.selected = clip.name === entity.animation.name;
    return option;
  }));
  animationLoopInput.checked = entity.animation.loop;
  animationSpeedInput.value = entity.animation.speed;
  animationSpeedValue.textContent = `${entity.animation.speed.toFixed(2)}x`;
}
function setAnimationPlaying(playing) {
  const entity = selectedEntity();
  if (!entity?.animationMixer) return;
  entity.animation.playing = playing;
  entity.animationAction?.play();
  if (entity.animationAction) entity.animationAction.paused = !playing;
  updateAnimationInspector();
}
function stopAnimation() {
  const entity = selectedEntity();
  if (!entity?.animationAction) return;
  entity.animation.playing = false;
  entity.animationAction.stop();
  entity.animationAction.reset();
  updateAnimationInspector();
}
function syncSelectedFromObject() {
  const entity = selectedEntity();
  if (!entity?.object) return;
  entity.position = normalizeVector(entity.object.position.toArray(), [0, 0, 0]);
  entity.rotation = normalizeVector([entity.object.rotation.x, entity.object.rotation.y, entity.object.rotation.z], [0, 0, 0]); entity.scale = normalizeVector(entity.object.scale.toArray(), [1, 1, 1]);
}
function createEntity(name = 'Entidade vazia', assetId = null) {
  return {
    id: newId('entity'), name: uniqueEntityName(name), assetId, position: [0, 0, 0],
    rotation: [0, 0, 0], scale: [1, 1, 1], materials: [], object: null
  };
}
function renderEntities() {
  entityList.replaceChildren(...entities.map((entity) => { const button = document.createElement('button'); button.className = `entity-item${entity.id === selectedEntityId ? ' entity-item-selected' : ''}`; button.type = 'button'; button.innerHTML = `<span class="asset-icon">${entity.isPlayerPreview ? 'P' : entity.assetId ? '◆' : '○'}</span><span>${entity.name}</span>`; button.addEventListener('click', () => selectEntity(entity.id)); return button; }));
  document.querySelector('#entity-count').textContent = String(entities.length);
  renderSceneTree();
}
function selectedEnemyArea() { return enemyAreas.find((area) => area.id === selectedEnemyAreaId) ?? null; }
function renderEnemyTypes() {
  const list = document.querySelector('#enemy-type-list');
  list.replaceChildren(...enemyTypes.map((type) => {
    const button = document.createElement('button');
    button.className = `entity-item${type.id === selectedEnemyTypeId ? ' entity-item-selected' : ''}`;
    button.type = 'button';
    button.innerHTML = `<span class="asset-icon">E</span><span>${type.name}</span>`;
    button.addEventListener('click', () => { selectedEnemyTypeId = type.id; updateEnemyTypeInspector(); renderEnemyTypes(); });
    return button;
  }));
  document.querySelector('#enemy-type-count').textContent = String(enemyTypes.length);
}
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
  const entityNodes = entities.map((entity) => createSceneTreeNode(entity.isPlayerPreview ? 'P' : entity.assetId ? 'M' : 'E', entity.name, () => selectEntity(entity.id), entity.id === selectedEntityId));
  const areaNodes = enemyAreas.map((area) => createSceneTreeNode('A', area.id, () => selectEnemyArea(area.id), area.id === selectedEnemyAreaId));
  const assetNodes = assets.map((asset) => createSceneTreeNode('3D', asset.name, () => instantiateAsset(asset)));
  const settingsNode = createSceneTreeNode('S', 'Luz e cor do céu', () => setPanelOpen('inspector-panel', true, document.querySelector('#inspector-toggle')));
  sceneTree.replaceChildren(createSceneTreeGroup('Cena', 1, [settingsNode]), createSceneTreeGroup('Entidades', entities.length, entityNodes), createSceneTreeGroup('Áreas inimigas', enemyAreas.length, areaNodes), createSceneTreeGroup('Assets', assets.length, assetNodes));
  document.querySelector('#scene-tree-count').textContent = String(entities.length + enemyAreas.length + assets.length);
}
function selectEnemyArea(id) { selectedEnemyAreaId = id; updateEnemyAreaInspector(); renderEnemyAreas(); }
let selectedEnemyTypeId = null;
function selectedEnemyType() { return enemyTypes.find((type) => type.id === selectedEnemyTypeId) ?? null; }
function updateEnemyTypeInspector() {
  const type = selectedEnemyType();
  const inspector = document.querySelector('#enemy-type-inspector');
  inspector.hidden = !type;
  if (!type) return;
  document.querySelector('#enemy-type-id').value = type.id;
  document.querySelector('#enemy-type-name').value = type.name;
  const modelSelect = document.querySelector('#enemy-type-model');
  modelSelect.replaceChildren(...assets.map((asset) => new Option(asset.name, asset.url)));
  if (type.model && !assets.some((asset) => asset.url === type.model)) modelSelect.append(new Option(type.model, type.model));
  modelSelect.value = type.model;
  ['level', 'maxHp', 'speed', 'defense', 'damage', 'experience', 'scale'].forEach((field) => { document.querySelector(`#enemy-type-${field}`).value = type[field]; });
  document.querySelector('#enemy-type-gold-min').value = type.gold.min;
  document.querySelector('#enemy-type-gold-max').value = type.gold.max;
  document.querySelector('#enemy-type-drops').value = JSON.stringify(type.itemDrops, null, 2);
}
function updateEnemyTypeField(input) {
  const type = selectedEnemyType();
  if (!type) return;
  pushHistory();
  const field = input.dataset.enemyTypeField;
  if (field === 'itemDrops') {
    try { type.itemDrops = JSON.parse(input.value); } catch { setStatus('Drops inválidos: use um JSON de lista'); return; }
  } else if (field === 'gold.min' || field === 'gold.max') {
    type.gold[field.split('.')[1]] = Number(input.value);
  } else if (field === 'model') {
    const asset = assets.find((item) => item.url === input.value);
    type.model = input.value;
    type.modelFormat = asset?.format ?? assetFormat(input.value);
  } else type[field] = input.value;
  normalizeEnemyType(type);
  updateEnemyTypeInspector();
  renderEnemyTypes();
  updateSummary();
}
function createEnemyType() {
  const type = normalizeEnemyType({ id: newId('enemy'), name: 'Novo inimigo', model: assets[0]?.url ?? '', gold: { min: 0, max: 0 }, itemDrops: [] });
  enemyTypes.push(type); selectedEnemyTypeId = type.id; renderEnemyTypes(); updateEnemyTypeInspector(); updateSummary();
}
function updateEnemyAreaInspector() {
  const area = selectedEnemyArea(); const inspector = document.querySelector('#enemy-area-inspector'); inspector.hidden = !area; if (!area) return;
  document.querySelector('#enemy-area-id').value = area.id;
  document.querySelectorAll('[data-area-vector="center"] input').forEach((input) => { input.value = Number(area.center[Number(input.dataset.index)]).toFixed(2); });
  const typeSelect = document.querySelector('#enemy-area-type');
  typeSelect.replaceChildren(...enemyTypes.map((type) => new Option(type.name, type.id)));
  typeSelect.value = area.enemyType;
  document.querySelectorAll('[data-area-field]:not(#enemy-area-type)').forEach((input) => { input.value = area[input.dataset.areaField]; });
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
  entities.filter((entity) => entity.assetId === assetId).forEach((entity) => { clearCollisionVisual(entity); if (entity.object) { entityGroup.remove(entity.object); disposeObject(entity.object); } });
  entities = entities.filter((entity) => entity.assetId !== assetId);
  if (selectedEntityId && !selectedEntity()) { selectedEntityId = null; gizmos.detach(); }
  assets = assets.filter((item) => item.id !== assetId);
  if (player.assetId === assetId) {
    player.assetId = null;
    player.model = '';
    player.modelFormat = 'glb';
  }
  renderAssets(); renderEntities(); updateInspector(); updatePlayerInspector(); updateSummary(); setStatus(`Asset ${asset.name} removido`);
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
  const entity = selectedEntity(); const active = Boolean(entity); entityInspector.hidden = !active; emptyInspector.hidden = active; playerPreviewInspector.hidden = !entity?.isPlayerPreview; if (!entity) { updateAnimationInspector(); return; }
  document.querySelector('#entity-name').value = entity.name;
  const isPointLight = entity.type === 'pointLight';
  pointLightInspector.hidden = !isPointLight;
  if (isPointLight) {
    normalizePointLight(entity);
    entityLightColorInput.value = colorToHex(entity.light.color);
    entityLightIntensityInput.value = entity.light.intensity;
    entityLightIntensityValue.textContent = entity.light.intensity.toFixed(2);
    entityLightDistanceInput.value = entity.light.distance;
    entityLightDistanceValue.textContent = entity.light.distance.toFixed(2);
  }
  if (entity.isPlayerPreview) updatePlayerInspector();
  normalizeEntityShadows(entity);
  entityReceiveLightInput.checked = entity.receiveLight;
  entityCastShadowInput.checked = entity.castShadow;
  if (selectedMaterialIndex >= (entity.materials?.length ?? 0)) selectedMaterialIndex = 0;
  renderMeshList(entity);
  entityDiffuseColorInput.value = colorToHex(entity.materials?.[selectedMaterialIndex]?.diffuseColor ?? [1, 1, 1]);
  normalizeCollision(entity);
  document.querySelector('#collision-enabled').checked = entity.collision.enabled;
  document.querySelector('#collision-shape').value = entity.collision.shape;
  entityInspector.querySelectorAll('.vector-fields input').forEach((input) => { const value = entity[input.dataset.vector][Number(input.dataset.index)]; input.value = input.dataset.vector === 'rotation' ? THREE.MathUtils.radToDeg(value).toFixed(1) : Number(value).toFixed(2); });
  updateAnimationInspector();
}
function updateVector(input) {
  const entity = selectedEntity(); if (!entity) return; normalizeEntityTransform(entity); const vector = input.dataset.vector; const index = Number(input.dataset.index); const value = Number(input.value); const safeValue = Number.isFinite(value) ? value : 0; entity[vector][index] = vector === 'rotation' ? THREE.MathUtils.degToRad(safeValue) : safeValue; applyEntityTransform(entity); updateCollisionVisual(entity); gizmos.update(entity.object); if (entity.isPlayerPreview) syncPlayerFromPreview(entity); updateInspector(); updateSummary();
}
function setMode(next) { mode = next; document.querySelectorAll('.mode-button').forEach((button) => button.classList.toggle('mode-button-active', button.dataset.mode === mode)); orbit.enabled = true; gizmos.setMode(mode); canvas.style.cursor = 'default'; }
function exportConfig() { return { format: 'webrpg.world', version: 2, scene: { name: 'main-world', units: 'world', skyColor: [...skyColor], fog: { color: [...fog.color], near: fog.near, far: fog.far } }, lighting: { ambientColor: [...lighting.ambientColor], ambientIntensity: lighting.ambientIntensity, directional: { ...lighting.directional, direction: [...lighting.directional.direction], color: [...lighting.directional.color] }, point: { ...lighting.point, position: [...lighting.point.position], color: [...lighting.point.color] } }, sounds: { ...sounds }, player: { ...player, position: [...player.position], rotation: [...player.rotation], scale: [...player.scale], materials: player.materials?.map((material) => ({ ...material, diffuseColor: [...material.diffuseColor], texture: material.texture ?? null })) ?? [], status: { ...player.status }, inventory: [...player.inventory], collision: { ...player.collision }, animation: { ...player.animation } }, assets: assets.map(({ id, name, url, source, format, dependencies }) => ({ id, name, url, source, format, dependencies })), entities: entities.filter((entity) => !entity.isPlayerPreview).map(({ object, ...entity }) => entitySnapshot(entity)), enemyTypes: enemyTypes.map((type, index) => normalizeEnemyType({ ...type, gold: { ...type.gold }, itemDrops: [...type.itemDrops] }, index)), enemyAreas: enemyAreas.map((area) => ({ ...normalizeEnemyArea(area), center: [...area.center] })) }; }
function updateSummary() {
  const config = exportConfig();
  document.querySelector('#entity-summary-count').textContent = String(config.entities.length);
  document.querySelector('#enemy-area-count').textContent = String(config.enemyAreas.length);
  preview.textContent = JSON.stringify(config, null, 2);
}
function updatePlayerInspector() {
  const set = (id, value) => { const input = document.querySelector(`#${id}`); if (input) input.value = value; };
  const assetSelect = document.querySelector('#player-asset');
  if (assetSelect) {
    assetSelect.replaceChildren(new Option('Modelo padrão', ''));
    assets.forEach((asset) => assetSelect.add(new Option(asset.name, asset.id)));
    assetSelect.value = player.assetId ?? '';
  }
  const selectedAsset = assets.find((asset) => asset.id === player.assetId);
  set('player-model-format', selectedAsset?.format ?? player.modelFormat);
  const maxHp = Math.max(1, Number(player.status?.maxHp ?? 20) || 20);
  set('player-speed', player.speed); set('player-hp', Math.min(maxHp, Math.max(0, Number(player.status?.hp ?? maxHp)))); set('player-max-hp', maxHp); set('player-animation', player.animation.name); set('player-status', JSON.stringify(player.status)); set('player-inventory', JSON.stringify(player.inventory));
}
function readPlayerInspector() {
  const json = (id, fallback) => { try { const value = JSON.parse(document.querySelector(`#${id}`).value); return value && typeof value === 'object' ? value : fallback; } catch { return fallback; } };
  const selectedAsset = assets.find((asset) => asset.id === document.querySelector('#player-asset').value);
  player.assetId = selectedAsset?.id ?? null;
  if (selectedAsset) {
    player.model = selectedAsset.url;
    player.modelFormat = selectedAsset.format;
  } else {
    player.model = player.model || '';
    player.modelFormat = document.querySelector('#player-model-format').value;
  }
  player.speed = Math.max(0, Number(document.querySelector('#player-speed').value) || 0);
  player.animation.name = document.querySelector('#player-animation').value.trim();
  player.status = json('player-status', player.status);
  player.status.maxHp = Math.max(1, Number(document.querySelector('#player-max-hp').value) || 1);
  player.status.hp = Math.min(player.status.maxHp, Math.max(0, Number(document.querySelector('#player-hp').value) || 0));
  player.inventory = Array.isArray(json('player-inventory', [])) ? json('player-inventory', []) : [];
  const previewEntity = playerPreview;
  if (previewEntity) {
    player.position = [...previewEntity.position];
    player.rotation = [...previewEntity.rotation];
    player.scale = [...previewEntity.scale];
    player.collision = { ...previewEntity.collision };
    previewEntity.assetId = player.assetId;
    previewEntity.animation = { ...player.animation };
    previewEntity.collision = { ...player.collision };
  }
  updateSummary();
}
async function loadModel(url, format = null, dependencies = null) { const extension = format ?? url.split('?')[0].split('.').pop().toLowerCase(); if (extension === 'obj') { const loader = new OBJLoader(); const mtlName = Object.keys(dependencies ?? {}).find((name) => name.toLowerCase().endsWith('.mtl')); const mtlData = mtlName ? dependencies[mtlName] : null; try { if (mtlData) { let text = await (await fetch(mtlData)).text(); text = text.replace(/^\s*map_Kd\s+(.+)$/gim, (line, path) => { const key = path.trim().replaceAll('\\', '/').split('/').pop(); return dependencies[key] ? `map_Kd ${dependencies[key]}` : line; }); const materials = new MTLLoader().parse(text, '/'); materials.preload(); loader.setMaterials(materials); } } catch { /* OBJ sem MTL continua usando material padrão. */ } return { object: await loader.loadAsync(url), animations: [] }; } const manager = new THREE.LoadingManager();
manager.setURLModifier((resourceUrl) => {
  const key = decodeURIComponent(resourceUrl).replaceAll('\\', '/').split('/').pop().toLowerCase();
  const dependency = Object.entries(dependencies ?? {}).find(([name]) => (
    name.replaceAll('\\', '/').split('/').pop().toLowerCase() === key
  ));
  return dependency?.[1] ?? resourceUrl;
});
const result = await new GLTFLoader(manager).loadAsync(url); return { object: result.scene, animations: result.animations }; }
async function instantiateAsset(asset) { try { setStatus(`Carregando ${asset.name}...`); const loaded = await loadModel(asset.url, asset.format, asset.dependencies); const object = loaded.object; object.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } }); const entity = asset._definition ? { ...asset._definition, object } : { ...createEntity(asset.name, asset.id), materials: readObjectMaterials(object), object }; addEntity(entity, object, loaded.animations); setMode('translate'); setStatus(`${asset.name} adicionado à cena`); } catch (error) { setStatus(`Falha ao carregar ${asset.name}: ${error.message}`); } }
async function registerAsset(url, name, source = url, format = assetFormat(name), dependencies = null) { const asset = { id: newId('asset'), name, url, source, format, dependencies }; assets.push(asset); renderAssets(); updatePlayerInspector(); updateSummary(); await instantiateAsset(asset); }
function download() { readPlayerInspector(); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(exportConfig(), null, 2)], { type: 'application/json' })); link.download = 'main-world.world'; link.click(); URL.revokeObjectURL(link.href); setStatus('Cena .world exportada'); }
async function applyToGame() { readPlayerInspector(); const config = exportConfig(); const response = await fetch(`${httpUrl}/api/map-config`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(config) }).catch(() => null); if (!response?.ok) { const result = await response?.json().catch(() => null); setStatus(result?.error ?? 'Não foi possível aplicar o mundo no servidor'); return; } saveMapConfig(config); setStatus('Mundo aplicado no jogo'); }
// Carrega o mundo a partir de uma configuração JSON, normalizando os dados e atualizando a cena.
async function loadWorld(config) {
  normalizeSkyColor(config?.scene?.skyColor);
  normalizeFog(config?.scene?.fog);
  updateSceneAtmosphere();
  normalizeLighting(config?.lighting);
  sounds = normalizeSounds(config?.sounds);
  renderSounds();
  updateLightingInspector();   player = { ...player, ...(config?.player ?? {}), position: normalizeVector(config?.player?.position, [0, 0, 0]), rotation: normalizeVector(config?.player?.rotation, [0, 0, 0]), scale: normalizeVector(config?.player?.scale, [1, 1, 1]), status: { ...player.status, ...(config?.player?.status ?? {}) }, inventory: Array.isArray(config?.player?.inventory) ? config.player.inventory : [], collision: { ...player.collision, ...(config?.player?.collision ?? {}) }, animation: { ...player.animation, ...(config?.player?.animation ?? {}) } };
  removePlayerPreview(); assets = []; entities = []; enemyTypes = (Array.isArray(config?.enemyTypes) ? config.enemyTypes : [{ id: 'rat', name: 'Rato', model: '', level: 1, maxHp: 3, speed: 1.2, defense: 1, damage: 1, experience: 2, scale: 0.35, gold: { min: 3, max: 5 }, itemDrops: [] }]).map((type, index) => normalizeEnemyType({ ...type, gold: { ...type.gold }, itemDrops: [...(type.itemDrops ?? [])] }, index)); selectedEnemyTypeId = null; enemyAreas = (Array.isArray(config?.enemyAreas) ? config.enemyAreas : []).map((area) => normalizeEnemyArea({ ...area })); entityGroup.clear(); selectedEntityId = null; selectedEnemyAreaId = null;
  for (const asset of config?.assets ?? []) { if (asset.url && !asset.url.startsWith('blob:')) assets.push({ ...asset, format: asset.format ?? assetFormat(asset.name ?? asset.url) }); }
  renderAssets();
  updatePlayerInspector();
  renderEnemyTypes();
  renderEnemyAreas();
  for (const definition of config?.entities ?? []) {
    if (definition.type === 'pointLight') {
      const light = normalizePointLight({ ...definition });
      const object = new THREE.PointLight(colorToHex(light.light.color), light.light.intensity, light.light.distance);
      object.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: colorToHex(light.light.color) })));
      addEntity(light, object);
    } else {
      const asset = assets.find((item) => item.id === definition.assetId);
      if (asset) await instantiateAsset({ ...asset, _definition: definition });
      else if (definition.primitive) {
        const object = createPrimitiveObject(definition.primitive);
        if (object) addEntity({ ...definition, name: createEntity(definition.name).name, object }, object);
      } else { const entity = { ...definition, object: null };
        entity.name = createEntity(entity.name).name;
        addEntity(entity); }
    }
  }
  await refreshPlayerPreview();
  selectEntity(null); 
  updateSummary();
}
// Carrega o mundo salvo do servidor ou do armazenamento local.
async function loadSavedWorld() { 
  const response = await fetch(`${httpUrl}/api/map-config`, { 
    credentials: 'include' 
  }).catch(() => null); 
  const remoteConfig = response?.ok ? await response.json() : null; 
  await loadWorld(remoteConfig?.entities ? remoteConfig : readSavedMapConfig()); 
}

document.querySelectorAll('.mode-button').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelector('#model-file').addEventListener('change', async (event) => { const files = [...event.target.files]; const model = files.find((file) => /\.(glb|gltf|obj)$/i.test(file.name)); if (!model) return; try { const dependencies = Object.fromEntries(await Promise.all(files.filter((file) => file !== model).map(async (file) => [file.name, await readFileAsDataUrl(file)]))); const url = await readFileAsDataUrl(model); await registerAsset(url, model.name, `local:${model.name}`, assetFormat(model.name), dependencies); } catch (error) { setStatus(`Falha ao ler ${model.name}: ${error.message}`); } event.target.value = ''; });
document.querySelector('#add-url-button').addEventListener('click', async () => { const input = document.querySelector('#model-url'); const url = input.value.trim(); if (!url) return; await registerAsset(url, url.split('/').pop() || 'Modelo 3D'); input.value = ''; });
function syncSoundInput() { const source = sounds[soundType.value] ?? ''; soundUrl.value = source.startsWith('data:') ? '' : source; }
soundType.addEventListener('change', syncSoundInput);
async function verifySoundSource(source) {
  if (source.startsWith('data:') || source.startsWith('blob:')) return true;
  try {
    let response = await fetch(source, { method: 'HEAD' });
    if (response.status === 405 || response.status === 501) response = await fetch(source, { headers: { Range: 'bytes=0-0' } });
    return response.ok;
  } catch {
    return false;
  }
}
document.querySelector('#sound-url-button').addEventListener('click', async () => {
  const source = soundUrl.value.trim();
  if (!source) return;
  if (!(await verifySoundSource(source))) {
    setStatus('Arquivo de som não encontrado ou indisponível');
    return;
  }
  pushHistory();
  sounds[soundType.value] = source;
  renderSounds();
  updateSummary();
  setStatus(`Som ${soundType.value} configurado`);
});
document.querySelector('#sound-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    pushHistory();
    sounds[soundType.value] = await readFileAsDataUrl(file);
    renderSounds();
    syncSoundInput();
    updateSummary();
    setStatus(`Som ${soundType.value} importado`);
  } catch (error) {
    setStatus(`Falha ao ler ${file.name}: ${error.message}`);
  }
  event.target.value = '';
});
document.querySelector('#create-empty-button').addEventListener('click', () => { pushHistory(); addEntity(createEntity()); setMode('translate'); setStatus('Entidade vazia criada'); });
document.querySelector('#duplicate-entity-button').addEventListener('click', duplicateSelectedEntity);
document.querySelector('#create-point-light-button').addEventListener('click', createPointLight);
document.querySelectorAll('[data-primitive]').forEach((button) => button.addEventListener('click', () => createPrimitive(button.dataset.primitive)));
document.querySelector('#create-enemy-area-button').addEventListener('click', () => { pushHistory(); const area = createEnemyArea(); enemyAreas.push(area); selectEnemyArea(area.id); updateSummary(); setStatus('Área inimiga criada'); });
document.querySelector('#create-enemy-type-button').addEventListener('click', () => { pushHistory(); createEnemyType(); setStatus('Tipo de inimigo criado'); });
document.querySelectorAll('[data-enemy-type-field]').forEach((input) => input.addEventListener('change', () => updateEnemyTypeField(input)));
document.querySelector('#delete-enemy-area-button').addEventListener('click', () => { if (!selectedEnemyAreaId) return; pushHistory(); enemyAreas = enemyAreas.filter((area) => area.id !== selectedEnemyAreaId); selectedEnemyAreaId = null; updateEnemyAreaInspector(); renderEnemyAreas(); updateSummary(); setStatus('Área inimiga excluída'); });
document.querySelector('#enemy-area-id').addEventListener('change', (event) => { const area = selectedEnemyArea(); if (!area) return; pushHistory(); area.id = event.target.value.trim() || newId('enemy-area'); updateEnemyAreaInspector(); renderEnemyAreas(); updateSummary(); });
document.querySelectorAll('[data-area-field]').forEach((input) => input.addEventListener('change', () => updateEnemyAreaField(input)));
document.querySelector('#delete-entity-button').addEventListener('click', () => { if (selectedEntityId) { pushHistory(); removeEntity(selectedEntityId); setStatus('Entidade excluída'); } });
componentTabs.forEach((tab) => tab.addEventListener('click', () => setComponentTab(tab.dataset.componentTab)));
animationPlayButton.addEventListener('click', () => setAnimationPlaying(true));
animationPauseButton.addEventListener('click', () => setAnimationPlaying(false));
animationStopButton.addEventListener('click', stopAnimation);
animationSelect.addEventListener('change', () => { const entity = selectedEntity(); if (!entity) return; pushHistory(); entity.animation.name = animationSelect.value; entity.animation.playing = true; if (entity.isPlayerPreview) player.animation = { ...entity.animation }; applyEntityAnimation(entity); updateAnimationInspector(); updateSummary(); });
animationLoopInput.addEventListener('change', () => { const entity = selectedEntity(); if (!entity) return; pushHistory(); entity.animation.loop = animationLoopInput.checked; applyEntityAnimation(entity); if (entity.isPlayerPreview) player.animation = { ...entity.animation }; updateAnimationInspector(); updateSummary(); });
animationSpeedInput.addEventListener('input', () => { const entity = selectedEntity(); if (!entity) return; entity.animation.speed = Math.max(0, Number(animationSpeedInput.value) || 0); if (entity.animationAction) entity.animationAction.timeScale = entity.animation.speed; if (entity.isPlayerPreview) player.animation = { ...entity.animation }; animationSpeedValue.textContent = `${entity.animation.speed.toFixed(2)}x`; updateSummary(); });
document.querySelector('#entity-name').addEventListener('change', (event) => {
  const entity = selectedEntity();
  if (!entity) return;
  const requestedName = String(event.target.value).trim();
  const duplicate = entities.some((item) => item.id !== entity.id && item.name.trim().toLowerCase() === requestedName.toLowerCase());
  if (!requestedName || duplicate) {
    event.target.value = entity.name;
    setStatus(duplicate ? 'Já existe uma entidade com esse nome' : 'O nome da entidade não pode ficar vazio');
    return;
  }
  pushHistory();
  entity.name = requestedName;
  entity.object.name = entity.name;
  selectedEntityLabel.textContent = entity.name;
  renderEntities();
  updateSummary();
});
document.querySelector('#collision-enabled').addEventListener('change', (event) => { const entity = selectedEntity(); if (!entity) return; pushHistory(); entity.collision.enabled = event.target.checked; if (entity.isPlayerPreview) player.collision = { ...entity.collision }; updateCollisionVisual(entity); updateSummary(); });
document.querySelector('#collision-shape').addEventListener('change', (event) => { const entity = selectedEntity(); if (!entity) return; pushHistory(); entity.collision.shape = event.target.value; if (entity.isPlayerPreview) player.collision = { ...entity.collision }; updateCollisionVisual(entity); updateSummary(); });
entityDiffuseColorInput.addEventListener('input', () => { const entity = selectedEntity(); if (!entity) return; const hex = entityDiffuseColorInput.value.slice(1); const color = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255); normalizeEntityMaterials(entity); const material = entity.materials[selectedMaterialIndex]; if (!material) return; material.diffuseColor = [...color]; applyEntityMaterials(entity); if (entity.isPlayerPreview) syncPlayerFromPreview(entity); renderMeshList(entity); updateSummary(); });
function updateEntityShadowSettings() {
 const entity = selectedEntity();
 if (!entity) return;
 pushHistory();
 entity.receiveLight = entityReceiveLightInput.checked;
 entity.castShadow = entityCastShadowInput.checked;
 entity.object?.traverse((child) => {
   if (!child.isMesh) return;
   child.castShadow = entity.castShadow;
   child.receiveShadow = entity.receiveLight;
 });
 updateSummary();
}
entityReceiveLightInput.addEventListener('change', updateEntityShadowSettings);
entityCastShadowInput.addEventListener('change', updateEntityShadowSettings);
entityTextureFileInput.addEventListener('change', async () => {
  const entity = selectedEntity();
  const file = entityTextureFileInput.files?.[0];
  if (!entity || !file) return;
  const textureUrl = await readFileAsDataUrl(file);
  const texture = await new THREE.TextureLoader().loadAsync(textureUrl);
  let materialIndex = 0;
  entity.object.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (materialIndex === selectedMaterialIndex) {
        material.map = texture;
        material.needsUpdate = true;
      }
      materialIndex += 1;
    });
  });
  normalizeEntityMaterials(entity);
  if (entity.materials[selectedMaterialIndex]) entity.materials[selectedMaterialIndex].texture = textureUrl;
  if (entity.isPlayerPreview) syncPlayerFromPreview(entity);
  entityTextureFileInput.value = '';
  updateSummary();
});
entityLightColorInput.addEventListener('input', () => { const entity = selectedEntity(); if (!entity || entity.type !== 'pointLight') return; const hex = entityLightColorInput.value.slice(1); entity.light.color = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255); entity.object.color.setRGB(...entity.light.color); entity.object.children[0]?.material.color.setRGB(...entity.light.color); updateSummary(); });
entityLightIntensityInput.addEventListener('input', () => { const entity = selectedEntity(); if (!entity || entity.type !== 'pointLight') return; entity.light.intensity = Number(entityLightIntensityInput.value); entity.object.intensity = entity.light.intensity; entityLightIntensityValue.textContent = entity.light.intensity.toFixed(2); updateSummary(); });
entityLightDistanceInput.addEventListener('input', () => { const entity = selectedEntity(); if (!entity || entity.type !== 'pointLight') return; entity.light.distance = Number(entityLightDistanceInput.value); entity.object.distance = entity.light.distance; entityLightDistanceValue.textContent = entity.light.distance.toFixed(2); updateSummary(); });
document.querySelector('#clear-button').addEventListener('click', () => { pushHistory(); entities.slice().forEach((entity) => removeEntity(entity.id)); updateSummary(); setStatus('Cena limpa'); });
document.querySelector('#export-button').addEventListener('click', download);
document.querySelector('#player-asset').addEventListener('change', async () => {
  readPlayerInspector();
  await refreshPlayerPreview();
  setStatus('Preview do player atualizado');
});
['player-model-format', 'player-speed', 'player-hp', 'player-max-hp', 'player-animation', 'player-status', 'player-inventory'].forEach((id) => {
  const input = document.querySelector(`#${id}`);
  input.addEventListener('input', readPlayerInspector);
  input.addEventListener('change', readPlayerInspector);
});
document.querySelector('#apply-button').addEventListener('click', applyToGame);
document.querySelector('#undo-button').addEventListener('click', undo);
document.querySelector('#redo-button').addEventListener('click', redo);
ambientColorInput.addEventListener('input', () => { const hex = ambientColorInput.value.slice(1); lighting.ambientColor = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255); updateSceneAmbientLight(); updateSummary(); });
ambientIntensityInput.addEventListener('input', () => { lighting.ambientIntensity = Number(ambientIntensityInput.value); ambientIntensityValue.textContent = lighting.ambientIntensity.toFixed(2); updateSceneAmbientLight(); updateSummary(); });
directionalIntensityInput.addEventListener('input', () => { lighting.directional.intensity = Number(directionalIntensityInput.value); directionalIntensityValue.textContent = lighting.directional.intensity.toFixed(2); updateSceneAmbientLight(); updateSummary(); });
skyColorInput.addEventListener('input', () => { const hex = skyColorInput.value.slice(1); skyColor = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255); updateSceneAtmosphere(); updateSummary(); });
fogColorInput.addEventListener('input', () => { const hex = fogColorInput.value.slice(1); fog.color = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255); updateSceneAtmosphere(); updateSummary(); });
fogNearInput.addEventListener('input', () => { fog.near = Number(fogNearInput.value) || 0; if (fog.near >= fog.far) fog.far = fog.near + 1; updateSceneAtmosphere(); updateSummary(); });
fogFarInput.addEventListener('input', () => { fog.far = Number(fogFarInput.value) || 0; if (fog.far <= fog.near) fog.near = Math.max(0, fog.far - 1); updateSceneAtmosphere(); updateSummary(); });
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
  if (gizmoDragging) return;
  const rect = canvas.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObject(entityGroup, true)[0]; const id = hit?.object?.userData.entityId; if (id) { selectEntity(id); selectedMaterialIndex = materialIndexForObject(selectedEntity(), hit.object) + (hit.face?.materialIndex ?? 0); updateInspector(); }
});
canvas.addEventListener('pointermove', (event) => { const rect = canvas.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObject(ground, false)[0]; if (hit) coordinates.textContent = `x: ${hit.point.x.toFixed(1)}, y: 0, z: ${hit.point.z.toFixed(1)}`; });
canvas.addEventListener('pointerleave', () => { hover.visible = false; });
window.addEventListener('resize', resize);
makeVectorFields(); makeAreaVectorFields(); normalizeSkyColor(); normalizeFog(); updateSceneAtmosphere(); normalizeLighting(); updateLightingInspector(); renderEnemyAreas(); await loadSavedWorld(); resize(); setMode('select');
let lastFrameTime = performance.now();
function animate() { requestAnimationFrame(animate); const now = performance.now(); const delta = Math.min(0.1, (now - lastFrameTime) / 1000); lastFrameTime = now; entities.forEach((entity) => entity.animationMixer?.update(delta)); orbit.update(); renderer.render(scene, camera); }
animate();
