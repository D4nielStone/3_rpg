export const DEFAULT_PLAYER_SCALE = Object.freeze([0.7, 1.4, 0.7]);

export function normalizePlayerScale(scale) {
  if (!Array.isArray(scale) || scale.length !== 3) {
    return [...DEFAULT_PLAYER_SCALE];
  }

  const normalized = scale.map(Number);
  if (!normalized.every((value) => Number.isFinite(value) && value > 0)) {
    return [...DEFAULT_PLAYER_SCALE];
  }

  return normalized;
}