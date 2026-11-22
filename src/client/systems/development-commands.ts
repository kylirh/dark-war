/** Extensible development command registry, with shared help and argument validation. */

export interface DevelopmentCommand {
  name: string;
  description: string;
  arguments: readonly string[];
  defaultArgument?: string;
  run(argument: string): string | Promise<string>;
}

/** Parses commands without evaluating code; every accepted argument is declared. */
export class DevelopmentCommands {
  public constructor(
    private readonly commands: readonly DevelopmentCommand[],
  ) {}

  /** Execute a line and return feedback suitable for textContent. */
  public async execute(line: string): Promise<string> {
    const [name = "", ...args] = line
      .trim()
      .replace(/^\//, "")
      .toLowerCase()
      .split(/\s+/);
    if (!name) return "Enter a command. Try /help.";
    if (name === "help") {
      if (args.length > 1) return "Usage: /help [command]";
      if (!args.length)
        return [
          "/help [command] — List commands or explain one.",
          ...this.commands.map((command) => this.help(command)),
        ].join("\n");
      if (args[0] === "help")
        return "/help [command] — List commands or explain one.";
      const command = this.commands.find(
        (entry) => entry.name === args[0].replace(/^\//, ""),
      );
      return command
        ? this.help(command)
        : `Unknown command: ${args[0]}. Try /help.`;
    }
    const command = this.commands.find((entry) => entry.name === name);
    if (!command) return `Unknown command: /${name}. Try /help.`;
    const argument = args[0] ?? command.defaultArgument;
    if (
      args.length > 1 ||
      argument === undefined ||
      !command.arguments.includes(argument)
    )
      return `Usage: ${this.help(command)}`;
    return command.run(argument);
  }

  /** Candidate command names for completion. */
  public complete(prefix: string): string[] {
    return ["help", ...this.commands.map((command) => command.name)].filter(
      (name) => name.startsWith(prefix.toLowerCase()),
    );
  }

  private help(command: DevelopmentCommand): string {
    const usage = command.arguments.filter(Boolean).join("|");
    return `/${command.name}${usage ? ` ${command.defaultArgument === undefined ? "<" : "["}${usage}${command.defaultArgument === undefined ? ">" : "]"}` : ""} — ${command.description}`;
  }
}
