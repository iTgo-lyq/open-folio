// Help shared by options with the same meaning; a command overrides an entry when its meaning differs.
const shared = {
  change: { value: "id", text: "Change id: lowercase kebab-case, same as its directory name" },
  repo: { value: "path", text: "Repository or worktree to use (default: current directory)" },
  "dry-run": { text: "Preview the result without writing files, commits, refs or worktrees" },
  task: { value: "Tn", text: "Task id such as T1" },
  title: { value: "text", text: "Single-line title naming the deliverable and its change or result" },
  reason: { value: "text", text: "Actual reason, in one line" },
  summary: { value: "text", text: "What was actually done and the evidence" },
  source: { value: "text", text: "User's actual words or a reference to them" },
  "availability-note": {
    value: "text",
    text: "Evidence that a prerequisite delivery is integrated when Git ancestry cannot prove it (e.g. after a squash); record it in execution.md first",
  },
  types: { value: "json", text: 'Labels as a JSON string array, e.g. \'["修复","安全"]\'; \'[]\' clears them' },
  urgency: { choices: ["urgent", "high", "normal", "low"], text: "Urgency; normal removes the field" },
  "group-title": { value: "text", text: "Name of a new follow-up group; usually omitted to inherit the existing group name" },
};

/**
 * A command definition: `run(values, name)` receives the parsed options and the
 * command's display name such as "task start"; the rest drives parsing and help.
 * `shared` adds option help for a whole group.
 */
export function define(run, {
  summary, required = [], optional = [], booleans = [], multiple = [], help = {}, shared: group = {}, notes = [], example = "",
}) {
  const names = [...required, ...optional, ...booleans.filter(name => !required.includes(name)), ...multiple];
  return {
    run,
    summary,
    required,
    notes,
    example,
    options: Object.fromEntries(names.map(name => {
      const parse = booleans.includes(name)
        ? { type: "boolean", default: false }
        : multiple.includes(name)
          ? { type: "string", multiple: true, default: [] }
          : { type: "string" };
      return [name, { ...parse, ...shared[name], ...group[name], ...help[name] }];
    })),
  };
}
