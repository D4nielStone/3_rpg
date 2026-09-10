import { loadAsset } from './asset-loader.js';
import {
  MeshRenderer,
  AnimationPlayer,
  MoveTarget,
  NetworkIdentity,
  NetworkTransform,
  NameTag,
  PlayerController,
  Texture,
  Transform,
} from './components.js';
import { cubeColors, cubeIndices, cubeUVs, cubeVertices } from './cube.js';

export class Player {}

function createPatternTexture() {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 64;
  textureCanvas.height = 64;
  const context = textureCanvas.getContext('2d');

  context.fillStyle = '#233b7a';
  context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
  for (let x = 0; x < textureCanvas.width; x += 16) {
    for (let y = 0; y < textureCanvas.height; y += 16) {
      context.fillStyle = (x + y) % 32 === 0 ? '#ffb703' : '#e63946';
      context.fillRect(x, y, 16, 16);
    }
  }
  return textureCanvas;
}

function addController(world, entity) {
  // Componentes comuns a jogador local e fallback ficam centralizados aqui.
  world.addComponent(entity, new Transform());
  world.addComponent(entity, new AnimationPlayer());
  world.addComponent(entity, new PlayerController());
  world.addComponent(entity, new MoveTarget());
}

export function spawnFallbackPlayer(world, definition = {}) {
  const entity = world.createEntity();
  world.addComponent(entity, new Transform({ position: definition.position, rotation: definition.rotation, scale: definition.scale }));
  world.addComponent(entity, new AnimationPlayer());
  world.addComponent(entity, new PlayerController({ speed: definition.speed }));
  world.addComponent(entity, new MoveTarget());
  world.addComponent(entity, new MeshRenderer({
    vertices: cubeVertices,
    colors: cubeColors,
    indices: cubeIndices,
    uvs: cubeUVs,
  }));
  world.addComponent(entity, new Texture({
    image: createPatternTexture(),
    name: 'fallback-texture',
  }));
  return entity;
}

export async function loadPlayer(world, textureManager, definition = {}) {
  const entity = world.createEntity();
  world.addComponent(entity, new Transform({ position: definition.position, rotation: definition.rotation, scale: definition.scale }));
  world.addComponent(entity, new AnimationPlayer());
  world.addComponent(entity, new PlayerController({ speed: definition.speed }));
  world.addComponent(entity, new MoveTarget());

  const asset = await loadAsset(
    definition.model || '/models/test/source/AmongUS[Red].glb',
    definition.modelFormat,
    textureManager,
  );
  world.addComponent(entity, asset.mesh ?? asset);
  world.addComponent(entity, new AnimationPlayer({
    animations: asset.animations,
    mixer: asset.animationMixer,
    onUpdate: asset.animationUpdate,
    speed: definition.animation?.speed ?? 1,
  }));
  const animationPlayer = world.getComponent(entity, AnimationPlayer);
  if (definition.animation?.name) animationPlayer.play(definition.animation.name, { loop: definition.animation.loop !== false });
  const hasMaterialTexture = asset.mesh?.meshes?.some((mesh) => mesh.material?.texture);
  if (asset.texture || !hasMaterialTexture) {
    world.addComponent(entity, asset.texture ?? new Texture({
      image: createPatternTexture(),
      name: 'fallback-texture',
    }));
  }
  return entity;
}

export function addRemotePlayer(world, sourceEntity, peerId, nickname = 'Guest', level = 1) {
  // Jogadores remotos reutilizam a malha, mas recebem transformacao pela rede.
  const entity = world.createEntity();
  world.addComponent(entity, new Transform());
  world.addComponent(entity, new NetworkIdentity({ peerId }));
  world.addComponent(entity, new NetworkTransform());
  world.addComponent(entity, new NameTag({ text: nickname, level }));
  world.addComponent(entity, world.getComponent(sourceEntity, MeshRenderer));

  const texture = world.getComponent(sourceEntity, Texture);
  if (texture) world.addComponent(entity, texture);
  return entity;
}