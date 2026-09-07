export class InputState {
  constructor(target = window) {
    this.keys = new Set();
    target.addEventListener('keydown', (event) => {
      this.keys.add(event.key.toLowerCase());
    });
    target.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
    target.addEventListener('blur', () => this.keys.clear());
  }

  isPressed(...keys) {
    return keys.some((key) => this.keys.has(key));
  }
}
