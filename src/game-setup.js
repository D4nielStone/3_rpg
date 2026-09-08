import { Camera } from './camera.js';
import { World } from './ecs.js';
import {
  LineSystem,
  AnimationSystem,
  MovementSystem,
  NetworkInterpolationSystem,
  RenderSystem,
} from './systems.js';
import { InputState } from './input.js';
import { TextureManager } from './texture-manager.js';
import { createProgram } from './webgl.js';
import { NameTagSystem } from './name-tags.js';
import { EnemyHoverSystem } from './enemy-hover.js';

const vertexShaderSource = `
  precision mediump float;
  attribute vec3 position;
  attribute vec3 vertexColor;
  attribute vec2 uv;
  uniform mat4 matrix;
  varying vec3 color;
  varying vec2 vUv;
  uniform float isWater;
  uniform float time;

  void main() {
    vec3 animatedPosition = position;
    if (isWater > 0.5) {
      animatedPosition.y += sin(position.x * 1.7 + time * 0.0012) * 0.035;
      animatedPosition.y += cos(position.z * 1.25 + time * 0.0009) * 0.025;
    }
    gl_Position = matrix * vec4(animatedPosition, 1.0);
    color = vertexColor;
    vUv = uv;
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  varying vec3 color;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float useTexture;
  uniform float isWater;
  uniform float time;

  void main() {
    vec3 finalColor;
    if (isWater > 0.5) {
      vec2 movingUv = vUv + vec2(time * 0.00008, time * 0.00005);
      float bands = sin((movingUv.x + movingUv.y) * 2.0);
      float highlights = smoothstep(0.35, 0.85, bands);
      finalColor = mix(vec3(0.035, 0.28, 0.55), vec3(0.12, 0.68, 0.82), highlights);
    } else {
      finalColor = useTexture > 0.5 ? texture2D(uTexture, vUv).rgb : color;
    }
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
  // Este modulo monta as dependencias da cena; regras de jogo ficam nos sistemas.
  const gl = canvas.getContext('webgl');
  if (!gl) {
    status.textContent = 'WebGL não está disponível neste navegador.';
    throw new Error('Não foi possível criar o contexto WebGL.');
  }

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const camera = new Camera();
  const world = new World();
  const textureManager = new TextureManager(gl);
  const input = new InputState();
  const locations = {
    position: gl.getAttribLocation(program, 'position'),
    color: gl.getAttribLocation(program, 'vertexColor'),
    uv: gl.getAttribLocation(program, 'uv'),
    matrix: gl.getUniformLocation(program, 'matrix'),
    uTexture: gl.getUniformLocation(program, 'uTexture'),
    useTexture: gl.getUniformLocation(program, 'useTexture'),
    isWater: gl.getUniformLocation(program, 'isWater'),
    time: gl.getUniformLocation(program, 'time'),
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
    input,
    animationSystem: new AnimationSystem(),
    movementSystem: new MovementSystem(input),
    networkInterpolationSystem: new NetworkInterpolationSystem(),
    lineSystem: new LineSystem(canvas, camera),
    nameTagSystem: new NameTagSystem(canvas, camera),
    enemyHoverSystem: new EnemyHoverSystem(canvas, camera),
    renderSystem: new RenderSystem(gl, program, locations, camera),
  };
}