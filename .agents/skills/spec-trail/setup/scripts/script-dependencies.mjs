import { isBuiltin } from "node:module";

const tokenPattern = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|`(?:\\[\s\S]|[^`\\])*`|[\w$]+|\S/gy;
const whitespace = /\s+/y;
const regexLiteral = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/[\r\n\\])+\/[a-z]*/y;
const regexPrefix = /^(?:[([{=,:;!?&|+*%~<>^-]|return|throw|case|yield|await|typeof|void|delete)$/;

function tokens(source) {
  const result = [];
  let index = 0;
  while (index < source.length) {
    whitespace.lastIndex = index;
    if (whitespace.test(source)) {
      index = whitespace.lastIndex;
      continue;
    }
    tokenPattern.lastIndex = index;
    let token = tokenPattern.exec(source)[0];
    if (token === "/" && (!result.length || regexPrefix.test(result.at(-1)))) {
      regexLiteral.lastIndex = index;
      token = regexLiteral.exec(source)?.[0] ?? token;
    }
    index += token.length;
    if (!token.startsWith("//") && !token.startsWith("/*")) result.push(token);
  }
  return result;
}

const quoted = (token) => token?.length >= 2 && /^['"]/.test(token);
const decodeSpecifier = (token) => token.slice(1, -1).replace(
  /\\(?:u\{([\da-f]+)\}|u([\da-f]{4})|x([\da-f]{2})|(\r\n|[\s\S]))/gi,
  (_, codePoint, unicode, byte, escape) => {
    if (codePoint || unicode || byte) {
      const code = Number.parseInt(codePoint ?? unicode ?? byte, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
    }
    return { "\r\n": "", "\n": "", "\r": "", n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0" }[escape] ?? escape;
  },
);

function fromSpecifier(parts, start) {
  // Optional default binding, followed by a named or namespace clause.
  let index = start;
  if (/^[\w$]+$/.test(parts[index] ?? "") && parts[index + 1] === ",") index += 2;
  if (parts[index] === "{") {
    index = parts.indexOf("}", index + 1) + 1;
    if (!index) return;
  } else if (parts[index] === "*") {
    index += parts[index + 1] === "as" ? 3 : 1;
  } else {
    index++;
  }
  if (parts[index] === "from") return parts[index + 1];
}

function literalArgument(parts, start) {
  const argument = parts[start];
  if (![")", ","].includes(parts[start + 1])) return;
  if (quoted(argument) || (argument?.startsWith("`") && !argument.includes("${"))) return argument;
}

export function externalScriptDependencies(source) {
  const parts = tokens(source.replace(/^#![^\r\n]*/, ""));
  const external = new Set();
  // A project may use an ordinary local function named require in an ESM script.
  const localRequire = parts.some((token, index) => {
    if (token !== "require") return false;
    if (parts[index - 1] === "function") return true;
    return ["const", "let", "var"].includes(parts[index - 1]) &&
      parts[index + 1] === "=" &&
      ["(", "function"].includes(parts[index + 2]);
  });
  for (const [index, token] of parts.entries()) {
    const next = parts[index + 1];
    let literal;
    if (token === "import" && parts[index - 1] !== ".") {
      if (quoted(next)) literal = next;
      else if (next === "(") literal = literalArgument(parts, index + 2);
      else if (next !== ".") literal = fromSpecifier(parts, index + 1);
    } else if (token === "export" && ["{", "*"].includes(next)) {
      literal = fromSpecifier(parts, index + 1);
    } else if (token === "require" && !localRequire && parts[index - 1] !== "." && next === "(") {
      literal = literalArgument(parts, index + 2);
    }
    if (!literal) continue;
    const specifier = decodeSpecifier(literal);
    if (!/^\.\.?\//.test(specifier) && !(specifier.startsWith("node:") && isBuiltin(specifier))) {
      external.add(specifier);
    }
  }
  return [...external];
}
