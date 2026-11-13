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

// Every level prints runnable usage lines; deeper levels add notes, option details and an example.
function groupSection(name, details) {
  const lines = [`${name}: ${groups[name].summary}`];
  if (details) lines.push(...(groups[name].notes ?? []).map(note => `  ${note}`));
  for (const [entry, spec] of Object.entries(commands[name])) {
    if (details) lines.push("");
    lines.push(`  ${synopsis(entry, spec)}`, `      ${spec.summary}`);
    if (details) lines.push(...spec.notes.map(note => `      ${note}`));
  }
  return lines;
}

function usage() {
  if (!groupCommands)
    return [
      `Usage: ${invocation} <group> <command> [options]`,
      "",
      "Each operation prints one JSON value to stdout; help is text and diagnostics go to stderr.",
      "Exit codes: 0 success, 1 usage error or failed check, 2 incomplete cleanup or tag deletion.",
      "Options take --name value or --name=value. Prototype commands need Node.js 24+, the others Node.js 20+.",
      "Use <group> --help for notes on each command, and <group> <command> --help for option details and an example.",
      ...Object.keys(commands).flatMap(name => ["", ...groupSection(name, false)]),
    ].join("\n");
  if (!definition)
    return [
      `Usage: ${invocation} ${group} <command> [options]`,
      "Use <command> --help for option details and an example.",
      "",
      ...groupSection(group, true),
    ].join("\n");

  const rows = Object.entries(definition.options).map(([name, option]) => [
    flag(name, option),
    [definition.required.includes(name) && "(required)", option.multiple && "(repeatable)", option.text]
      .filter(Boolean).join(" "),
  ]);
  rows.push(["--help", "Show this help"]);
  const width = Math.max(...rows.map(([name]) => name.length)) + 2;
  const notes = [...(groups[group].notes ?? []), ...definition.notes];
  return [
    `Usage: ${invocation} ${group} ${synopsis(command, definition)}`,
    "",
    definition.summary,
    "",
    "Options:",
    ...rows.map(([name, text]) => `  ${name.padEnd(width)}${text}`),
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
