import { Camera } from './camera.js';
import {
  LineRenderer,
  MeshRenderer,
  NetworkIdentity,
  NetworkTransform,
  PlayerController,
  Texture,
  Transform,
} from './components.js';
import { World } from './ecs.js';
import { loadAsset } from './asset-loader.js';
import { cubeColors, cubeIndices, cubeUVs, cubeVertices } from './cube.js';
import { createProgram } from './webgl.js';
import {
  LineSystem,
  MovementSystem,
  NetworkInterpolationSystem,
  RenderSystem,
} from './systems.js';
import { InputState } from './input.js';
import { TextureManager } from './texture-manager.js';
import { MultiplayerSystem } from './multiplayer.js';

const canvas = document.querySelector('#canvas');
const status = document.querySelector('#status');

function resizeCanvas(gl, camera) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));

  if (canvas.width === width && canvas.height === height) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
  camera.setAspect(width / height);
}

function createPatternTexture() {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 64;
  textureCanvas.height = 64;
  const ctx = textureCanvas.getContext('2d');

  ctx.fillStyle = '#233b7a';
  ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  for (let x = 0; x < textureCanvas.width; x += 16) {
    for (let y = 0; y < textureCanvas.height; y += 16) {
      ctx.fillStyle = (x + y) % 32 === 0 ? '#ffb703' : '#e63946';
      ctx.fillRect(x, y, 16, 16);
    }
  }

  return textureCanvas;
}

function setupGL() {
  const gl = canvas.getContext('webgl');

  if (!gl) {
    status.textContent = 'WebGL não está disponível neste navegador.';
    throw new Error('Não foi possível criar o contexto WebGL.');
  }

  const vertexShaderSource = `
    attribute vec3 position;
    attribute vec3 vertexColor;
    attribute vec2 uv;
    uniform mat4 matrix;
    varying vec3 color;
    varying vec2 vUv;

    void main() {
      gl_Position = matrix * vec4(position, 1.0);
      color = vertexColor;
      vUv = uv;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    varying vec3 color;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform bool useTexture;

    void main() {
      vec3 finalColor = useTexture ? texture2D(uTexture, vUv).rgb : vec3(1.0);
      gl_FragColor = vec4(color * finalColor, 1.0);
    }
  `;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const camera = new Camera();
  resizeCanvas(gl, camera);
  window.addEventListener('resize', () => resizeCanvas(gl, camera));
  const world = new World();
  const textureManager = new TextureManager(gl);

  const locations = {
    position: gl.getAttribLocation(program, 'position'),
    color: gl.getAttribLocation(program, 'vertexColor'),
    uv: gl.getAttribLocation(program, 'uv'),
    matrix: gl.getUniformLocation(program, 'matrix'),
    uTexture: gl.getUniformLocation(program, 'uTexture'),
    useTexture: gl.getUniformLocation(program, 'useTexture'),
  };

  const input = new InputState();
  const movementSystem = new MovementSystem(input);
  const renderSystem = new RenderSystem(gl, program, locations, camera);

  gl.enable(gl.DEPTH_TEST);
  gl.enableVertexAttribArray(locations.position);
  gl.enableVertexAttribArray(locations.color);
  gl.enableVertexAttribArray(locations.uv);
  gl.useProgram(program);

  const lineSystem = new LineSystem(canvas, camera);
  return {
    gl,
    camera,
    world,
    textureManager,
    movementSystem,
    networkInterpolationSystem: new NetworkInterpolationSystem(),
    lineSystem,
    renderSystem,
  };
}

function spawnFallbackEntity(world) {
  const entity = world.createEntity();
  world.addComponent(entity, new Transform({ scale: [1.2, 1.2, 1.2] }));
  world.addComponent(entity, new PlayerController());
  world.addComponent(
    entity,
    new MeshRenderer({
      vertices: cubeVertices,
      colors: cubeColors,
      indices: cubeIndices,
      uvs: cubeUVs,
    }),
  );
  world.addComponent(
    entity,
    new Texture({ image: createPatternTexture(), name: 'fallback-texture' }),
  );
  return entity;
}

async function loadModelIntoWorld(world, textureManager) {
  const entity = world.createEntity();
  world.addComponent(entity, new Transform({ scale: [1.2, 1.2, 1.2] }));
  world.addComponent(entity, new PlayerController());

  const asset = await loadAsset('/models/test/source/AmongUS[Red].glb', undefined, textureManager);
  const mesh = asset.mesh ?? asset;
  const texture = asset.texture ?? new Texture({
    image: createPatternTexture(),
    name: 'fallback-texture',
  });

  world.addComponent(entity, mesh);
  world.addComponent(entity, texture);
  return entity;
}

function renderFrame(
  gl,
  world,
  movementSystem,
  networkInterpolationSystem,
  multiplayerSystem,
  lineSystem,
  renderSystem,
  previousTime = 0,
) {
  return (time) => {
    const deltaSeconds = Math.min((time - previousTime) * 0.001, 0.1);

    gl.clearColor(0.04, 0.06, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    movementSystem.update(world, deltaSeconds);
    multiplayerSystem.update(world, time);
    networkInterpolationSystem.update(world, deltaSeconds);
    lineSystem.update(world);
    renderSystem.render(world);
    requestAnimationFrame(renderFrame(
      gl,
      world,
      movementSystem,
      networkInterpolationSystem,
      multiplayerSystem,
      lineSystem,
      renderSystem,
      time,
    ));
  };
}

async function start() {
  status.textContent = 'Carregando modelo 3D...';
  const {
    gl,
    camera,
    world,
    textureManager,
    movementSystem,
    networkInterpolationSystem,
    lineSystem,
    renderSystem,
  } = setupGL();
  let playerEntity;

  try {
    playerEntity = await Promise.race([
      loadModelIntoWorld(world, textureManager),
      new Promise((_, reject) => {
        window.setTimeout(
          () => reject(new Error('Tempo limite ao carregar o modelo 3D.')),
          10000,
        );
      }),
    ]);
    const transform = world.getComponent(playerEntity, Transform);
    camera.orbitalFollow(transform, {
      distance: 6,
      azimuth: 0,
      elevation: 0.35,
      targetHeight: 0.5,
    });
  } catch (error) {
    playerEntity = spawnFallbackEntity(world);
    camera.orbitalFollow(world.getComponent(playerEntity, Transform));
    status.textContent = 'Modelo 3D indisponível; usando modelo de fallback.';
    console.error(error);
  }

  const lineEntity = world.createEntity();
  world.addComponent(lineEntity, new LineRenderer({ sourceEntity: playerEntity }));

  const multiplayerSystem = new MultiplayerSystem({
    url: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:5175`,
    world,
    onStatus: (message) => {
      status.textContent = `${message} Use WASD para mover.`;
    },
    createRemoteEntity: (peerId) => {
      const remoteEntity = world.createEntity();
      const localMesh = world.getComponent(playerEntity, MeshRenderer);
      const localTexture = world.getComponent(playerEntity, Texture);
      world.addComponent(remoteEntity, new Transform({ position: [0, 0, 0] }));
      world.addComponent(remoteEntity, new NetworkIdentity({ peerId }));
      world.addComponent(remoteEntity, new NetworkTransform());
      world.addComponent(remoteEntity, localMesh);
      if (localTexture) world.addComponent(remoteEntity, localTexture);
      return remoteEntity;
    },
  });
  multiplayerSystem.setLocalEntity(playerEntity);
  multiplayerSystem.connect();

  status.textContent = status.textContent.includes('fallback')
    ? status.textContent
    : 'WebGL ativo: modelo 3D girando. Use WASD para mover.';
  requestAnimationFrame(renderFrame(
    gl,
    world,
    movementSystem,
    networkInterpolationSystem,
    multiplayerSystem,
    lineSystem,
    renderSystem,
  ));
}

start().catch((error) => {
  status.textContent = `Erro ao iniciar: ${error.message}`;
  console.error(error);
});
