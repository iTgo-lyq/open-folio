// clarify group: questions actually asked and the user's effective answers.
import { assert, stateCommand, stateNotes } from "./context.mjs";

// Answers and withdrawals keep a withdrawn question as history.
function openQuestion({ state, need }) {
  const question = need("question");
  assert(Object.hasOwn(state.clarifications || {}, question), "Question does not exist");
  const entry = state.clarifications[question];
  assert(!entry.withdrawn, "Question has been withdrawn; retain it and ask a new question if needed");
  return entry;
}

export const notes = stateNotes;

export const commands = {
  ask: stateCommand("Record a clarification question that was actually asked", {
    required: ["round", "text", "recommendation"],
    optional: ["question"],
    help: {
      round: { value: "n", text: "Positive integer; questions asked together share a round; rounds keep increasing across stages" },
      text: { value: "text", text: "The question as asked" },
      recommendation: { value: "text", text: "Recommended answer and short reason" },
      question: { value: "Qn", text: "Explicit question id (default: next number); ids only increase and are never reused" },
    },
    example: " --round 1 --text '是否保留旧入口？' --recommendation '不保留，减少维护面'",
    run({ state, opts, need }) {
      const entries = state.clarifications || {};
      const next = Math.max(0, ...Object.keys(entries).map((key) => Number(key.slice(1)))) + 1;
      const question = opts.question || `Q${next}`;
      assert(
        /^Q[1-9][0-9]*$/.test(question) && Number.isSafeInteger(Number(question.slice(1))) && Number(question.slice(1)) >= next,
        "Question id must increase and cannot be reused",
      );
      const round = need("round");
      assert(/^[1-9][0-9]*$/.test(round), "--round must be a positive integer");
      state.clarifications = {
        ...entries,
        [question]: { round: Number(round), question: need("text"), recommendation: need("recommendation") },
      };
    },
  }),
  answer: stateCommand("Record the user's final effective answer; overwrites an earlier answer", {
    required: ["question", "answer"],
    optional: ["source"],
    help: {
      question: { value: "Qn", text: "Question id such as Q1" },
      answer: { value: "text", text: "User's final answer or a faithful summary" },
      source: { value: "text", text: "User's words; omitting it clears an earlier source" },
    },
    example: " --question Q1 --answer '不保留旧入口' --source '不需要考虑历史兼容'",
    run(ctx) {
      const entry = openQuestion(ctx);
      entry.answer = ctx.need("answer");
      if (ctx.opts.source !== undefined) entry.source = ctx.need("source");
      else delete entry.source;
    },
  }),
  withdraw: stateCommand("Mark a question as no longer applicable; the original question and answer are kept", {
    required: ["question", "reason"],
    help: { question: { value: "Qn", text: "Question id such as Q1" } },
    example: " --question Q2 --reason '范围调整后不再适用'",
    run(ctx) {
      openQuestion(ctx).withdrawn = ctx.need("reason");
    },
  }),
};
