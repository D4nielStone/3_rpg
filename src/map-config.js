export const MAP_CONFIG_STORAGE_KEY = 'webrpg-map-config';

export function readSavedMapConfig(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(MAP_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const config = JSON.parse(raw);
    return config && typeof config === 'object' ? config : null;
  } catch {
    return null;
  }
}

export function saveMapConfig(config, storage = globalThis.localStorage) {
  storage?.setItem(MAP_CONFIG_STORAGE_KEY, JSON.stringify(config));
}
