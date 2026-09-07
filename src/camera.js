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
    this.orbit = null;
  }

  setAspect(aspect) {
    this.aspect = aspect;
  }

  getProjectionMatrix() {
    return perspective(this.fieldOfView, this.aspect, this.near, this.far);
  }

  updatePosition() {
    if (this.orbit) {
      const { target, distance, azimuth, elevation, targetHeight } = this.orbit;
      const cosineElevation = Math.cos(elevation);
      const finalX = target.position[0] +
        Math.sin(azimuth) * cosineElevation * distance;
      const finalY = target.position[1] +
        targetHeight + Math.sin(elevation) * distance;
      const finalZ = target.position[2] +
        Math.cos(azimuth) * cosineElevation * distance;
      const smoothing = 0.1;
      this.position[0] += (finalX - this.position[0]) * smoothing;
      this.position[1] += (finalY - this.position[1]) * smoothing;
      this.position[2] += (finalZ - this.position[2]) * smoothing;
      this.pitch = -elevation;
      this.yaw = azimuth;
    }
  }

  getViewMatrix() {
    this.updatePosition();
    const [x, y, z] = this.position;
    const inverseRotation = multiplyMatrices(
      rotationX(-this.pitch),
      rotationY(-this.yaw),
    );
    return multiplyMatrices(inverseRotation, translation(-x, -y, -z));
  }

  orbitalFollow(transform, {
    distance = 6,
    azimuth = 0,
    elevation = 0.35,
    targetHeight = 0,
  } = {}) {
    this.orbit = {
      target: transform,
      distance,
      azimuth,
      elevation,
      targetHeight,
    };
  }
}
