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

export async function loadPlayer(world, textureManager, definition = {}, assetDefinitions = []) {
  const configuredAsset = assetDefinitions.find((assetDefinition) => (
    assetDefinition.id === definition.assetId
    || (!definition.assetId && assetDefinition.url === definition.model)
  ));
  const modelUrl = configuredAsset?.url || definition.model || '';
  const modelFormat = configuredAsset?.format || definition.modelFormat || modelUrl.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1];
  if (!modelUrl) {
    throw new Error('Nenhum modelo de jogador foi configurado.');
  }

  const asset = await loadAsset(
    modelUrl,
    modelFormat,
    textureManager,
    configuredAsset?.dependencies ?? null,
  );

  const entity = world.createEntity();
  world.addComponent(entity, new Transform({ position: definition.position, rotation: definition.rotation, scale: definition.scale }));
  world.addComponent(entity, new AnimationPlayer());
  world.addComponent(entity, new PlayerController({ speed: definition.speed }));
  world.addComponent(entity, new MoveTarget());
  world.addComponent(entity, asset.mesh ?? asset);
  world.addComponent(entity, new AnimationPlayer({
    animations: asset.animations,
    mixer: asset.animationMixer,
    onUpdate: asset.animationUpdate,
    speed: definition.animation?.speed ?? 1,
  }));
  const animationPlayer = world.getComponent(entity, AnimationPlayer);
  if (definition.animation?.name) animationPlayer.play(definition.animation.name, { loop: definition.animation.loop !== false });
  for (const [index, materialDefinition] of (definition.materials ?? []).entries()) {
    const material = asset.mesh?.meshes?.[index]?.material;
    if (!material || !materialDefinition) continue;
    if (Array.isArray(materialDefinition.diffuseColor)) material.diffuseColor = [...materialDefinition.diffuseColor];
    if (materialDefinition.texture) {
      material.texture = new Texture({
        image: await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = materialDefinition.texture;
        }),
        name: `player-material-${index}`,
      });
      material.texture.glTexture = textureManager.ensure(material.texture.image, material.texture.name);
    }
  }
  if (asset.texture) world.addComponent(entity, asset.texture);
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