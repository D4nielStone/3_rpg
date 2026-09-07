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

O modelo carregado recebe o componente `PlayerController`. Use as teclas abaixo para mover o personagem:

- `W` ou seta para cima: frente
- `S` ou seta para baixo: tras
- `A` ou seta para esquerda: esquerda
- `D` ou seta para direita: direita

O `MovementSystem` usa o tempo entre frames, entao a velocidade permanece consistente mesmo com variacoes no FPS. A camera orbital acompanha o `Transform` do jogador.

## Adicionar um modelo

Coloque o modelo em `public/models/` e carregue-o pelo caminho publico correspondente:

```js
const asset = await loadAsset('/models/meu-modelo.glb');
```

O arquivo precisa ser acessivel pelo servidor Vite. Para modelos com texturas, use o `TextureManager` existente no projeto.
