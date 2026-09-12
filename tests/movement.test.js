import test from 'node:test';
import assert from 'node:assert/strict';

import { MovementSystem } from '../src/systems.js';
import { MoveTarget, PlayerController, Transform } from '../src/components.js';

test('move o jogador por teclado quando o mapa nao tem colisoes', () => {
  const components = new Map([
    [Transform, new Transform({ position: [0, 0, 0] })],
    [PlayerController, new PlayerController({ speed: 3 })],
    [MoveTarget, new MoveTarget()],
  ]);
  const world = {
    query: () => [1],
    getComponent: (_, type) => components.get(type),
  };
  const input = {
    isPressed: (...keys) => keys.includes('d'),
    consumePressed: () => false,
  };

  new MovementSystem(input).update(world, 1);

  assert.ok(components.get(Transform).position[0] > 0);
  assert.equal(components.get(Transform).position[2], 0);
});

test('move o jogador ate um destino de clique', () => {
  const moveTarget = new MoveTarget();
  moveTarget.position = [3, 0, 0];
  const components = new Map([
    [Transform, new Transform({ position: [0, 0, 0] })],
    [PlayerController, new PlayerController({ speed: 3 })],
    [MoveTarget, moveTarget],
  ]);
  const world = {
    query: () => [1],
    getComponent: (_, type) => components.get(type),
  };
  const input = {
    isPressed: () => false,
    consumePressed: () => false,
  };

  new MovementSystem(input).update(world, 0.1);

  assert.ok(components.get(Transform).position[0] > 0);
  assert.deepEqual(moveTarget.path.at(-1), [3, 0, 0]);
});

test('aplica gravidade ao jogador parado', () => {
  const components = new Map([
    [Transform, new Transform({ position: [0, 5, 0] })],
    [PlayerController, new PlayerController({ speed: 3 })],
    [MoveTarget, new MoveTarget()],
  ]);
  const world = {
    query: () => [1],
    getComponent: (_, type) => components.get(type),
  };
  const input = {
    isPressed: () => false,
    consumePressed: () => false,
  };

  new MovementSystem(input).update(world, 0.1);

  assert.ok(components.get(Transform).position[1] < 5);
});