export class World {
  constructor() {
    this.nextEntityId = 0;
    this.components = new Map();
  }

  createEntity() {
    this.nextEntityId += 1;
    return this.nextEntityId;
  }

  addComponent(entity, component) {
    const componentType = component.constructor;
    if (!this.components.has(componentType)) {
      this.components.set(componentType, new Map());
    }

    this.components.get(componentType).set(entity, component);
    return component;
  }

  getComponent(entity, componentType) {
    return this.components.get(componentType)?.get(entity);
  }

  removeEntity(entity) {
    for (const componentMap of this.components.values()) {
      const component = componentMap.get(entity);
      component?.dispose?.();
      componentMap.delete(entity);
    }
  }

  query(...componentTypes) {
    const firstType = componentTypes[0];
    const firstComponents = this.components.get(firstType) ?? new Map();
    const entities = [];

    for (const entity of firstComponents.keys()) {
      const matches = componentTypes.every((componentType) =>
        this.components.get(componentType)?.has(entity),
      );
      if (matches) {
        entities.push(entity);
      }
    }

    return entities;
  }
}
