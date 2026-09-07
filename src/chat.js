const MAX_MESSAGES = 40;

export class ChatPanel {
  constructor({ messagesElement, formElement, inputElement }) {
    this.messagesElement = messagesElement;
    this.formElement = formElement;
    this.inputElement = inputElement;
    this.sendMessage = () => false;

    formElement.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!this.sendMessage(inputElement.value)) return;
      inputElement.value = '';
      inputElement.focus();
    });
  }

  connect(sendMessage) {
    this.sendMessage = sendMessage;
  }

  addMessage({ type = 'chat', peerId, text, sentAt = Date.now() }) {
    // textContent impede que mensagens recebidas sejam interpretadas como HTML.
    const item = document.createElement('li');
    const author = document.createElement('strong');
    const time = document.createElement('time');

    item.classList.toggle('system-message', type === 'system');
    author.textContent = peerId ? `${peerId.slice(0, 6)}: ` : '';
    time.textContent = new Date(sentAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    item.append(author, document.createTextNode(text), time);
    this.messagesElement.append(item);

    while (this.messagesElement.children.length > MAX_MESSAGES) {
      this.messagesElement.firstElementChild.remove();
    }
    this.messagesElement.scrollTop = this.messagesElement.scrollHeight;
  }
}