import test from 'node:test';
import assert from 'node:assert/strict';

import { isMapAccessAuthorized } from '../server/multiplayer/routes.js';

test('aceita acesso do editor quando a sessao ficou desatualizada mas o usuario continua admin no banco', () => {
  const access = {
    userId: 'user-1',
    expiresAt: Date.now() + 60_000,
  };

  const session = {
    userId: 'user-1',
    nickname: 'Admin',
    isAdmin: false,
  };

  const user = {
    id: 'user-1',
    nickname: 'Admin',
    is_admin: true,
  };

  assert.equal(isMapAccessAuthorized({ access, session, user }), true);
});

test('rejeita ticket expirado mesmo para administrador', () => {
  const access = {
    userId: 'user-1',
    expiresAt: Date.now() - 1,
  };

  const session = {
    userId: 'user-1',
    nickname: 'Admin',
    isAdmin: true,
  };

  const user = {
    id: 'user-1',
    nickname: 'Admin',
    is_admin: true,
  };

  assert.equal(isMapAccessAuthorized({ access, session, user }), false);
});
