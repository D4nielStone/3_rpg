const MIN_SCALE = 0.75;
const MAX_SCALE = 1.25;
const SCALE_STEP = 0.1;

export class InterfaceScale {
  constructor({ root, decreaseButton, increaseButton }) {
    this.root = root;
    this.scale = window.matchMedia('(max-width: 640px)').matches ? 0.9 : 1;
    decreaseButton.addEventListener('click', () => this.change(-SCALE_STEP));
    increaseButton.addEventListener('click', () => this.change(SCALE_STEP));
    this.render();
  }

  change(amount) {
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale + amount));
    this.render();
  }

  render() {
    this.root.style.setProperty('--ui-scale', this.scale.toFixed(2));
  }
}