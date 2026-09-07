import { Camera } from './camera.js';
import { MeshRenderer, Texture, Transform } from './components.js';
import { World } from './ecs.js';
import { loadAsset } from './asset-loader.js';
import { cubeColors, cubeIndices, cubeUVs, cubeVertices } from './cube.js';
import { createProgram } from './webgl.js';
import { RenderSystem, TranslationSystem } from './systems.js';
import { TextureManager } from './texture-manager.js';

const canvas = document.querySelector('#canvas');
const status = document.querySelector('#status');

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

    void main() {
      vec4 texel = texture2D(uTexture, vUv);
      gl_FragColor = vec4(color * texel.rgb, 1.0);
    }
  `;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const camera = new Camera({ aspect: canvas.width / canvas.height });
  const world = new World();
  const textureManager = new TextureManager(gl);

  const locations = {
    position: gl.getAttribLocation(program, 'position'),
    color: gl.getAttribLocation(program, 'vertexColor'),
    uv: gl.getAttribLocation(program, 'uv'),
    matrix: gl.getUniformLocation(program, 'matrix'),
    uTexture: gl.getUniformLocation(program, 'uTexture'),
  };

  const translationSystem = new TranslationSystem();
  const renderSystem = new RenderSystem(gl, program, locations, camera);

  gl.enable(gl.DEPTH_TEST);
  gl.enableVertexAttribArray(locations.position);
  gl.enableVertexAttribArray(locations.color);
  gl.enableVertexAttribArray(locations.uv);
  gl.useProgram(program);

  return { gl, camera, world, textureManager, translationSystem, renderSystem };
}

function spawnFallbackEntity(world) {
  const entity = world.createEntity();
  world.addComponent(entity, new Transform({ scale: [1.2, 1.2, 1.2] }));
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

function renderFrame(gl, world, translationSystem, renderSystem) {
  return (time) => {
    const seconds = time * 0.001;

    gl.clearColor(0.04, 0.06, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    translationSystem.update(world, seconds);
    renderSystem.render(world);
    requestAnimationFrame(renderFrame(gl, world, translationSystem, renderSystem));
  };
}

async function start() {
  const {
    gl,
    camera,
    world,
    textureManager,
    translationSystem,
    renderSystem,
  } = setupGL();

  try {
    const modelEntity = await loadModelIntoWorld(world, textureManager);
    const transform = world.getComponent(modelEntity, Transform);
    camera.orbitalFollow(transform, {
      distance: 6,
      azimuth: 0,
      elevation: 0.35,
      targetHeight: 0.5,
    });
  } catch (error) {
    const fallbackEntity = spawnFallbackEntity(world);
    camera.orbitalFollow(world.getComponent(fallbackEntity, Transform));
    console.error(error);
  }

  requestAnimationFrame(renderFrame(gl, world, translationSystem, renderSystem));
}

start();
