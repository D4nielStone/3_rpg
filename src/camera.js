import {
  multiplyMatrices,
  perspective,
  rotationX,
  rotationY,
  translation,
} from './math.js';

export class Camera {
  constructor({
    fieldOfView = Math.PI / 4,
    aspect = 1,
    near = 0.1,
    far = 100,
    position = [0, 0, 5],
    pitch = 0,
    yaw = 0,
  } = {}) {
    this.fieldOfView = fieldOfView;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.position = [...position];
    this.pitch = pitch;
    this.yaw = yaw;
  }

  setAspect(aspect) {
    this.aspect = aspect;
  }

  getProjectionMatrix() {
    return perspective(this.fieldOfView, this.aspect, this.near, this.far);
  }

  getViewMatrix() {
    const [x, y, z] = this.position;
    const inverseRotation = multiplyMatrices(
      rotationX(-this.pitch),
      rotationY(-this.yaw),
    );
    return multiplyMatrices(inverseRotation, translation(-x, -y, -z));
  }
}
