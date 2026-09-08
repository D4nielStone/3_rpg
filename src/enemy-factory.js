import {
  EnemyIdentity,
  EnemyHealthBar,
  AnimationPlayer,
  ShadowRenderer,
  MeshRenderer,
  NameTag,
  NetworkTransform,
  OutlineRenderer,
  Transform,
} from './components.js';

export function addRemoteEnemy(world, enemyAssets, enemy) {
  console.log('=== ADD REMOTE ENEMY ===');
  console.log('enemy:', enemy);
  console.log('enemy.model:', enemy?.model);
  console.log('enemyAssets:', enemyAssets);
  console.log('enemyAssets instanceof Map:', enemyAssets instanceof Map);

  if (enemyAssets instanceof Map) {
    console.log('Chaves disponíveis:', [...enemyAssets.keys()]);
  }

  const asset = enemyAssets?.get(enemy?.model);

  console.log('asset encontrado:', asset);

  if (!asset) {
    console.error(
      `Asset não encontrado para o modelo: "${enemy?.model}"`
    );
    return null;
  }

  const entity = world.createEntity();
  const scale = Number(enemy.scale) || 1;
  world.addComponent(entity, new Transform({
    position: enemy.position,
    scale: [scale, scale, scale],
  }));
  world.addComponent(entity, new EnemyIdentity({
    enemyId: enemy.id,
    type: enemy.type,
  }));
  world.addComponent(entity, new ShadowRenderer({ radius: [0.55, 0.32] }));
  world.addComponent(entity, new EnemyHealthBar({
    hp: enemy.hp,
    maxHp: enemy.maxHp,
  }));
  world.addComponent(entity, new NetworkTransform());
  world.addComponent(entity, new OutlineRenderer());
  world.addComponent(entity, new NameTag({
    text: enemy.name,
    level: enemy.level,
    alerted: enemy.alerted,
  }));
  const mesh = new MeshRenderer({
    vertices: asset.mesh.vertices,
    colors: asset.mesh.colors,
    indices: asset.mesh.indices,
    uvs: asset.mesh.uvs,
    texture: asset.texture,
  });
  world.addComponent(entity, mesh);
  if (asset.animations?.length && asset.animationMixer) {
    world.addComponent(entity, new AnimationPlayer({
      animations: asset.animations,
      mixer: asset.animationMixer,
      onUpdate: asset.animationUpdate,
    }));
  }
  if (asset.texture) world.addComponent(entity, asset.texture);
  return entity;
}