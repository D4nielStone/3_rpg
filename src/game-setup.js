import { Camera } from './camera.js';
import { World } from './ecs.js';
import {
  LineSystem,
  MovementSystem,
  NetworkInterpolationSystem,
  RenderSystem,
} from './systems.js';
import { InputState } from './input.js';
import { TextureManager } from './texture-manager.js';
import { createProgram } from './webgl.js';

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

function resizeCanvas(gl, camera, canvas) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));

  if (canvas.width === width && canvas.height === height) return;

  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
  camera.setAspect(width / height);
}

export function createGame(canvas, status) {
  const gl = canvas.getContext('webgl');
  if (!gl) {
    status.textContent = 'WebGL não está disponível neste navegador.';
    throw new Error('Não foi possível criar o contexto WebGL.');
  }

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const camera = new Camera();
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

  resizeCanvas(gl, camera, canvas);
  window.addEventListener('resize', () => resizeCanvas(gl, camera, canvas));
  gl.enable(gl.DEPTH_TEST);
  gl.enableVertexAttribArray(locations.position);
  gl.enableVertexAttribArray(locations.color);
  gl.enableVertexAttribArray(locations.uv);
  gl.useProgram(program);

  return {
    gl,
    camera,
    world,
    textureManager,
    movementSystem: new MovementSystem(new InputState()),
    networkInterpolationSystem: new NetworkInterpolationSystem(),
    lineSystem: new LineSystem(canvas, camera),
    renderSystem: new RenderSystem(gl, program, locations, camera),
  };
}