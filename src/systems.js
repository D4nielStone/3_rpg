import {
  multiplyMatrices,
  rotationX,
  rotationY,
  rotationZ,
  scale,
  translation,
} from './math.js';
import { createBuffer, createTexture } from './webgl.js';
import { MeshRenderer, Texture, Transform } from './components.js';

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

export class TranslationSystem {
  update(world, elapsedSeconds) {
    for (const entity of world.query(Transform)) {
      const transform = world.getComponent(entity, Transform);
      transform.position[0] = Math.sin(elapsedSeconds) * 2;
      transform.position[1] = Math.cos(elapsedSeconds) * 2;
      transform.position[2] = 0;
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
  }
}
