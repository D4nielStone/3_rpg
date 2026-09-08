function readCredentials(nicknameInput, passwordInput) {
  return {
    nickname: nicknameInput.value.trim(),
    password: passwordInput.value,
  };
}

function validateCredentials({ nickname, password }, messageElement, registration = false) {
  if (nickname.length >= 2 && password.length >= 8) return true;
  messageElement.textContent = registration
    ? 'Use nickname valido e senha com pelo menos 8 caracteres.'
    : 'Use um nickname com 2 caracteres e uma senha com 8.';
  return false;
}

function getHttpUrl() {
  const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL?.trim();
  return (configuredUrl || `${window.location.protocol}//${window.location.hostname}:5174`)
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:')
    .replace(/\/$/, '');
}

async function authenticate(nickname, password, mode, messageElement) {
  try {
    const body = { nickname, password };
    if (mode === 'register') {
      body.guestId = window.localStorage.getItem('webgl-rpg-guest-id');
    }
    const response = await fetch(`${getHttpUrl()}/api/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new Error('O relay multiplayer nao respondeu JSON. Verifique VITE_MULTIPLAYER_URL: ela deve apontar para o servidor multiplayer, nao para o frontend.');
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Falha na autenticacao.');
    if (mode === 'register') {
      window.localStorage.removeItem('webgl-rpg-guest-id');
      window.localStorage.removeItem('webgl-rpg-guest-nickname');
    }
    return result.nickname;
  } catch (error) {
    messageElement.textContent = error.message;
    return null;
  }
}

async function restoreSession() {
  try {
    const response = await fetch(`${getHttpUrl()}/api/session`, {
      credentials: 'include',
    });
    if (!response.ok) return null;
    const session = await response.json();
    return session.authenticated ? session.nickname : null;
  } catch {
    return null;
  }
}

export function createAccountController({
  startScreen,
  accountForm,
  guestButton,
  registerButton,
  nicknameInput,
  passwordInput,
  messageElement,
  logoutButton,
  startGame,
}) {
  let started = false;

  async function begin(nickname, password = null, mode = 'login') {
    if (started) return;
    if (password) {
      nickname = await authenticate(nickname, password, mode, messageElement);
      if (!nickname) return;
    }
    started = true;
    window.localStorage.setItem('webgl-rpg-nickname', nickname);
    startScreen.classList.add('start-screen-hidden');
    startGame();
  }

  accountForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const credentials = readCredentials(nicknameInput, passwordInput);
    if (validateCredentials(credentials, messageElement)) {
      begin(credentials.nickname, credentials.password);
    }
  });

  guestButton.addEventListener('click', () => {
    const storageKey = 'webgl-rpg-guest-nickname';
    const nickname = window.localStorage.getItem(storageKey)
      ?? `Guest-${window.crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    window.localStorage.setItem(storageKey, nickname);
    begin(nickname);
  });

  registerButton.addEventListener('click', () => {
    const credentials = readCredentials(nicknameInput, passwordInput);
    if (validateCredentials(credentials, messageElement, true)) {
      begin(credentials.nickname, credentials.password, 'register');
    }
  });

  logoutButton.addEventListener('click', async () => {
    await fetch(`${getHttpUrl()}/api/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    window.sessionStorage.removeItem('webgl-rpg-session-token');
    window.location.reload();
  });

  restoreSession().then((nickname) => {
    if (nickname) begin(nickname);
  });
}
