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

async function authenticate(nickname, password, mode, messageElement) {
  const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL?.trim();
  const httpUrl = (configuredUrl || `${window.location.protocol}//${window.location.hostname}:5174`)
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:')
    .replace(/\/$/, '');
  try {
    const response = await fetch(`${httpUrl}/api/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname, password }),
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new Error('O relay multiplayer nao respondeu JSON. Verifique VITE_MULTIPLAYER_URL: ela deve apontar para o servidor multiplayer, nao para o frontend.');
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Falha na autenticacao.');
    window.sessionStorage.setItem('webgl-rpg-session-token', result.token);
    return result.nickname;
  } catch (error) {
    messageElement.textContent = error.message;
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
  startGame,
}) {
  let started = false;

  async function begin(nickname, password = null, mode = 'login') {
    if (started) return;
    if (password) {
      nickname = await authenticate(nickname, password, mode, messageElement);
      if (!nickname) return;
    } else {
      window.sessionStorage.removeItem('webgl-rpg-session-token');
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
    const nickname = `Guest-${window.crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    begin(nickname);
  });

  registerButton.addEventListener('click', () => {
    const credentials = readCredentials(nicknameInput, passwordInput);
    if (validateCredentials(credentials, messageElement, true)) {
      begin(credentials.nickname, credentials.password, 'register');
    }
  });
}
