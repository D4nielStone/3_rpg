import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const TRANSFORM_MODES = new Set(['translate', 'rotate', 'scale']);

function createAxisGuides() {
  const guides = new THREE.Group();
  const axes = [
    { end: [1, 0, 0], color: 0xff4d4d },
    { end: [0, 1, 0], color: 0x72e06a },
    { end: [0, 0, 1], color: 0x4d9dff },
  ];

  axes.forEach(({ end, color }) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-end[0], -end[1], -end[2]),
      new THREE.Vector3(...end),
    ]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22, depthTest: false });
    guides.add(new THREE.Line(geometry, material));
  });

  guides.renderOrder = 10;
  guides.visible = false;
  return guides;
}

export function createEditorGizmos({ camera, canvas, scene, onDraggingChanged, onObjectChange }) {
  const controls = new TransformControls(camera, canvas);
  const guides = createAxisGuides();
  const worldPosition = new THREE.Vector3();
  let mode = 'select';

  controls.setSize(1.1);
  controls.setSpace('world');
  scene.add(controls);
  scene.add(guides);

  function update(object = controls.object) {
    const visible = TRANSFORM_MODES.has(mode) && Boolean(object);
    controls.visible = visible;
    guides.visible = visible;
    if (object) guides.position.copy(object.getWorldPosition(worldPosition));
  }

  controls.addEventListener('dragging-changed', (event) => onDraggingChanged?.(event));
  controls.addEventListener('objectChange', () => {
    update();
    onObjectChange?.();
  });

  return {
    attach(object) {
      controls.attach(object);
      update(object);
    },
    detach() {
      controls.detach();
      update(null);
    },
    setMode(nextMode) {
      mode = TRANSFORM_MODES.has(nextMode) ? nextMode : 'select';
      if (TRANSFORM_MODES.has(mode)) controls.setMode(mode);
      update();
    },
    update,
  };
}
