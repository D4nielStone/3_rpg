# Configuracao

## Variaveis de ambiente

O relay multiplayer usa estas variaveis:

| Variavel | Obrigatoria | Descricao |
| --- | --- | --- |
| `DATABASE_URL` | Sim | Connection string real do PostgreSQL. |
| `FRONTEND_ORIGIN` | Em producao | Origem exata permitida pelo CORS. |
| `PORT` | Nao | Porta fornecida pela hospedagem; padrao local `5174`. |
| `HOST` | Nao | Interface de rede; padrao `0.0.0.0`. |
| `NODE_ENV` | Nao | Use `production` para habilitar SSL do PostgreSQL. |
| `VITE_MULTIPLAYER_URL` | No frontend publicado | URL WebSocket do relay, usando `wss://`. |

Nunca coloque senhas reais neste arquivo ou no repositorio. Use `.env.example` como modelo local.

## Desenvolvimento local

Crie um arquivo `.env` na raiz, baseado em `.env.example`, e informe uma URL do PostgreSQL local ou de desenvolvimento. O script do relay carrega esse arquivo automaticamente.

Nao copie para o `.env` local a `Internal Database URL` do Render. Hostnames como `dpg-...` sao acessiveis apenas pelos servicos dentro da rede do Render e causam `getaddrinfo ENOTFOUND` no computador local. Para executar fora do Render, use um banco local ou a `External Database URL` exibida na pagina do PostgreSQL no Render.

```powershell
npm.cmd install
npm.cmd run multiplayer
```

Em outro terminal:

```powershell
npm.cmd run dev
```

O frontend local usa automaticamente `ws://localhost:5174` quando `VITE_MULTIPLAYER_URL` nao esta definido.

## Render

O [render.yaml](../render.yaml) cria o banco PostgreSQL e injeta sua `connectionString` em `DATABASE_URL`. Depois de alterar esse arquivo, faca um deploy pelo Blueprint.

No Static Site do frontend, configure durante o build:

```text
VITE_MULTIPLAYER_URL=wss://webgl-rpg-multiplayer.onrender.com
```

No Web Service do relay, configure:

```text
FRONTEND_ORIGIN=https://webgl-rpg-frontend.onrender.com
NODE_ENV=production
```

A origem deve ser exatamente igual a URL que aparece no navegador, sem barra final. O relay nao usa `*` no CORS.

## Autenticacao

- `POST /api/register` cria uma conta.
- `POST /api/login` valida nickname e senha.
- Nicknames aceitos: 2 a 20 caracteres alfanumericos ou `_`.
- Senhas aceitas: 8 a 128 caracteres.
- Senhas sao armazenadas como hash `scrypt` com salt.
- O token de sessao fica apenas no `sessionStorage` do navegador.

### Administrador

A permissao de administrador fica na coluna `users.is_admin` do PostgreSQL. Ela nao e determinada pelo nickname. Para promover uma conta no PostgreSQL do Render:

1. Abra o banco PostgreSQL no Render.
2. Abra **Shell** ou conecte-se usando o **External Database URL** com `psql`.
3. Execute:

```sql
UPDATE users
SET is_admin = TRUE
WHERE nickname = 'Seu nick';
```

Confirme:

```sql
SELECT nickname, is_admin
FROM users
WHERE nickname = 'Seu nick';
```

Para remover a permissao:

```sql
UPDATE users
SET is_admin = FALSE
WHERE nickname = 'Seu nick';
```

Depois de promover ou remover a permissao, faca logout/login novamente para emitir uma nova sessao. O comando `/xp` consulta a permissao da sessao autenticada no servidor.

O jogador guest continua usando um `guestId` anonimo no `localStorage`. Contas e guests compartilham a mesma tabela de estado do jogador, mas usam identidades diferentes.

## Diagnostico

`DATABASE_URL nao configurada`: configure a variavel no ambiente do relay.

`ENOTFOUND host`: a URL ainda usa o hostname de exemplo `host`; substitua pela connection string real.

`ENOTFOUND dpg-...`: a URL interna do Render esta sendo usada fora do Render; troque por `localhost` ou pela URL externa do banco.

Erro de CORS: confirme `FRONTEND_ORIGIN`, faca novo deploy do relay e verifique se o frontend esta usando `https://`/`wss://` em producao.

Conta recusada em outra aba: a mesma identidade so pode ter uma sessao WebSocket ativa por vez.
