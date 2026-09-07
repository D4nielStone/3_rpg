export class ServerLogger {
  constructor(output = console) {
    this.output = output;
  }

  info(message, context = {}) {
    this.write('INFO', message, context);
  }

  warn(message, context = {}) {
    this.write('WARN', message, context);
  }

  error(message, context = {}) {
    this.write('ERROR', message, context);
  }

  write(level, message, context) {
    // Contexto estruturado facilita filtrar os logs no painel do Render.
    const timestamp = new Date().toISOString();
    const details = Object.keys(context).length > 0
      ? ` ${JSON.stringify(context)}`
      : '';
    this.output.log(`[${timestamp}] [${level}] ${message}${details}`);
  }
}