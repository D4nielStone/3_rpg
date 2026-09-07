import { Camera } from './camera.js';
import { MeshRenderer, Transform } from './components.js';
import { World } from './ecs.js';
import { loadAsset } from './asset-loader.js';
import { cubeColors, cubeIndices, cubeVertices } from './cube.js';
import { createProgram } from './webgl.js';
import { RenderSystem, RotationSystem } from './systems.js';

const canvas = document.querySelector('#canvas');
const status = document.querySelector('#status');
const gl = canvas.getContext('webgl');

if (!gl) {
  status.textContent = 'WebGL não está disponível neste navegador.';
  throw new Error('Não foi possível criar o contexto WebGL.');
}

const vertexShaderSource = `
  attribute vec3 position;
  attribute vec3 vertexColor;
  uniform mat4 matrix;
  varying vec3 color;

  void main() {
    gl_Position = matrix * vec4(position, 1.0);
    color = vertexColor;
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  varying vec3 color;

  void main() {
    gl_FragColor = vec4(color, 1.0);
  }
`;

const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
const camera = new Camera({ aspect: canvas.width / canvas.height });
const world = new World();

const locations = {
  position: gl.getAttribLocation(program, 'position'),
  color: gl.getAttribLocation(program, 'vertexColor'),
  matrix: gl.getUniformLocation(program, 'matrix'),
};
const rotationSystem = new RotationSystem();
const renderSystem = new RenderSystem(gl, program, locations, camera);

gl.enable(gl.DEPTH_TEST);
gl.enableVertexAttribArray(locations.position);
gl.enableVertexAttribArray(locations.color);
gl.useProgram(program);

function render(time) {
  const seconds = time * 0.001;

  gl.clearColor(0.04, 0.06, 0.1, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  rotationSystem.update(world, seconds);
  renderSystem.render(world);
  requestAnimationFrame(render);
}

async function start() {
  try {
    const modelEntity = world.createEntity();
    world.addComponent(modelEntity, new Transform({ scale: [1.2, 1.2, 1.2] }));

    const mesh = await loadAsset('/models/test/source/AmongUS[Red].glb');
    if (!(mesh instanceof MeshRenderer)) {
      throw new Error('Asset carregado não é uma malha renderizável.');
    }

    world.addComponent(modelEntity, mesh);
    status.textContent = 'WebGL ativo: modelo carregado no ECS.';
    requestAnimationFrame(render);
  } catch (error) {
    const fallbackEntity = world.createEntity();
    world.addComponent(fallbackEntity, new Transform({ scale: [1.2, 1.2, 1.2] }));
    world.addComponent(
      fallbackEntity,
      new MeshRenderer({
        vertices: cubeVertices,
        colors: cubeColors,
        indices: cubeIndices,
      }),
    );
    status.textContent = `Modelo não carregado; usando cubo de fallback. ${error.message}`;
    console.error(error);
    requestAnimationFrame(render);
  }
}

start();
