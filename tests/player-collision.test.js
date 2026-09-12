import test from 'node:test';
import assert from 'node:assert/strict';

import { PhysicsWorld } from '../src/physics-world.js';

test('bloqueia movimento do jogador ao colidir com objeto estático', () => {
  const world = new PhysicsWorld({
    entities: [{
      position: [0, 0, 0],
      scale: [2, 2, 2],
      collision: { enabled: true, shape: 'box' },
    }],
  });

  const result = world.movePlayer('player', [3, 0, 3], [0.5, 0, 0.5], 0.016);

  assert.ok(Math.abs(result[0] - 3) < 0.01, `X deveria permanecer em 3, mas ficou ${result[0]}`);
  assert.ok(Math.abs(result[2] - 3) < 0.01, `Z deveria permanecer em 3, mas ficou ${result[2]}`);
});

test('aplica gravidade ao jogador durante o passo fisico', () => {
  const world = new PhysicsWorld();

  const result = world.movePlayer('player', [3, 5, 3], [3, 5, 3], 0.1);

  assert.ok(result[1] < 5, `Y deveria diminuir com a gravidade, mas ficou ${result[1]}`);
});

test('permite caminhar sobre um collider de chão fino', () => {
  const world = new PhysicsWorld({
    entities: [{
      id: 'ground',
      name: 'Chão',
      position: [0, 0, 0],
      scale: [1000, 0.1, 1000],
      collision: { enabled: true, shape: 'box' },
    }],
  });

  const path = world.findPath([0, 0, 0], [3, 0, 0]);
  const result = world.stepPlayer('player', [0, 0, 0], [3, 0, 0], 0.1);

  assert.deepEqual(path, [[3, 0, 0]]);
  assert.ok(result[0] > 0.25, `X deveria avançar sobre o chão, mas ficou ${result[0]}`);
});

test('encontra uma rota por fora de um obstaculo', () => {
  const world = new PhysicsWorld({
    entities: [{
      position: [0, 0, 0],
      scale: [2, 2, 2],
      collision: { enabled: true, shape: 'box' },
    }],
  });

  const path = world.findPath([-3, 0, 0], [3, 0, 0]);

  assert.ok(path.length > 1, 'A rota deveria conter um waypoint intermediario.');
  assert.deepEqual(path.at(-1), [3, 0, 0]);
});
