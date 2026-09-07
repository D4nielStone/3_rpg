import { cubeColors, cubeIndices, cubeVertices } from './cube.js';
import {
  multiplyMatrices,
  perspective,
  rotationX,
  rotationY,
  translation,
} from './math.js';
import { createBuffer, createProgram } from './webgl.js';

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
const positionBuffer = createBuffer(gl, gl.ARRAY_BUFFER, cubeVertices);
const colorBuffer = createBuffer(gl, gl.ARRAY_BUFFER, cubeColors);
const indexBuffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, cubeIndices);
const positionLocation = gl.getAttribLocation(program, 'position');
const colorLocation = gl.getAttribLocation(program, 'vertexColor');
const matrixLocation = gl.getUniformLocation(program, 'matrix');
const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
const view = translation(0, 0, -5);

gl.enable(gl.DEPTH_TEST);
gl.enableVertexAttribArray(positionLocation);
gl.enableVertexAttribArray(colorLocation);
gl.useProgram(program);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

function render(time) {
  const seconds = time * 0.001;
  const model = multiplyMatrices(rotationY(seconds), rotationX(seconds * 0.7));
  const matrix = multiplyMatrices(projection, multiplyMatrices(view, model));

  gl.clearColor(0.04, 0.06, 0.1, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(matrixLocation, false, matrix);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
  gl.drawElements(gl.TRIANGLES, cubeIndices.length, gl.UNSIGNED_SHORT, 0);
  requestAnimationFrame(render);
}

status.textContent = 'WebGL ativo: cubo 3D girando.';
requestAnimationFrame(render);
