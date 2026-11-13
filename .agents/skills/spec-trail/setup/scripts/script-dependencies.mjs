import { isBuiltin } from "node:module";

const tokenPattern = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*|\S/guy;
const whitespace = /\s+/y;
const regexLiteral = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/[\r\n\\])+\/[a-z]*/y;
const regexPrefix = /^(?:[([{=,:;!?&|+*%~<>^-]|return|throw|case|yield|await|typeof|void|delete|else|do)$/;
const control = /^(?:if|for|while|switch|with|catch)$/;
const templatePart = /(?:\\[\s\S]|\$(?!\{)|[^`\\$])*(?:`|\$\{)/y;

function tokens(source) {
  const result = [];
  let index = 0;
  const scan = (interpolation = false) => {
    const parentheses = [];
    let afterControl = false;
    let braces = 0;
    while (index < source.length) {
      whitespace.lastIndex = index;
      if (whitespace.test(source)) {
        index = whitespace.lastIndex;
        continue;
      }
      tokenPattern.lastIndex = index;
      let token = tokenPattern.exec(source)[0];
      if (token.startsWith("//") || token.startsWith("/*")) {
        index += token.length;
        continue;
      }
      if (token === "}" && interpolation && !braces) {
        index++;
        return;
      }
      if (token === "`") {
        const start = index++;
        let dynamic = false;
        while (index < source.length) {
          templatePart.lastIndex = index;
          const part = templatePart.exec(source)?.[0];
          if (!part) {
            index = source.length;
            break;
          }
          index += part.length;
          if (part.endsWith("`")) break;
          dynamic = true;
          result.push("{");
          scan(true);
          result.push("}");
        }
        result.push(dynamic ? "<template>" : source.slice(start, index));
        afterControl = false;
        continue;
      }
      if (token === "/" && (afterControl || !result.length || regexPrefix.test(result.at(-1)))) {
        regexLiteral.lastIndex = index;
        token = regexLiteral.exec(source)?.[0] ?? token;
      }
      index += token.length;
      if (token === "{") braces++;
      if (token === "}") braces--;
      if (token === "(") parentheses.push(control.test(result.at(-1)));
      afterControl = token === ")" && parentheses.pop();
      result.push(token);
    }
  };
  scan();
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
  if (parts[index + 1] === ",") index += 2;
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
  // An ordinary local require function does not load a module.
  let scope = {};
  const scopes = parts.map((token, index) => {
    if (token === "{") scope = { parent: scope };
    if (token === "require") {
      const previous = parts[index - 1];
      const arrow = parts[index + 3] === "=" && parts[index + 4] === ">";
      if (previous === "function" ||
          (["const", "let", "var"].includes(previous) && parts[index + 1] === "=" &&
            (["(", "function"].includes(parts[index + 2]) || arrow))) scope.localRequire = true;
    }
    const current = scope;
    if (token === "}") scope = scope.parent ?? scope;
    return current;
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
    } else if (token === "require" && parts[index - 1] !== "." && next === "(") {
      let scope = scopes[index];
      while (scope && !scope.localRequire) scope = scope.parent;
      if (scope) continue;
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
