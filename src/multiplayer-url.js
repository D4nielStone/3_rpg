const productionRelayUrl = 'wss://webgl-rpg-multiplayer.onrender.com';

function normalizeMultiplayerUrl(value) {
  return value
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:')
    .replace(/\/$/, '');
}

export function getMultiplayerUrl() {
  const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL?.trim();
  if (configuredUrl) return normalizeMultiplayerUrl(configuredUrl);
  if (import.meta.env.PROD) return productionRelayUrl;
  const localHost = window.location.hostname;
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${localHost}:5174`;
}

export function getMultiplayerHttpUrl() {
  return getMultiplayerUrl()
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:');
}
