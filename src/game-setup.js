import { Camera } from './camera.js';
import { World } from './ecs.js';

import { 
  PlayerPathSystem,
  AnimationSystem,
  MovementSystem,
  NetworkInterpolationSystem,
  RenderSystem,
} from './systems.js';

import { InputState } from './input.js';
import { TextureManager } from './texture-manager.js';
import { createProgram } from './webgl.js';
import { NameTagSystem } from './name-tags.js';
import { EnemyHoverSystem } from './enemy-hover.js';
import { customizeMap } from './map-customization.js';

const vertexShaderSource = `
  precision mediump float;

  attribute vec3 position;
  attribute vec3 vertexColor;
  attribute vec3 normal;
  attribute vec2 uv;

  uniform mat4 matrix;
  uniform mat4 modelMatrix;

  varying vec3 color;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  uniform float isWater;
  uniform float time;

  void main() {
    vec3 animatedPosition = position;

    if (isWater > 0.5) {
      animatedPosition.y += sin(position.x * 1.7 + time * 0.0012) * 0.035;
      animatedPosition.y += cos(position.z * 1.25 + time * 0.0009) * 0.025;
    }

    gl_Position = matrix * vec4(animatedPosition, 1.0);

    color = vertexColor;

    vWorldNormal = normalize(
      (modelMatrix * vec4(normal, 0.0)).xyz
    );
    vWorldPosition = (modelMatrix * vec4(animatedPosition, 1.0)).xyz;

    vUv = uv;
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  varying vec3 color;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  uniform sampler2D uTexture;
  uniform float useTexture;
  uniform float isWater;
  uniform float time;

  uniform vec3 ambientColor;
  uniform float ambientIntensity;
  uniform vec3 diffuseColor;
  uniform vec3 directionalLightDirection;
  uniform vec3 directionalLightColor;
  uniform float directionalLightIntensity;
  const int MAX_POINT_LIGHTS = 8;
  uniform vec3 pointLightPositions[MAX_POINT_LIGHTS];
  uniform vec3 pointLightColors[MAX_POINT_LIGHTS];
  uniform float pointLightIntensities[MAX_POINT_LIGHTS];
  uniform float pointLightDistances[MAX_POINT_LIGHTS];
  uniform int pointLightCount;
  uniform float isShadow;
  uniform float isEnemyArea;

  void main() {
    vec3 finalColor;
    float alpha = 1.0;

    if (isShadow > 0.5) {
      finalColor = vec3(0.02, 0.025, 0.04);
      alpha = 0.38;
    } else if (isEnemyArea > 0.5) {
      finalColor = vec3(0.015, 0.06, 0.16);
      alpha = 0.24;
    } else {
      vec3 baseColor;
      if (isWater > 0.5) {
        vec2 movingUv = vUv +
          vec2(
            time * 0.00008,
            time * 0.00005
          );

        float bands = sin(
          (movingUv.x + movingUv.y) * 2.0
        );

        float highlights = smoothstep(
          0.35,
          0.85,
          bands
        );

        baseColor = mix(
          vec3(0.035, 0.28, 0.55),
          vec3(0.12, 0.68, 0.82),
          highlights
        );
      } else {
        baseColor =
          useTexture > 0.5
            ? texture2D(uTexture, vUv).rgb
            : color;
      }

      vec3 normal = normalize(vWorldNormal);
      float directionalDiffuse = max(dot(normal, normalize(directionalLightDirection)), 0.0);
      vec3 light = ambientColor * ambientIntensity;
      light += directionalLightColor * directionalDiffuse * directionalLightIntensity;
      for (int index = 0; index < MAX_POINT_LIGHTS; index++) {
        if (index >= pointLightCount) break;
        vec3 pointVector = pointLightPositions[index] - vWorldPosition;
        float pointDistance = length(pointVector);
        float pointDiffuse = max(dot(normal, normalize(pointVector)), 0.0);
        float attenuation = 1.0 / (1.0 + pointDistance / max(pointLightDistances[index], 0.001));
        light += pointLightColors[index] * pointDiffuse * pointLightIntensities[index] * attenuation;
      }
      finalColor = baseColor * diffuseColor * light;
    }

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

function resizeCanvas(gl, camera, canvas) {
  const pixelRatio = Math.min(
    window.devicePixelRatio || 1,
    2
  );

  const width = Math.max(
    1,
    Math.floor(canvas.clientWidth * pixelRatio)
  );

  const height = Math.max(
    1,
    Math.floor(canvas.clientHeight * pixelRatio)
  );

  if (
    canvas.width === width &&
    canvas.height === height
  ) {
    return;
  }

  canvas.width = width;
  canvas.height = height;

  gl.viewport(
    0,
    0,
    width,
    height
  );

  camera.setAspect(width / height);
}

export function createGame(canvas, status, mapConfig = null) {
  const gl = canvas.getContext('webgl');

  if (!gl) {
    status.textContent =
      'WebGL não está disponível neste navegador.';

    throw new Error(
      'Não foi possível criar o contexto WebGL.'
    );
  }

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);

  const program = createProgram(
    gl,
    vertexShaderSource,
    fragmentShaderSource
  );

  const camera = new Camera();
  const world = new World();
  const textureManager = new TextureManager(gl);
  customizeMap(world, mapConfig, textureManager);
  const pointLights = (mapConfig?.entities ?? [])
    .filter((entity) => entity.type === 'pointLight')
    .map((entity) => ({
      position: entity.position,
      color: entity.light?.color,
      intensity: entity.light?.intensity,
      distance: entity.light?.distance,
    }));
  const lighting = {
    ...(mapConfig?.lighting ?? {}),
    pointLights: pointLights.length ? pointLights : undefined,
  };
  const input = new InputState();

  // Event listener
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    camera.zoom(event.deltaY * 0.01);
  }, { passive: false });
  const ROTATE_SENSITIVITY = 0.005;
  let isRightDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
   // Impede o menu de contexto do navegador ao clicar com o botão direito
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 2) {
      isRightDragging = true;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
    }
  });

  window.addEventListener('mousemove', (event) => {
    if (!isRightDragging) return;

    const deltaX = event.clientX - lastMouseX;
    const deltaY = event.clientY - lastMouseY;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    camera.rotateOrbit(
      deltaX * ROTATE_SENSITIVITY,
      deltaY * ROTATE_SENSITIVITY,
    );
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button === 2) {
      isRightDragging = false;
    }
  });

  const locations = {
    position: gl.getAttribLocation(
      program,
      'position'
    ),

    color: gl.getAttribLocation(
      program,
      'vertexColor'
    ),

    normal: gl.getAttribLocation(
      program,
      'normal'
    ),

    uv: gl.getAttribLocation(
      program,
      'uv'
    ),

    matrix: gl.getUniformLocation(
      program,
      'matrix'
    ),

    modelMatrix: gl.getUniformLocation(
      program,
      'modelMatrix'
    ),

    uTexture: gl.getUniformLocation(
      program,
      'uTexture'
    ),

    useTexture: gl.getUniformLocation(
      program,
      'useTexture'
    ),

    isWater: gl.getUniformLocation(
      program,
      'isWater'
    ),

    time: gl.getUniformLocation(
      program,
      'time'
    ),

    ambientColor: gl.getUniformLocation(
      program,
      'ambientColor'
    ),

    ambientIntensity: gl.getUniformLocation(
      program,
      'ambientIntensity'
    ),

    directionalLightDirection: gl.getUniformLocation(
      program,
      'directionalLightDirection'
    ),

    directionalLightColor: gl.getUniformLocation(
      program,
      'directionalLightColor'
    ),

    directionalLightIntensity: gl.getUniformLocation(
      program,
      'directionalLightIntensity'
    ),

    pointLightPositions: gl.getUniformLocation(
      program,
      'pointLightPositions[0]'
    ),

    pointLightColors: gl.getUniformLocation(
      program,
      'pointLightColors[0]'
    ),

    pointLightIntensities: gl.getUniformLocation(
      program,
      'pointLightIntensities[0]'
    ),

    pointLightDistances: gl.getUniformLocation(
      program,
      'pointLightDistances[0]'
    ),

    pointLightCount: gl.getUniformLocation(
      program,
      'pointLightCount'
    ),

    diffuseColor: gl.getUniformLocation(
      program,
      'diffuseColor'
    ),

    isShadow: gl.getUniformLocation(
      program,
      'isShadow'
    ),

    isEnemyArea: gl.getUniformLocation(
      program,
      'isEnemyArea'
    ),
  };

  resizeCanvas(
    gl,
    camera,
    canvas
  );

  window.addEventListener(
    'resize',
    () => {
      resizeCanvas(
        gl,
        camera,
        canvas
      );
    }
  );

  gl.enable(gl.DEPTH_TEST);

  gl.enableVertexAttribArray(
    locations.position
  );

  gl.enableVertexAttribArray(
    locations.color
  );

  gl.enableVertexAttribArray(
    locations.normal
  );

  gl.enableVertexAttribArray(
    locations.uv
  );

  gl.useProgram(program);

  return {
    gl,
    camera,
    world,
    textureManager,
    skyColor: mapConfig?.scene?.skyColor ?? [0.039, 0.051, 0.047],
    input,

    animationSystem:
      new AnimationSystem(),

    movementSystem:
      new MovementSystem(input, mapConfig),

    networkInterpolationSystem:
      new NetworkInterpolationSystem(),

    PlayerPathSystem:
      new PlayerPathSystem(
        canvas,
        camera
      ),

    nameTagSystem:
      new NameTagSystem(
        canvas,
        camera
      ),

    enemyHoverSystem:
      new EnemyHoverSystem(
        canvas,
        camera
      ),

    renderSystem:
      new RenderSystem(
        gl,
        program,
        locations,
        camera,
        lighting
      ),
  };
}