import {
  multiplyMatrices,
  rotationX,
  rotationY,
  rotationZ,
  scale,
  translation,
} from './math.js';
import { createBuffer } from './webgl.js';
import { MeshRenderer, Transform } from './components.js';

export class RotationSystem {
  update(world, elapsedSeconds) {
    for (const entity of world.query(Transform)) {
      const transform = world.getComponent(entity, Transform);
      transform.rotation[0] = elapsedSeconds * 0.7;
      transform.rotation[1] = elapsedSeconds;
      transform.rotation[2] = 0;
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
    mesh.indexBuffer = createBuffer(
      this.gl,
      this.gl.ELEMENT_ARRAY_BUFFER,
      mesh.indices,
    );
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
      this.prepareMesh(mesh);

      const matrix = multiplyMatrices(
        projection,
        multiplyMatrices(view, this.getModelMatrix(transform)),
      );

      gl.uniformMatrix4fv(locations.matrix, false, matrix);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorBuffer);
      gl.vertexAttribPointer(locations.color, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    }
  }
}
