import {
  multiplyMatrices,
  rotationX,
  rotationY,
  rotationZ,
  scale,
  translation,
} from './math.js';
import { createBuffer, createTexture } from './webgl.js';
import {
  MeshRenderer,
  LineRenderer,
  MoveTarget,
  PlayerController,
  NetworkTransform,
  Texture,
  Transform,
  Water,
} from './components.js';

export class NetworkInterpolationSystem {
  update(world, deltaSeconds) {
    for (const entity of world.query(Transform, NetworkTransform)) {
      const transform = world.getComponent(entity, Transform);
      const networkTransform = world.getComponent(entity, NetworkTransform);
      if (!networkTransform.targetPosition) continue;

      const amount = 1 - Math.exp(-networkTransform.interpolation * deltaSeconds);
      for (let index = 0; index < 3; index += 1) {
        transform.position[index] +=
          (networkTransform.targetPosition[index] - transform.position[index]) * amount;
      }
      if (networkTransform.targetRotation) {
        transform.rotation[1] +=
          (networkTransform.targetRotation[1] - transform.rotation[1]) * amount;
      }
    }
  }
}

export class MovementSystem {
  constructor(input) {
    this.input = input;
  }

  update(world, deltaSeconds) {
    // So entidades com MoveTarget podem se mover; WASD nao participa mais deste fluxo.
    for (const entity of world.query(Transform, PlayerController, MoveTarget)) {
      const transform = world.getComponent(entity, Transform);
      const controller = world.getComponent(entity, PlayerController);
      const moveTarget = world.getComponent(entity, MoveTarget);
      if (this.input.consumePressed(' ')) {
        // Space cancela o destino; o LineSystem remove o marcador no mesmo frame.
        moveTarget.position = null;
        continue;
      }
      if (!moveTarget.position) continue;

      const deltaX = moveTarget.position[0] - transform.position[0];
      const deltaZ = moveTarget.position[2] - transform.position[2];
      const distanceToTarget = Math.hypot(deltaX, deltaZ);
      if (distanceToTarget <= 0.05) {
        transform.position[0] = moveTarget.position[0];
        transform.position[2] = moveTarget.position[2];
        moveTarget.position = null;
        continue;
      }

      const x = deltaX / distanceToTarget;
      const z = deltaZ / distanceToTarget;
      const distance = controller.speed * deltaSeconds;
      const step = Math.min(distance, distanceToTarget);
      transform.position[0] += x * step;
      transform.position[2] += z * step;
      transform.rotation[1] = Math.atan2(x, z);
    }
  }
}

export class LineSystem {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.lastClick = null;
    this.pointerHeld = false;
    // Pointer Events funcionam para mouse, toque e caneta com a mesma implementacao.
    const updateTarget = (event) => {
      this.lastClick = camera.screenToGround(event.clientX, event.clientY, canvas);
    };

    canvas.addEventListener('pointerdown', (event) => {
      this.pointerHeld = true;
      canvas.setPointerCapture?.(event.pointerId);
      updateTarget(event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (this.pointerHeld) updateTarget(event);
    });
    canvas.addEventListener('pointerup', () => {
      this.pointerHeld = false;
    });
    canvas.addEventListener('pointercancel', () => {
      this.pointerHeld = false;
    });
  }

  update(world, time = 0) {
    for (const entity of world.query(LineRenderer)) {
      const line = world.getComponent(entity, LineRenderer);
      const moveTarget = world.getComponent(line.sourceEntity, MoveTarget);
      if (!moveTarget) {
        line.vertices = new Float32Array();
        line.colors = new Float32Array();
        line.indices = new Uint16Array();
        line.dirty = true;
        continue;
      }

      if (this.lastClick && this.lastClick !== line.target) {
        moveTarget.position = this.lastClick;
        line.target = this.lastClick;
      }
      if (!moveTarget.position) {
        line.vertices = new Float32Array();
        line.colors = new Float32Array();
        line.indices = new Uint16Array();
        line.dirty = true;
        continue;
      }

      line.target = moveTarget.position;
      const target = line.target;
      const vertices = [];
      const colors = [];
      const indices = [];
      // O marcador permanece no destino; apenas o raio pulsa visualmente.
      const height = target[1] + 0.04;
      const visualScale = 1 + Math.sin(time * 0.006) * 0.2;
      const outerRadius = line.radius * visualScale;
      // O anel usa triangulos para que a espessura seja consistente no WebGL.
      const innerRadius = Math.max(0, outerRadius - line.thickness);

      for (let index = 0; index < line.segments; index += 1) {
        const angle = (index / line.segments) * Math.PI * 2;
        const nextAngle = ((index + 1) / line.segments) * Math.PI * 2;
        const first = vertices.length / 3;
        vertices.push(
          target[0] + Math.cos(angle) * outerRadius, height,
          target[2] + Math.sin(angle) * line.radius,
          target[0] + Math.cos(angle) * innerRadius, height,
          target[2] + Math.sin(angle) * innerRadius,
          target[0] + Math.cos(nextAngle) * outerRadius, height,
          target[2] + Math.sin(nextAngle) * line.radius,
          target[0] + Math.cos(nextAngle) * innerRadius, height,
          target[2] + Math.sin(nextAngle) * innerRadius,
        );
        colors.push(...line.color, ...line.color, ...line.color, ...line.color);
        indices.push(
          first, first + 1, first + 2,
          first + 1, first + 3, first + 2,
        );
      }

      line.vertices = new Float32Array(vertices);
      line.colors = new Float32Array(colors);
      line.indices = new Uint16Array(indices);
      line.dirty = true;
    }
  }
}

export class RenderSystem {
  constructor(gl, program, locations, camera) {
    this.gl = gl;
    this.program = program;
    this.locations = locations;
    this.camera = camera;
  }

  prepareMesh(mesh) {
    if (mesh.positionBuffer) {
      return;
    }

    mesh.positionBuffer = createBuffer(this.gl, this.gl.ARRAY_BUFFER, mesh.vertices);
    mesh.colorBuffer = createBuffer(this.gl, this.gl.ARRAY_BUFFER, mesh.colors);
    if (mesh.uvs) {
      mesh.uvBuffer = createBuffer(this.gl, this.gl.ARRAY_BUFFER, mesh.uvs);
    }
    mesh.indexBuffer = createBuffer(
      this.gl,
      this.gl.ELEMENT_ARRAY_BUFFER,
      mesh.indices,
    );
  }

  prepareTexture(texture) {
    if (!texture || texture.glTexture) {
      return;
    }

    texture.glTexture = createTexture(this.gl, texture.image, {
      wrapS: this.gl.CLAMP_TO_EDGE,
      wrapT: this.gl.CLAMP_TO_EDGE,
      minFilter: this.gl.LINEAR,
      magFilter: this.gl.LINEAR,
    });
  }

  prepareLine(line) {
    if (!line.positionBuffer) {
      line.positionBuffer = createBuffer(this.gl, this.gl.ARRAY_BUFFER, line.vertices);
      line.colorBuffer = createBuffer(this.gl, this.gl.ARRAY_BUFFER, line.colors);
      line.indexBuffer = createBuffer(
        this.gl,
        this.gl.ELEMENT_ARRAY_BUFFER,
        line.indices,
      );
    } else if (line.dirty) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, line.positionBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, line.vertices, this.gl.DYNAMIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, line.colorBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, line.colors, this.gl.DYNAMIC_DRAW);
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, line.indexBuffer);
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, line.indices, this.gl.DYNAMIC_DRAW);
    }
    line.dirty = false;
  }

  getModelMatrix(transform) {
    const [x, y, z] = transform.position;
    const [pitch, yaw, roll] = transform.rotation;
    const [scaleX, scaleY, scaleZ] = transform.scale;
    const rotation = multiplyMatrices(
      rotationY(yaw),
      multiplyMatrices(rotationX(pitch), rotationZ(roll)),
    );

    return multiplyMatrices(
      translation(x, y, z),
      multiplyMatrices(rotation, scale(scaleX, scaleY, scaleZ)),
    );
  }

  render(world, time = 0) {
    const { gl, locations } = this;
    const view = this.camera.getViewMatrix();
    const projection = this.camera.getProjectionMatrix();

    for (const entity of world.query(Transform, MeshRenderer)) {
      const transform = world.getComponent(entity, Transform);
      const mesh = world.getComponent(entity, MeshRenderer);
      const texture = world.getComponent(entity, Texture);
      const water = world.getComponent(entity, Water);
      this.prepareMesh(mesh);
      this.prepareTexture(texture);

      const matrix = multiplyMatrices(
        projection,
        multiplyMatrices(view, this.getModelMatrix(transform)),
      );

      gl.uniformMatrix4fv(locations.matrix, false, matrix);
      gl.uniform1f(locations.useTexture, texture ? 1 : 0);
      gl.uniform1f(locations.isWater, water ? 1 : 0);
      gl.uniform1f(locations.time, time);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorBuffer);
      gl.vertexAttribPointer(locations.color, 3, gl.FLOAT, false, 0, 0);

      if (mesh.uvs && texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture.glTexture);
        gl.uniform1i(locations.uTexture, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
        gl.vertexAttribPointer(locations.uv, 2, gl.FLOAT, false, 0, 0);
      }

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    }

    for (const entity of world.query(LineRenderer)) {
      const line = world.getComponent(entity, LineRenderer);
      this.prepareLine(line);
      if (line.indices.length === 0) continue;

      gl.uniformMatrix4fv(locations.matrix, false, multiplyMatrices(projection, view));
      gl.uniform1f(locations.useTexture, 0);
      gl.uniform1f(locations.isWater, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, line.positionBuffer);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, line.colorBuffer);
      gl.vertexAttribPointer(locations.color, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, line.indexBuffer);
      gl.drawElements(gl.TRIANGLES, line.indices.length, gl.UNSIGNED_SHORT, 0);
    }
  }
}
