import { LineRenderer, NameTag, Transform } from './components.js';
import { loadPlayer, spawnFallbackPlayer } from './player-factory.js';

const CAMERA_STORAGE_KEY = 'webgl-rpg-player-camera';

function readCameraSettings() {
  try {
    const value = JSON.parse(window.localStorage.getItem(CAMERA_STORAGE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return {};
    return ['distance', 'azimuth', 'elevation', 'targetHeight'].every((key) => Number.isFinite(Number(value[key])))
      ? Object.fromEntries(['distance', 'azimuth', 'elevation', 'targetHeight'].map((key) => [key, Number(value[key])]))
      : {};
  } catch {
    return {};
  }
}

function saveCameraSettings(settings) {
  try {
    window.localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A câmera continua funcionando mesmo quando o armazenamento está bloqueado.
  }
}

export async function loadLocalPlayer(game, definition = {}, assetDefinitions = []) {
  try {
    const entity = await Promise.race([
      loadPlayer(game.world, game.textureManager, definition, assetDefinitions),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('Tempo limite ao carregar o modelo 3D.')), 10000);
      }),
    ]);
    return { entity, usedFallback: false };
  } catch (error) {
    console.warn(`Modelo do jogador indisponível; usando fallback: ${error.message}`);
    return { entity: spawnFallbackPlayer(game.world, definition), usedFallback: true };
  }
}

export function followPlayer(game, playerEntity) {
  const transform = game.world.getComponent(playerEntity, Transform);
  const settings = readCameraSettings();
  game.camera.orbitalFollow(transform, {
    distance: 6,
    azimuth: 0,
    elevation: 0.35,
    targetHeight: 0.5,
    ...settings,
    onChange: saveCameraSettings,
  });
  saveCameraSettings(game.camera.getOrbitSettings());
}

export function addPlayerNameTag(world, playerEntity) {
  world.addComponent(playerEntity, new NameTag({
    text: window.localStorage.getItem('webgl-rpg-nickname') ?? 'Guest',
  }));
}

export function addMovementMarker(world, playerEntity) {
  const lineEntity = world.createEntity();
  world.addComponent(lineEntity, new LineRenderer({
    sourceEntity: playerEntity,
    radius: 0.35,
    thickness: 0.06,
  }));
}
