import { parseArgs } from "node:util";
import { commands } from "./scripts/cli-commands.mjs";

const invocation = "node .agents/skills/spec-trail/cli.mjs";
const [group, command, ...args] = process.argv.slice(2);
const groupCommands = Object.hasOwn(commands, group) ? commands[group] : undefined;
const definition = groupCommands && Object.hasOwn(groupCommands, command)
  ? groupCommands[command]
  : undefined;

function usage() {
  if (!groupCommands)
    return `Usage: ${invocation} <group> <command> [options]\nGroups: ${Object.keys(commands).join(", ")}\nUse <group> --help to list its commands.`;
  if (!definition)
    return `Usage: ${invocation} ${group} <command> [options]\nCommands: ${Object.keys(groupCommands).join(", ")}\nUse <command> --help to see its options.`;

  const flags = Object.entries(definition.options).map(([name, option]) => {
    const value = option.type === "string" ? " <value>" : "";
    const repeat = option.multiple ? "..." : "";
    const flag = `--${name}${value}${repeat}`;
    return definition.required.includes(name) ? flag : `[${flag}]`;
  });
  return [
    `Usage: ${invocation} ${group} ${command} ${[...flags, "[--help]"].join(" ")}`,
    definition.note,
  ].filter(Boolean).join("\n");
}

function parseCommand() {
  if (!group || (group === "--help" && !command)) return;
  if (!groupCommands) throw Error(`Unknown command group: ${group}`);
  if (!command || (command === "--help" && !args.length)) return;
  if (!definition) throw Error(`Unknown command: ${group} ${command}`);
  const { values } = parseArgs({
    args,
    options: { ...definition.options, help: { type: "boolean" } },
  });
  if (values.help) return;
  for (const name of definition.required)
    if (!values[name]?.trim()) throw Error(`--${name} is required`);
  return values;
}

async function main() {
  let options;
  try {
    options = parseCommand();
  } catch (error) {
    console.error(`SpecTrail: ${error.message}\n${usage()}`);
    process.exitCode = 1;
    return;
  }
  if (!options) {
    console.log(usage());
    return;
  }
  try {
    if (group === "prototype" && Number(process.versions.node.split(".")[0]) < 24)
      throw Error("Node.js 24 or newer is required for prototype commands.");
    const { output, exitCode = 0 } = await definition.run(command, options);
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    process.exitCode = exitCode;
  } catch (error) {
    console.error(`SpecTrail ${group} ${command}: ${error.message}`);
    process.exitCode = 1;
  }
}

await main();
