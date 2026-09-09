import {
  lerp,
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

    screenToGround(clientX, clientY, canvas, groundY = 0) {
    this.updatePosition();
    const bounds = canvas.getBoundingClientRect();
    const normalizedX = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    const normalizedY = 1 - ((clientY - bounds.top) / bounds.height) * 2;
    const halfHeight = Math.tan(this.fieldOfView / 2);
    const halfWidth = halfHeight * this.aspect;
    const cosinePitch = Math.cos(this.pitch);
    const sinePitch = Math.sin(this.pitch);
    const cosineYaw = Math.cos(this.yaw);
    const sineYaw = Math.sin(this.yaw);
    const forward = [
      -sineYaw * cosinePitch,
      sinePitch,
      -cosineYaw * cosinePitch,
    ];
    const right = [cosineYaw, 0, -sineYaw];
    const up = [
      sineYaw * sinePitch,
      cosinePitch,
      cosineYaw * sinePitch,
    ];
    const direction = [
      forward[0] + right[0] * normalizedX * halfWidth + up[0] * normalizedY * halfHeight,
      forward[1] + right[1] * normalizedX * halfWidth + up[1] * normalizedY * halfHeight,
      forward[2] + right[2] * normalizedX * halfWidth + up[2] * normalizedY * halfHeight,
    ];

    if (Math.abs(direction[1]) < 0.0001) {
      return null;
    }

    const distance = (groundY - this.position[1]) / direction[1];
    if (distance <= 0) {
      return null;
    }

    return [
      this.position[0] + direction[0] * distance,
      groundY,
      this.position[2] + direction[2] * distance,
    ];
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
      this.position[0] = lerp(this.position[0], finalX, smoothing);
      this.position[1] = lerp(this.position[1], finalY, smoothing);
      this.position[2] = lerp(this.position[2], finalZ, smoothing);
      this.lookAt([
        target.position[0],
        target.position[1] + targetHeight,
        target.position[2],
      ], { preserveOrbit: true });
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

  lookAt(target, { preserveOrbit = false } = {}) {
    const targetPosition = target.position ?? target;
    const [targetX, targetY, targetZ] = targetPosition;
    const directionX = targetX - this.position[0];
    const directionY = targetY - this.position[1];
    const directionZ = targetZ - this.position[2];
    const horizontalDistance = Math.hypot(directionX, directionZ);

    if (Math.hypot(directionX, directionY, directionZ) === 0) {
      return;
    }

    if (!preserveOrbit) {
      this.orbit = null;
    }
    this.yaw = Math.atan2(-directionX, -directionZ);
    this.pitch = Math.atan2(directionY, horizontalDistance);
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

  zoom(amount, { minDistance = 2, maxDistance = 14 } = {}) {
    if (!this.orbit) return;
    this.orbit.distance = Math.min(
      maxDistance,
      Math.max(minDistance, this.orbit.distance + amount),
    );
  }

  rotateOrbit(deltaAzimuth, deltaElevation, {
    minElevation = -Math.PI / 2 + 2,
    maxElevation = Math.PI / 2 - 0.5,
  } = {}) {
    if (!this.orbit) return;
    this.orbit.azimuth -= deltaAzimuth;
    this.orbit.elevation = Math.min(
      maxElevation,
      Math.max(minElevation, this.orbit.elevation + deltaElevation),
    );
  }
}
