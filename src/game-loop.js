import { SoundListener } from './components.js';

export function startGameLoop({
  world,
  movementSystem,
  animationSystem,
  networkInterpolationSystem,
  soundListenerSystem,
  soundPlayerSystem,
  multiplayerSystem,
  PlayerPathSystem,
  nameTagSystem,
  enemyHoverSystem,
  renderSystem,
}) {
  let previousTime = 0;

  function frame(time) {
    const deltaSeconds = Math.min((time - previousTime) * 0.001, 0.1);
    previousTime = time;

    // A ordem importa: movimento local, rede, interpolacao, marcador e renderizacao.
    animationSystem.update(world, deltaSeconds);
    movementSystem.update(world, deltaSeconds);
    multiplayerSystem.update(world, time);
    networkInterpolationSystem.update(world, deltaSeconds);
    soundListenerSystem.update(world);
    const listener = world.query(SoundListener)[0];
    const listenerComponent = listener ? world.getComponent(listener, SoundListener) : null;
    soundPlayerSystem.update(world, listenerComponent?.context ?? null);
    PlayerPathSystem.update(world, time);
    nameTagSystem.update(world);
    enemyHoverSystem.update(world);
    renderSystem.render(world, time);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}