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
    for (const entity of world.query(Transform, PlayerController, MoveTarget)) {
      const transform = world.getComponent(entity, Transform);
      const controller = world.getComponent(entity, PlayerController);
      const moveTarget = world.getComponent(entity, MoveTarget);
      if (this.input.consumePressed(' ')) {
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
    canvas.addEventListener('click', (event) => {
      this.lastClick = camera.screenToGround(event.clientX, event.clientY, canvas);
    });
  }

  update(world) {
    for (const entity of world.query(LineRenderer)) {
      const line = world.getComponent(entity, LineRenderer);
      const moveTarget = world.getComponent(line.sourceEntity, MoveTarget);
      const source = world.getComponent(entity, Transform);
      const origin = source
        ? source.position
        : world.getComponent(line.sourceEntity, Transform)?.position;
      if (!origin || !moveTarget) {
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
      const deltaX = target[0] - origin[0];
      const deltaZ = target[2] - origin[2];
      const distance = Math.hypot(deltaX, deltaZ);
      const directionX = distance === 0 ? 0 : deltaX / distance;
      const directionZ = distance === 0 ? 0 : deltaZ / distance;
      const vertices = [];
      const colors = [];
      const indices = [];
      const step = line.dashLength + line.gapLength;

      for (let start = 0; start < distance; start += step) {
        const end = Math.min(start + line.dashLength, distance);
        const first = vertices.length / 3;
        vertices.push(
          origin[0] + directionX * start, origin[1] + 0.03, origin[2] + directionZ * start,
          origin[0] + directionX * end, origin[1] + 0.03, origin[2] + directionZ * end,
        );
        colors.push(...line.color, ...line.color);
        indices.push(first, first + 1);
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

  render(world) {
    const { gl, locations } = this;
    const view = this.camera.getViewMatrix();
    const projection = this.camera.getProjectionMatrix();

    for (const entity of world.query(Transform, MeshRenderer)) {
      const transform = world.getComponent(entity, Transform);
      const mesh = world.getComponent(entity, MeshRenderer);
      const texture = world.getComponent(entity, Texture);
      this.prepareMesh(mesh);
      this.prepareTexture(texture);

      const matrix = multiplyMatrices(
        projection,
        multiplyMatrices(view, this.getModelMatrix(transform)),
      );

      gl.uniformMatrix4fv(locations.matrix, false, matrix);
      gl.uniform1i(locations.useTexture, 1);
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
      gl.uniform1i(locations.useTexture, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, line.positionBuffer);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, line.colorBuffer);
      gl.vertexAttribPointer(locations.color, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, line.indexBuffer);
      gl.drawElements(gl.LINES, line.indices.length, gl.UNSIGNED_SHORT, 0);
    }
  }
}
