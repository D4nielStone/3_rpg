import {
  EnemyIdentity,
  EnemyHealthBar,
  AnimationPlayer,
  MeshRenderer,
  NameTag,
  NetworkTransform,
  OutlineRenderer,
  Transform,
} from './components.js';

export function addRemoteEnemy(world, enemyAssets, enemy) {
  const asset = enemyAssets?.get(enemy?.model);

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
    meshes: asset.mesh.meshes,
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