import { NetworkIdentity, NetworkTransform, Transform } from './components.js';

const MESSAGE_LIMIT = 32;

export class MultiplayerSystem {
  constructor({
    url,
    world,
    createRemoteEntity,
    onStatus = () => {},
    onChat = () => {},
    onPlayerState = () => {},
  }) {
    this.url = url;
    this.world = world;
    this.createRemoteEntity = createRemoteEntity;
    this.onStatus = onStatus;
    this.onChat = onChat;
    this.onPlayerState = onPlayerState;
    this.socket = null;
    this.localEntity = null;
    this.localPeerId = null;
    this.remoteEntities = new Map();
    this.lastSentAt = 0;
    this.pendingState = null;
    this.localStateRestored = false;
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

    if (message.type === 'snapshot' && Array.isArray(message.players)) {
      // O snapshot apenas agenda dados; a criacao/remoção ECS ocorre em update().
      this.pendingState = message.players.slice(0, MESSAGE_LIMIT);
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

  update(world, time) {
    this.applySnapshot(world);
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.localEntity) return;
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

  applySnapshot(world) {
    if (!this.pendingState) return;
    const activePeers = new Set();

    for (const player of this.pendingState) {
      if (player.peerId === this.localPeerId) {
        if (!this.localStateRestored && Array.isArray(player.position) && Array.isArray(player.rotation)) {
          const transform = world.getComponent(this.localEntity, Transform);
          if (transform) {
            transform.position = [...player.position];
            transform.rotation = [...player.rotation];
          }
          this.localStateRestored = true;
        }
        this.onPlayerState(player);
        continue;
      }
      if (!player.peerId) continue;
      activePeers.add(player.peerId);
      let entity = this.remoteEntities.get(player.peerId);
      if (!entity) {
        entity = this.createRemoteEntity(player.peerId, player.nickname);
        this.remoteEntities.set(player.peerId, entity);
      }

      const networkTransform = world.getComponent(entity, NetworkTransform);
      if (networkTransform) {
        networkTransform.targetPosition = player.position;
        networkTransform.targetRotation = player.rotation;
      }
    }

    for (const [peerId, entity] of this.remoteEntities) {
      if (!activePeers.has(peerId)) {
        world.removeEntity(entity);
        this.remoteEntities.delete(peerId);
      }
    }
    this.pendingState = null;
  }
}