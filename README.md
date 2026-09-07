# WebGL RPG

Projeto simples de renderizacao 3D com WebGL, Vite e ECS.

## Requisitos

- Node.js instalado
- Navegador com suporte a WebGL

## Configuracao

Dentro da pasta do projeto, instale as dependencias:

```bash
npm install
```

No PowerShell do Windows, caso `npm` seja bloqueado pela politica de scripts, use:

```powershell
npm.cmd install
```

## Executar em desenvolvimento

Inicie o servidor local:

```bash
npm run dev
```

No Windows, use `npm.cmd run dev` se necessario.

Abra a URL exibida pelo Vite, normalmente:

```text
http://localhost:5173/
```

## Gerar build

Para criar a versao de producao:

```bash
npm run build
```

Para testar o build localmente:

```bash
npm run preview
```

## Estrutura principal

```text
src/
  main.js          Inicializacao da aplicacao e loop principal
  game-setup.js    Criacao do WebGL, mundo ECS e sistemas
  player-factory.js Criacao de jogadores locais e remotos
  game-loop.js     Ordem de atualizacao e renderizacao por frame
  ecs.js           Entidades, componentes e consultas do ECS
  components.js    Transform, MeshRenderer e Texture
  systems.js       Sistemas de movimento e renderizacao
  input.js         Estado do teclado
  camera.js        Camera perspectiva e orbital
  asset-loader.js  Carregamento de modelos 3D
  texture-manager.js Gerenciamento de texturas
  math.js          Operacoes com matrizes
  webgl.js         Shaders, buffers e texturas WebGL
  cube.js          Geometria de exemplo
public/models/     Modelos 3D usados pela aplicacao
```

## ECS em resumo

Uma entidade recebe componentes no `World`:

```js
const entity = world.createEntity();
world.addComponent(entity, new Transform());
world.addComponent(entity, meshRenderer);
```

Os sistemas consultam as entidades pelos componentes necessarios e atualizam ou desenham cada uma.

## Movimentacao

Clique no terreno para criar um destino. Um circulo azul marca a posicao e o jogador segue ate ela usando o `MovementSystem`. Pressione `Space` para cancelar o destino e remover o marcador. A camera orbital acompanha o `Transform` do jogador.

## Multiplayer

O multiplayer usa um relay WebSocket separado. Em um terminal, inicie o relay:

```bash
npm run multiplayer
```

Em outro terminal, inicie o Vite:

```bash
npm run dev
```

Abra a URL do Vite em duas abas ou navegadores. Cada cliente envia seu `Transform`; o `MultiplayerSystem` cria entidades remotas com `NetworkIdentity` e `NetworkTransform`, e o `NetworkInterpolationSystem` suaviza os snapshots antes da renderizacao. Se o relay nao estiver ativo, o jogo continua funcionando localmente.

O painel de chat usa a mesma conexao multiplayer. Digite a mensagem no campo no canto inferior direito e pressione `Enviar` ou `Enter`. O relay retransmite mensagens com ate 200 caracteres para todos os jogadores conectados.

O relay registra conexoes, desconexoes, mensagens de chat e mensagens invalidas no terminal com nivel (`INFO`, `WARN` ou `ERROR`), timestamp ISO e contexto JSON. A entrada e a saida de cada usuario tambem aparecem no chat como mensagens do servidor.

A URL do Web Service do Render e a URL do relay, nao a pagina do jogo. Abrir essa URL diretamente mostra o status JSON do servidor; o jogo deve ser publicado separadamente como Static Site.

### Publicar o relay no Render

O arquivo `render.yaml` ja configura o relay como um Web Service Node. No Render, escolha **New > Blueprint** e conecte o repositorio. O Render executara `npm ci`, iniciara `npm run multiplayer` e verificara `/health`.

Depois do deploy, copie a URL do servico, por exemplo `https://webgl-rpg-multiplayer.onrender.com`. No deploy do frontend, defina a variavel de build `VITE_MULTIPLAYER_URL` com o endereco WebSocket correspondente:

```text
wss://webgl-rpg-multiplayer.onrender.com
```

Se o frontend tambem estiver no Render, crie um **Static Site** com `npm ci && npm run build`, diretorio publicado `dist` e essa mesma variavel em **Environment**. O relay usa a variavel `PORT` fornecida pelo Render automaticamente.

Depois de criar ou alterar `VITE_MULTIPLAYER_URL`, faca um novo deploy do Static Site, pois variaveis `VITE_*` sao incorporadas durante o build. Use **a URL do servico do relay**, e nao a URL do frontend, sem porta e sem barra final:

```text
VITE_MULTIPLAYER_URL=wss://webgl-rpg-multiplayer.onrender.com
```

O cliente tambem converte automaticamente `https://` para `wss://` e tenta reconectar a cada 3 segundos. Sem essa variavel em producao, o jogo exibira uma mensagem de configuracao em vez de tentar `frontend.onrender.com:5174`.

## Adicionar um modelo

Coloque o modelo em `public/models/` e carregue-o pelo caminho publico correspondente:

```js
const asset = await loadAsset('/models/meu-modelo.glb');
```

O arquivo precisa ser acessivel pelo servidor Vite. Para modelos com texturas, use o `TextureManager` existente no projeto.
