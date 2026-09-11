export function promotePlayerToAreaTwo(player, state) {
  if (
    player.level < 3 ||
    player.area?.id !== 'starting-rat-area'
  ) {
    return false;
  }

  const area = state.enemyAreas.find(
    (item) => item.id === 'second-rat-area'
  );

  if (!area) return false;

  player.position = [...area.center];
  player.area = {
    id: area.id,
    name: 'Área dos Ratos 2',
    level: area.areaLevel,
  };

  return true;
}
