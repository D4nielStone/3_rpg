function colliderBounds(entity) {
  if (!entity?.collision?.enabled) return null;
  const scale = entity.scale ?? [1, 1, 1];
  const halfX = Math.max(0.25, Math.abs(Number(scale[0]) || 1) * 0.5);
  const halfZ = Math.max(0.25, Math.abs(Number(scale[2]) || 1) * 0.5);
  return {
    minX: entity.position[0] - halfX,
    maxX: entity.position[0] + halfX,
    minZ: entity.position[2] - halfZ,
    maxZ: entity.position[2] + halfZ,
  };
}

export function collidesWithMap(position, mapConfig, radius = 0.35) {
  return (mapConfig?.entities ?? []).some((entity) => {
    const bounds = colliderBounds(entity);
    if (!bounds) return false;
    return position[0] + radius > bounds.minX
      && position[0] - radius < bounds.maxX
      && position[2] + radius > bounds.minZ
      && position[2] - radius < bounds.maxZ;
  });
}
