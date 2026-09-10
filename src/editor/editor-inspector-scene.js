export function createSceneInspector({ lighting, onChange }) {
  const colorInput = document.querySelector('#ambient-color');
  const intensityInput = document.querySelector('#ambient-intensity');
  const intensityValue = document.querySelector('#ambient-intensity-value');

  function normalize() {
    lighting.ambientColor = [0, 1, 2].map((index) => {
      const value = Number(lighting.ambientColor?.[index]);
      return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
    });
    const intensity = Number(lighting.ambientIntensity);
    lighting.ambientIntensity = Number.isFinite(intensity) ? Math.min(2, Math.max(0, intensity)) : 1;
  }

  function update() {
    normalize();
    colorInput.value = `#${lighting.ambientColor.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;
    intensityInput.value = lighting.ambientIntensity;
    intensityValue.textContent = lighting.ambientIntensity.toFixed(2);
  }

  colorInput.addEventListener('input', () => {
    const hex = colorInput.value.slice(1);
    lighting.ambientColor = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
    onChange?.();
  });
  intensityInput.addEventListener('input', () => {
    lighting.ambientIntensity = Number(intensityInput.value);
    intensityValue.textContent = lighting.ambientIntensity.toFixed(2);
    onChange?.();
  });

  return { update, normalize };
}
