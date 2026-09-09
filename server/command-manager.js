export class CommandManager {
  constructor() {
    this.commands = new Map();
  }

  register(name, { scope = 'global', description = '', execute }) {
    const normalizedName = String(name).replace(/^\//, '').toLowerCase();
    if (!normalizedName || typeof execute !== 'function') {
      throw new Error(`Comando inválido: ${name}`);
    }
    if (!['global', 'admin'].includes(scope)) {
      throw new Error(`Escopo inválido para /${normalizedName}: ${scope}`);
    }
    this.commands.set(normalizedName, { name: normalizedName, scope, description, execute });
    return this;
  }

  parse(text) {
    const match = String(text).trim().match(/^\/([^\s]+)(?:\s+(.+))?$/);
    if (!match) return null;
    const name = match[1].toLowerCase();
    const command = this.commands.get(name);
    if (!command) return null;
    return {
      ...command,
      args: match[2]?.trim().split(/\s+/) ?? [],
      rawArgs: match[2]?.trim() ?? '',
    };
  }

  async execute(text, context) {
    const command = this.parse(text);
    if (!command) return false;
    if (command.scope === 'admin' && !context.isAdmin) {
      context.sendSystem('Comando restrito ao administrador.');
      return true;
    }
    await command.execute({ ...context, command });
    return true;
  }

  help(isAdmin = false) {
    return [...this.commands.values()]
      .filter((command) => command.scope === 'global' || isAdmin)
      .map((command) => `/${command.name} - ${command.description}`)
      .join('\n');
  }
}
