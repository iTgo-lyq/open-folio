import { parseArgs } from "node:util";
import { commands, groups } from "./scripts/cli-commands.mjs";

const invocation = "node .agents/skills/spec-trail/cli.mjs";
const [group, command, ...args] = process.argv.slice(2);
const groupCommands = Object.hasOwn(commands, group) ? commands[group] : undefined;
const definition = groupCommands && Object.hasOwn(groupCommands, command)
  ? groupCommands[command]
  : undefined;

const flag = (name, option) =>
  option.type === "boolean" ? `--${name}` : `--${name} <${option.choices?.join("|") ?? option.value}>`;

function synopsis(name, { options, required }) {
  return [name, ...Object.entries(options).map(([option, spec]) => {
    const text = flag(option, spec);
    if (spec.multiple) return `[${text}]...`;
    return required.includes(option) ? text : `[${text}]`;
  })].join(" ");
}

const table = rows => {
  const width = Math.max(...rows.map(([name]) => name.length)) + 2;
  return rows.map(([name, text]) => `  ${name.padEnd(width)}${text}`);
};

// The overview lists groups, a group lists its commands, and only a command shows options and an example.
function usage() {
  if (!groupCommands)
    return [
      `Usage: ${invocation} <group> <command> [options]`,
      "",
      "Each operation prints one JSON value to stdout; help is text and diagnostics go to stderr.",
      "Exit codes: 0 success, 1 usage error or failed check, 2 incomplete cleanup.",
      "Options take --name value or --name=value. Commands need Node.js 20+ unless their group says otherwise.",
      "Use <group> --help to list its commands, and <group> <command> --help for options and an example.",
      "",
      "Groups:",
      ...table(Object.keys(commands).filter(name => !groups[name].hidden).map(name => [name, groups[name].summary])),
    ].join("\n");
  if (!definition)
    return [
      `Usage: ${invocation} ${group} <command> [options]`,
      "Use <command> --help for options and an example.",
      "",
      `${group}: ${groups[group].summary}`,
      ...(groups[group].notes ?? []).map(note => `  ${note}`),
      "",
      "Commands:",
      ...table(Object.entries(commands[group]).map(([name, spec]) => [name, spec.summary])),
    ].join("\n");

  const rows = Object.entries(definition.options).map(([name, option]) => [
    flag(name, option),
    [definition.required.includes(name) && "(required)", option.multiple && "(repeatable)", option.text]
      .filter(Boolean).join(" "),
  ]);
  rows.push(["--help", "Show this help"]);
  const notes = [...(groups[group].notes ?? []), ...definition.notes];
  return [
    `Usage: ${invocation} ${group} ${synopsis(command, definition)}`,
    "",
    definition.summary,
    "",
    "Options:",
    ...table(rows),
    ...(notes.length ? ["", "Notes:", ...notes.map(note => `  ${note}`)] : []),
    "",
    "Example:",
    `  ${[invocation, group, command, definition.example].filter(Boolean).join(" ")}`,
  ].join("\n");
}

function parseCommand() {
  if (group === undefined || (group === "--help" && command === undefined)) return;
  if (!groupCommands) throw Error(`Unknown command group: ${group}`);
  if (command === undefined || (command === "--help" && !args.length)) return;
  if (!definition) throw Error(`Unknown command: ${group} ${command}`);
  const { values } = parseArgs({
    args,
    options: { ...definition.options, help: { type: "boolean" } },
  });
  if (values.help) return;
  for (const name of definition.required) {
    const value = values[name];
    if (value !== true && !(typeof value === "string" && value.trim()))
      throw Error(`--${name} is required`);
  }
  for (const [name, option] of Object.entries(definition.options))
    if (option.choices && values[name] !== undefined && !option.choices.includes(values[name]))
      throw Error(`--${name} must be one of: ${option.choices.join(", ")}`);
  return values;
}

async function main() {
  let options;
  try {
    options = parseCommand();
  } catch (error) {
    console.error(`SpecTrail: ${error.message}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }
  if (!options) {
    console.log(usage());
    return;
  }
  try {
    const { minNode } = groups[group];
    if (minNode && Number(process.versions.node.split(".")[0]) < minNode)
      throw Error(`Node.js ${minNode} or newer is required for ${group} commands.`);
    const { output, exitCode = 0 } = await definition.run(command, options);
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    process.exitCode = exitCode;
  } catch (error) {
    console.error(`SpecTrail ${group} ${command}: ${error.message}`);
    process.exitCode = 1;
  }
}

await main();
