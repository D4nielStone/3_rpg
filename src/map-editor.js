import { MAP_CONFIG_STORAGE_KEY, readSavedMapConfig, saveMapConfig } from './map-config.js';

const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL?.trim();
const httpUrl = (configuredUrl || `${window.location.protocol}//${window.location.hostname}:5174`)
  .replace(/^wss:/, 'https:')
  .replace(/^ws:/, 'http:')
  .replace(/\/$/, '');
const accessTicket = new URLSearchParams(window.location.search).get('access');
const accessResponse = accessTicket
  ? await fetch(`${httpUrl}/api/map-access?ticket=${encodeURIComponent(accessTicket)}`, { credentials: 'include' }).catch(() => null)
  : null;
const access = accessResponse?.ok ? await accessResponse.json() : null;
if (!access?.authorized) {
  document.body.innerHTML = '<main class="access-denied"><h1>Acesso restrito</h1><p>O editor de mapas está disponível apenas para administradores pelo comando /map.</p></main>';
  throw new Error('Map editor access denied');
}

const COLS = 32;
const ROWS = 20;
const TERRAIN = {
  grass: { label: 'Grama', color: '#3f8748' },
  water: { label: 'Água', color: '#287ba0' },
  stone: { label: 'Pedra', color: '#777d79' },
  enemy: { label: 'Área inimiga', color: '#6f5b31' },
};

const canvas = document.querySelector('#map-canvas');
const context = canvas.getContext('2d');
const canvasWrap = document.querySelector('#canvas-wrap');
const palette = document.querySelector('#terrain-palette');
const selectedTerrain = document.querySelector('#selected-terrain');
const status = document.querySelector('#map-status');
const coordinates = document.querySelector('#map-coordinates');
const preview = document.querySelector('#json-preview');
const cellCount = document.querySelector('#cell-count');
const enemyAreaCount = document.querySelector('#enemy-area-count');
const waterStatus = document.querySelector('#water-status');
const waterEnabled = document.querySelector('#water-enabled');
const brushSize = document.querySelector('#brush-size');
const brushSizeValue = document.querySelector('#brush-size-value');
const mapSize = document.querySelector('#map-size');
const zoomValue = document.querySelector('#zoom-value');

let selected = 'grass';
let tool = 'brush';
let cellSize = Number(mapSize.value);
let zoom = 1;
let grid = createGrid('grass');
let history = [];
let future = [];
let painting = false;
let panStart = null;
let offset = { x: 0, y: 0 };

function createGrid(value) {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(value));
}

function snapshot() { return grid.map((row) => [...row]); }
function restore(next) { grid = next.map((row) => [...row]); render(); }
function commit() { history.push(snapshot()); if (history.length > 30) history.shift(); future = []; }
function terrainButton(key) {
  const button = document.createElement('button');
  button.className = 'terrain-button';
  button.type = 'button';
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', String(key === selected));
  button.innerHTML = `<span class="terrain-swatch terrain-${key}"></span><span>${TERRAIN[key].label}</span>`;
  button.addEventListener('click', () => { selected = key; selectedTerrain.textContent = TERRAIN[key].label; renderPalette(); });
  return button;
}
function renderPalette() { palette.replaceChildren(...Object.keys(TERRAIN).map(terrainButton)); }
function setTool(next) { tool = next; document.querySelectorAll('.tool-button').forEach((button) => button.classList.toggle('tool-button-active', button.dataset.tool === tool)); canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair'; }
function drawCell(column, row, value = grid[row]?.[column]) { if (!value) return; const x = offset.x + column * cellSize * zoom; const y = offset.y + row * cellSize * zoom; context.fillStyle = TERRAIN[value].color; context.fillRect(x, y, cellSize * zoom, cellSize * zoom); context.strokeStyle = 'rgb(0 0 0 / 18%)'; context.strokeRect(x, y, cellSize * zoom, cellSize * zoom); }
function render() { context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#101512'; context.fillRect(0, 0, canvas.width, canvas.height); grid.forEach((row, y) => row.forEach((value, x) => drawCell(x, y, value))); updateSummary(); }
function updateSummary() { const enemyCount = exportConfig().enemyAreas.length; const water = waterEnabled.checked || grid.flat().includes('water'); cellCount.textContent = `${COLS * ROWS}`; enemyAreaCount.textContent = `${enemyCount}`; waterStatus.textContent = water ? 'Ativa' : 'Inativa'; preview.textContent = JSON.stringify(exportConfig(), null, 2); }
function cellAt(event) { const rect = canvas.getBoundingClientRect(); return { column: Math.floor((event.clientX - rect.left - offset.x) / (cellSize * zoom)), row: Math.floor((event.clientY - rect.top - offset.y) / (cellSize * zoom)) }; }
function paint(event) { const point = cellAt(event); if (point.column < 0 || point.column >= COLS || point.row < 0 || point.row >= ROWS) return; if (tool === 'fill') { const old = grid[point.row][point.column]; grid = grid.map((row) => row.map((value) => value === old ? selected : value)); } else if (tool !== 'pan') { const value = tool === 'eraser' ? 'grass' : selected; const radius = Number(brushSize.value); for (let row = point.row - radius + 1; row <= point.row + radius - 1; row += 1) for (let column = point.column - radius + 1; column <= point.column + radius - 1; column += 1) if (grid[row]?.[column]) grid[row][column] = value; } render(); coordinates.textContent = `x: ${point.column}, z: ${point.row}`; }
function getEnemyAreas() {
  const visited = new Set();
  const areas = [];
  const key = (column, row) => `${column}:${row}`;
  grid.forEach((row, startRow) => row.forEach((value, startColumn) => {
    const startKey = key(startColumn, startRow);
    if (value !== 'enemy' || visited.has(startKey)) return;
    const queue = [[startColumn, startRow]];
    visited.add(startKey);
    const cells = [];
    while (queue.length) {
      const [column, currentRow] = queue.shift();
      cells.push([column, currentRow]);
      [[column - 1, currentRow], [column + 1, currentRow], [column, currentRow - 1], [column, currentRow + 1]]
        .forEach(([nextColumn, nextRow]) => {
          const nextKey = key(nextColumn, nextRow);
          if (grid[nextRow]?.[nextColumn] === 'enemy' && !visited.has(nextKey)) {
            visited.add(nextKey);
            queue.push([nextColumn, nextRow]);
          }
        });
    }
    const columns = cells.map(([column]) => column);
    const rows = cells.map(([, currentRow]) => currentRow);
    const minColumn = Math.min(...columns);
    const maxColumn = Math.max(...columns);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const size = Math.max(maxColumn - minColumn + 1, maxRow - minRow + 1);
    areas.push({
      center: [
        (minColumn + maxColumn + 1) / 2 - COLS / 2,
        0,
        (minRow + maxRow + 1) / 2 - ROWS / 2,
      ],
      width: size,
      depth: size,
    });
  }));
  return areas;
}

function exportConfig() { return { enemyAreas: getEnemyAreas(), water: { enabled: waterEnabled.checked || grid.flat().includes('water'), size: 50, segments: 32 }, terrain: { columns: COLS, rows: ROWS, cells: grid.map((row) => [...row]) } }; }
function download() { const file = new Blob([JSON.stringify(exportConfig(), null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = 'map-config.json'; link.click(); URL.revokeObjectURL(link.href); status.textContent = 'Configuração exportada'; }
async function applyToGame() {
  const config = exportConfig();
  const response = await fetch(`${httpUrl}/api/map-config`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config),
  }).catch(() => null);
  if (!response?.ok) {
    status.textContent = 'Não foi possível aplicar o mapa no servidor';
    return;
  }
  saveMapConfig(config);
  status.textContent = 'Mapa aplicado no jogo';
}

async function loadSavedMap() {
  const response = await fetch(`${httpUrl}/api/map-config`).catch(() => null);
  const remoteConfig = response?.ok ? await response.json() : null;
  const saved = remoteConfig?.terrain ? remoteConfig : readSavedMapConfig();
  const terrain = saved?.terrain;
  if (terrain?.columns === COLS && terrain.rows === ROWS && Array.isArray(terrain.cells)) {
    grid = terrain.cells.map((row) => row.map((value) => TERRAIN[value] ? value : 'grass'));
  }
  waterEnabled.checked = Boolean(saved?.water?.enabled);
}

document.querySelectorAll('.tool-button').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
brushSize.addEventListener('input', () => { brushSizeValue.textContent = brushSize.value; });
mapSize.addEventListener('input', () => { cellSize = Number(mapSize.value); render(); });
document.querySelector('#water-enabled').addEventListener('change', (event) => { if (event.target.checked) { selected = 'water'; selectedTerrain.textContent = TERRAIN.water.label; renderPalette(); } waterStatus.textContent = event.target.checked ? 'Ativa' : 'Inativa'; });
document.querySelector('#clear-button').addEventListener('click', () => { commit(); grid = createGrid('grass'); render(); status.textContent = 'Mapa limpo'; });
document.querySelector('#export-button').addEventListener('click', download);
document.querySelector('#apply-button').addEventListener('click', applyToGame);
document.querySelector('#undo-button').addEventListener('click', () => { if (!history.length) return; future.push(snapshot()); restore(history.pop()); });
document.querySelector('#redo-button').addEventListener('click', () => { if (!future.length) return; history.push(snapshot()); restore(future.pop()); });
document.querySelector('#zoom-in').addEventListener('click', () => { zoom = Math.min(2, zoom + 0.1); zoomValue.textContent = `${Math.round(zoom * 100)}%`; render(); });
document.querySelector('#zoom-out').addEventListener('click', () => { zoom = Math.max(0.5, zoom - 0.1); zoomValue.textContent = `${Math.round(zoom * 100)}%`; render(); });
canvas.addEventListener('pointerdown', (event) => { painting = true; commit(); if (tool === 'pan') { panStart = { x: event.clientX - offset.x, y: event.clientY - offset.y }; canvas.setPointerCapture(event.pointerId); } else paint(event); });
canvas.addEventListener('pointermove', (event) => { if (!painting) return; if (tool === 'pan') { offset = { x: event.clientX - panStart.x, y: event.clientY - panStart.y }; render(); } else if (tool === 'brush' || tool === 'eraser') paint(event); });
canvas.addEventListener('pointerup', () => { painting = false; panStart = null; });
canvas.addEventListener('pointerleave', () => { painting = false; panStart = null; });

await loadSavedMap();
renderPalette();
render();
