import test from 'node:test';
import assert from 'node:assert/strict';

import { Camera } from '../src/camera.js';

test('calcula destino mesmo enquanto a camera suaviza abaixo do chao', () => {
  const camera = new Camera({ aspect: 1 });
  camera.orbitalFollow({ position: [0, 0, 0] }, {
    distance: 6,
    elevation: 0.35,
    targetHeight: 0.5,
  });
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  };

  const target = camera.screenToGround(75, 50, canvas);

  assert.ok(target);
  assert.equal(target[1], 0);
});