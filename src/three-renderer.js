import * as THREE from 'three';
import { MeshRenderer, OutlineRenderer, ShadowRenderer, Texture, Transform, Water, LineRenderer, EnemyAreaRenderer } from './components.js';

function colorFrom(value, fallback = [1, 1, 1]) {
  const channels = Array.isArray(value) ? value : fallback;
  return new THREE.Color(...channels);
}

function geometryFromMesh(mesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertices ?? new Float32Array(), 3));
  if (mesh.normals?.length) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  if (mesh.colors?.length) geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
  if (mesh.uvs?.length) geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
  if (mesh.indices?.length) geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  if (!mesh.normals?.length) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function textureFrom(texture) {
  if (!texture?.image) return null;
  if (!texture.threeTexture) {
    texture.threeTexture = new THREE.Texture(texture.image);
    texture.threeTexture.colorSpace = THREE.SRGBColorSpace;
    texture.threeTexture.needsUpdate = true;
  }
  return texture.threeTexture;
}

function createMaterial(mesh, texture, transparent = false) {
  return new THREE.MeshStandardMaterial({
    color: colorFrom(mesh.material?.diffuseColor),
    map: textureFrom(mesh.material?.texture ?? texture),
    vertexColors: Boolean(mesh.colors?.length),
    roughness: 0.82,
    metalness: 0,
    transparent,
    opacity: transparent ? 0.24 : 1,
    side: THREE.DoubleSide,
  });
}

export class ThreeRenderSystem {
  constructor(canvas, camera, skyColor, lighting = {}, fog = {}) {
    this.canvas = canvas;
    this.sourceCamera = camera;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = colorFrom(skyColor, [0.039, 0.051, 0.047]);
    this.scene.fog = new THREE.Fog(colorFrom(fog.color, [0.63, 0.69, 0.68]), Number(fog.near ?? 180), Number(fog.far ?? 850));
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.entityObjects = new Map();

    const ambient = lighting.ambientColor ?? [1, 1, 1];
    this.scene.add(new THREE.AmbientLight(colorFrom(ambient), Number(lighting.ambientIntensity ?? 1)));
    const directional = lighting.directional ?? {};
    const directionalLight = new THREE.DirectionalLight(colorFrom(directional.color, [1, 0.95, 0.85]), Number(directional.intensity ?? 0.8));
    directionalLight.position.set(...(directional.direction ?? [-0.45, 0.85, 0.35])).multiplyScalar(-45);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(1024, 1024);
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 160;
    this.scene.add(directionalLight);
    for (const point of lighting.pointLights ?? []) {
      const light = new THREE.PointLight(colorFrom(point.color, [1, 0.72, 0.45]), point.intensity ?? 2, point.distance ?? 18);
      light.position.set(...(point.position ?? [0, 8, 0]));
      this.scene.add(light);
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  syncCamera() {
    const source = this.sourceCamera;
    source.updatePosition();
    this.camera.position.set(...source.position);
    const direction = new THREE.Vector3(
      -Math.sin(source.yaw) * Math.cos(source.pitch),
      Math.sin(source.pitch),
      -Math.cos(source.yaw) * Math.cos(source.pitch),
    );
    this.camera.lookAt(this.camera.position.clone().add(direction));
  }

  createObject(renderer, texture, isWater, isEnemyArea) {
    const group = new THREE.Group();
    for (const mesh of renderer.meshes ?? []) {
      const object = new THREE.Mesh(
        geometryFromMesh(mesh),
        createMaterial(mesh, texture, isEnemyArea),
      );
      object.castShadow = renderer.castShadow !== false;
      object.receiveShadow = renderer.receiveLight !== false;
      if (isWater) object.material.color.setRGB(0.08, 0.45, 0.7);
      group.add(object);
    }
    return group;
  }

  updateObject(entity, world) {
    const transform = world.getComponent(entity, Transform);
    const renderer = world.getComponent(entity, MeshRenderer);
    const texture = world.getComponent(entity, Texture);
    const water = world.getComponent(entity, Water);
    let object = this.entityObjects.get(entity);
    if (!object) {
      object = this.createObject(renderer, texture, Boolean(water), Boolean(world.getComponent(entity, EnemyAreaRenderer)));
      this.root.add(object);
      this.entityObjects.set(entity, object);
    }
    object.position.set(...transform.position);
    object.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
    object.scale.set(...transform.scale);
    return object;
  }

  updateRing(component, transform, time, color) {
    const radius = component.radius * (1 + Math.sin(time * 0.006) * 0.08);
    const shape = new THREE.RingGeometry(Math.max(0, radius - component.thickness), radius, component.segments);
    const material = new THREE.MeshBasicMaterial({ color: colorFrom(color), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(shape, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(transform.position[0], transform.position[1] + 0.04, transform.position[2]);
    return ring;
  }

  render(world, time = 0) {
    this.syncCamera();
    for (const entity of world.query(Transform, MeshRenderer)) this.updateObject(entity, world);
    for (const entity of world.query(Transform, ShadowRenderer)) {
      const object = this.entityObjects.get(entity);
      if (object) object.traverse((child) => { child.castShadow = true; });
    }
    for (const entity of world.query(LineRenderer)) {
      const line = world.getComponent(entity, LineRenderer);
      let object = this.entityObjects.get(`line-${entity}`);
      if (object) this.root.remove(object);
      if (!line.indices?.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(line.vertices, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(line.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(line.indices, 1));
      object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, depthWrite: false }));
      this.root.add(object);
      this.entityObjects.set(`line-${entity}`, object);
    }
    for (const entity of world.query(Transform, OutlineRenderer)) {
      const outline = world.getComponent(entity, OutlineRenderer);
      const transform = world.getComponent(entity, Transform);
      const key = `outline-${entity}`;
      const old = this.entityObjects.get(key);
      if (old) this.root.remove(old);
      if (outline.active) {
        const ring = this.updateRing(outline, transform, time, outline.color);
        this.root.add(ring);
        this.entityObjects.set(key, ring);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
