import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const TRANSFORM_MODES = new Set(['translate', 'rotate', 'scale']);
const AXIS_LINE_LENGTH = 5000;

function createAxisGuides() {
  const guides = new THREE.Group();
  const axes = [
    { key: 'X', end: [1, 0, 0], color: 0xff4d4d },
    { key: 'Y', end: [0, 1, 0], color: 0x72e06a },
    { key: 'Z', end: [0, 0, 1], color: 0x4d9dff },
  ];

  axes.forEach(({ key, end, color }) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-end[0] * AXIS_LINE_LENGTH, -end[1] * AXIS_LINE_LENGTH, -end[2] * AXIS_LINE_LENGTH),
      new THREE.Vector3(end[0] * AXIS_LINE_LENGTH, end[1] * AXIS_LINE_LENGTH, end[2] * AXIS_LINE_LENGTH),
    ]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = key;
    line.visible = false;
    guides.add(line);
  });

  guides.renderOrder = 999;
  guides.visible = false;
  return guides;
}

// Compatível com versões antigas (TransformControls é o próprio Object3D)
// e novas (o gizmo visual fica em controls.getHelper()).
function getGizmoVisual(controls) {
  return typeof controls.getHelper === 'function' ? controls.getHelper() : controls;
}

function applyBlenderGizmoStyle(controls) {
  controls.setSize(1.25);

  const visual = getGizmoVisual(controls);
  if (typeof visual.traverse !== 'function') return;

  visual.traverse((child) => {
    if (!child.material) return;
    const material = child.material;
    material.depthTest = false;
    material.depthWrite = false;
    material.toneMapped = false;
    if ('opacity' in material) material.opacity = Math.max(material.opacity, 0.95);
  });
}

export function createEditorGizmos({ camera, canvas, scene, onDraggingChanged, onObjectChange }) {
  const controls = new TransformControls(camera, canvas);
  const gizmoVisual = getGizmoVisual(controls);
  const guides = createAxisGuides();
  const worldPosition = new THREE.Vector3();
  let mode = 'select';

  controls.setSpace('world');
  applyBlenderGizmoStyle(controls);

  scene.add(gizmoVisual);
  scene.add(guides);

  function update(object = controls.object) {
    const visible = TRANSFORM_MODES.has(mode) && Boolean(object);
    controls.visible = visible;
    guides.visible = visible && controls.dragging;
    if (object) guides.position.copy(object.getWorldPosition(worldPosition));
  }

  function updateGuideAxis() {
    const activeAxis = controls.axis || '';
    guides.children.forEach((line) => {
      line.visible = controls.dragging && activeAxis.includes(line.name);
    });
  }

  controls.addEventListener('dragging-changed', (event) => {
    onDraggingChanged?.(event);
    update();
    updateGuideAxis();
  });
  controls.addEventListener('change', updateGuideAxis);
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