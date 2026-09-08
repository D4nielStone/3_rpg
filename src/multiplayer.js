import {
  EnemyHealthBar,
  EnemyIdentity,
  NameTag,
  NetworkIdentity,
  NetworkTransform,
  MoveTarget,
  Transform,
} from './components.js';

const MESSAGE_LIMIT = 32;
const COMBAT_DISTANCE = 1;

export class MultiplayerSystem {
  constructor({
    url,
    world,
    input = null,
    createRemoteEntity,
    createEnemyEntity = () => null,
    onStatus = () => {},
    onChat = () => {},
    onPlayerState = () => {},
    onDeath = () => {},
    onRespawn = () => {},
  }) {
    this.url = url;
    this.world = world;
    this.input = input;
    this.createRemoteEntity = createRemoteEntity;
    this.createEnemyEntity = createEnemyEntity;
    this.onStatus = onStatus;
    this.onChat = onChat;
    this.onPlayerState = onPlayerState;
    this.onDeath = onDeath;
    this.onRespawn = onRespawn;
    this.socket = null;
    this.localEntity = null;
    this.localPeerId = null;
    this.remoteEntities = new Map();
    this.enemyEntities = new Map();
    this.lastSentAt = 0;
    this.pendingState = null;
    this.localStateRestored = false;
    this.localPlayerDead = false;
    this.attackTargetEntity = null;
    this.lastAttackRequestAt = 0;
  }

  setLocalEntity(entity) {
    this.localEntity = entity;
    if (this.localPeerId) {
      this.world.addComponent(entity, new NetworkIdentity({
        peerId: this.localPeerId,
        isLocal: true,
      }));
    }
  }

  connect({ retry = true } = {}) {
    // Em producao o relay pode acordar depois; por isso a conexao tenta novamente.
    if (!this.url) {
      this.onStatus('URL do relay multiplayer nao configurada.');
      return;
    }

    if (!('WebSocket' in window)) {
      this.onStatus('Multiplayer indisponivel neste navegador.');
      return;
    }

    this.onStatus('Conectando ao multiplayer...');
    this.localStateRestored = false;
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('open', () => this.onStatus('Multiplayer conectado.'));
    this.socket.addEventListener('message', (event) => this.handleMessage(event.data));
    this.socket.addEventListener('close', (event) => {
      this.socket = null;
      if (event.code === 4008) {
        this.onStatus('Este jogador já está aberto em outra aba.');
        return;
      }
      this.onStatus('Multiplayer offline. Inicie o relay para conectar.');
      if (retry) {
        window.setTimeout(() => this.connect({ retry }), 3000);
      }
    });
    this.socket.addEventListener('error', () => this.onStatus('Relay multiplayer indisponivel.'));
  }

  handleMessage(rawMessage) {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (message.type === 'welcome') {
      this.localPeerId = message.peerId;
      if (this.localEntity) this.setLocalEntity(this.localEntity);
      return;
    }

    if (message.type === 'death') {
      this.localPlayerDead = true;
      this.onDeath();
      return;
    }

    if (message.type === 'respawned') {
      // O próximo snapshot contém a posição inicial restaurada pelo servidor.
      this.localStateRestored = false;
      this.localPlayerDead = false;
      this.onRespawn();
      return;
    }

    if (message.type === 'snapshot' && Array.isArray(message.players)) {
      // O snapshot apenas agenda dados; a criacao/remoção ECS ocorre em update().
      this.pendingState = message.players.slice(0, MESSAGE_LIMIT);
      this.pendingEnemies = Array.isArray(message.enemies) ? message.enemies : [];
      return;
    }

    if (message.type === 'chat' && typeof message.text === 'string') {
      this.onChat({
        type: 'chat',
        peerId: message.peerId,
        nickname: message.nickname,
        text: message.text,
        sentAt: message.sentAt,
      });
      return;
    }

    if (message.type === 'system' && typeof message.text === 'string') {
      this.onChat({
        type: 'system',
        text: message.text,
        sentAt: message.sentAt,
      });
    }
  }

  sendChat(text) {
    const message = text.trim();
    if (!message || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;

    this.socket.send(JSON.stringify({ type: 'chat', text: message }));
    return true;
  }

  sendRespawn() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: 'respawn' }));
    return true;
  }

  sendAttack() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: 'attack' }));
    return true;
  }

  setAttackTarget(entity) {
    this.attackTargetEntity = entity;
  }

  update(world, time) {
    this.applySnapshot(world);
    this.updateAttackTarget(world, time);
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.localEntity) return;
    if (this.localPlayerDead) return;
    if (this.input?.consumePressed('f')) {
      this.sendAttack();
    }
    if (time - this.lastSentAt < 50) return;

    const transform = world.getComponent(this.localEntity, Transform);
    if (!transform) return;
    this.socket.send(JSON.stringify({
      type: 'state',
      position: transform.position,
      rotation: transform.rotation,
    }));
    this.lastSentAt = time;
  }

  updateAttackTarget(world, time) {
    if (!this.attackTargetEntity) return;
    const targetTransform = world.getComponent(this.attackTargetEntity, Transform);
    const playerTransform = world.getComponent(this.localEntity, Transform);
    const moveTarget = world.getComponent(this.localEntity, MoveTarget);
    if (!targetTransform || !playerTransform || !moveTarget) {
      this.attackTargetEntity = null;
      if (moveTarget) moveTarget.position = null;
      return;
    }

    const deltaX = targetTransform.position[0] - playerTransform.position[0];
    const deltaZ = targetTransform.position[2] - playerTransform.position[2];
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance > COMBAT_DISTANCE) {
      moveTarget.position = [
        targetTransform.position[0] - deltaX / distance * COMBAT_DISTANCE,
        targetTransform.position[1],
        targetTransform.position[2] - deltaZ / distance * COMBAT_DISTANCE,
      ];
    } else {
      moveTarget.position = null;
    }
    if (distance <= 1 && time - this.lastAttackRequestAt >= 200) {
      if (this.sendAttack()) this.lastAttackRequestAt = time;
    }
  }

  applySnapshot(world) {
    if (!this.pendingState) return;
    const activePeers = new Set();

    for (const player of this.pendingState) {
      if (player.peerId === this.localPeerId) {
        this.localPlayerDead = Boolean(player.dead);
        if (!this.localStateRestored && Array.isArray(player.position) && Array.isArray(player.rotation)) {
          const transform = world.getComponent(this.localEntity, Transform);
          if (transform) {
            transform.position = [...player.position];
            transform.rotation = [...player.rotation];
          }
          this.localStateRestored = true;
        }
        const localNameTag = world.getComponent(this.localEntity, NameTag);
        localNameTag?.update(player.nickname, player.level);
        this.onPlayerState(player);
        continue;
      }
      if (!player.peerId) continue;
      activePeers.add(player.peerId);
      let entity = this.remoteEntities.get(player.peerId);
      if (!entity) {
        entity = this.createRemoteEntity(player.peerId, player.nickname, player.level);
        this.remoteEntities.set(player.peerId, entity);
      }

      const nameTag = world.getComponent(entity, NameTag);
      nameTag?.update(player.nickname, player.level);

      const networkTransform = world.getComponent(entity, NetworkTransform);
      if (networkTransform) {
        networkTransform.targetPosition = player.position;
        networkTransform.targetRotation = player.rotation;
      }
    }

    const activeEnemies = new Set();
    for (const enemy of this.pendingEnemies ?? []) {
      if (!enemy.id || !Array.isArray(enemy.position)) continue;
      activeEnemies.add(enemy.id);
      let entity = this.enemyEntities.get(enemy.id);
      if (!entity) {
        entity = this.createEnemyEntity(enemy);
        if (!entity) continue;
        this.enemyEntities.set(enemy.id, entity);
      }
      const transform = world.getComponent(entity, Transform);
      const networkTransform = world.getComponent(entity, NetworkTransform);
      if (networkTransform) {
        networkTransform.targetPosition = enemy.position;
        networkTransform.targetRotation = [0, enemy.rotationY ?? 0, 0];
      } else if (transform) {
        transform.position = [...enemy.position];
        transform.rotation[1] = enemy.rotationY ?? 0;
      }
      const nameTag = world.getComponent(entity, NameTag);
      nameTag?.update(enemy.name, enemy.level, enemy.alerted);
      const healthBar = world.getComponent(entity, EnemyHealthBar);
      healthBar?.update(enemy.hp, enemy.maxHp);
      const enemyIdentity = world.getComponent(entity, EnemyIdentity);
      if (enemyIdentity) enemyIdentity.type = enemy.type;
    }

    for (const [peerId, entity] of this.remoteEntities) {
      if (!activePeers.has(peerId)) {
        world.removeEntity(entity);
        this.remoteEntities.delete(peerId);
      }
    }
    for (const [enemyId, entity] of this.enemyEntities) {
      if (!activeEnemies.has(enemyId)) {
        world.removeEntity(entity);
        this.enemyEntities.delete(enemyId);
      }
    }
    this.pendingState = null;
  }
}