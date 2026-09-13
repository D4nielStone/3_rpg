export class TextureManager {
  constructor() {
    this.cache = new Map();
  }

  makeImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Falha ao carregar textura: ${url}`));
      image.src = url;
    });
  }

  getKey(value) {
    if (typeof value === 'string') {
      return value;
    }

    if (value && typeof value === 'object') {
      return value.src || value.currentSrc || `inline-texture-${this.cache.size}`;
    }

    return 'default-texture';
  }

  async load(url) {
    const key = this.getKey(url);
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const image = await this.makeImageFromUrl(url);
    this.cache.set(key, image);
    return image;
  }

  ensure(image, key = null) {
    const textureKey = key || this.getKey(image);
    if (this.cache.has(textureKey)) {
      return this.cache.get(textureKey);
    }

    this.cache.set(textureKey, image);
    return image;
  }
}
