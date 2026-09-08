import { MAP_CONFIG_STORAGE_KEY, readSavedMapConfig, saveMapConfig } from './map-config.js';

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
function updateSummary() { const enemyCount = grid.flat().filter((value) => value === 'enemy').length; const water = waterEnabled.checked || grid.flat().includes('water'); cellCount.textContent = `${COLS * ROWS}`; enemyAreaCount.textContent = `${enemyCount}`; waterStatus.textContent = water ? 'Ativa' : 'Inativa'; preview.textContent = JSON.stringify(exportConfig(), null, 2); }
function cellAt(event) { const rect = canvas.getBoundingClientRect(); return { column: Math.floor((event.clientX - rect.left - offset.x) / (cellSize * zoom)), row: Math.floor((event.clientY - rect.top - offset.y) / (cellSize * zoom)) }; }
function paint(event) { const point = cellAt(event); if (point.column < 0 || point.column >= COLS || point.row < 0 || point.row >= ROWS) return; if (tool === 'fill') { const old = grid[point.row][point.column]; grid = grid.map((row) => row.map((value) => value === old ? selected : value)); } else if (tool !== 'pan') { const value = tool === 'eraser' ? 'grass' : selected; const radius = Number(brushSize.value); for (let row = point.row - radius + 1; row <= point.row + radius - 1; row += 1) for (let column = point.column - radius + 1; column <= point.column + radius - 1; column += 1) if (grid[row]?.[column]) grid[row][column] = value; } render(); coordinates.textContent = `x: ${point.column}, z: ${point.row}`; }
function exportConfig() { const enemyAreas = []; grid.forEach((row, z) => row.forEach((value, x) => { if (value === 'enemy') enemyAreas.push([x - COLS / 2, 0, z - ROWS / 2]); })); return { enemyAreas, water: { enabled: waterEnabled.checked || grid.flat().includes('water'), size: 50, segments: 32 }, terrain: { columns: COLS, rows: ROWS, cells: grid.map((row) => [...row]) } }; }
function download() { const file = new Blob([JSON.stringify(exportConfig(), null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = 'map-config.json'; link.click(); URL.revokeObjectURL(link.href); status.textContent = 'Configuração exportada'; }
function applyToGame() { saveMapConfig(exportConfig()); status.textContent = `Mapa aplicado (${MAP_CONFIG_STORAGE_KEY})`; }

function loadSavedMap() {
  const saved = readSavedMapConfig();
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

loadSavedMap();
renderPalette();
render();
