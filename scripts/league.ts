// `npm run league -- <command> [args]`. Later items register commands here.
export {};

const commands: Record<string, ((args: string[]) => void) | undefined> = {};

const [name, ...args] = process.argv.slice(2);
const run = name ? commands[name] : undefined;
if (!run) {
  console.error(`Usage: npm run league -- <command>\nCommands: ${Object.keys(commands).join(', ') || '(none yet)'}`);
  process.exit(name ? 1 : 0);
}
run(args);
