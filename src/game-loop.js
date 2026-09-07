export function startGameLoop({
  gl,
  world,
  movementSystem,
  networkInterpolationSystem,
  multiplayerSystem,
  lineSystem,
  renderSystem,
}) {
  let previousTime = 0;

  function frame(time) {
    const deltaSeconds = Math.min((time - previousTime) * 0.001, 0.1);
    previousTime = time;

    gl.clearColor(0.04, 0.06, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    movementSystem.update(world, deltaSeconds);
    multiplayerSystem.update(world, time);
    networkInterpolationSystem.update(world, deltaSeconds);
    lineSystem.update(world);
    renderSystem.render(world);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}