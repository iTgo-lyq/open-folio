import { isBuiltin } from "node:module";

const tokenPattern = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|(?:[$_\p{ID_Start}]|\\u(?:[\da-fA-F]{4}|\{[\da-fA-F]+\}))(?:[$\u200c\u200d\p{ID_Continue}]|\\u(?:[\da-fA-F]{4}|\{[\da-fA-F]+\}))*|\S/guy;
const whitespace = /\s+/y;
const regexLiteral = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/[\r\n\\])+\/[a-z]*/y;
const regexPrefix = /^(?:[([{=,:;!?&|+*%~<>^-]|return|throw|case|yield|await|typeof|void|delete|else|do)$/;
const control = /^(?:if|for|while|switch|with|catch)$/;
const declarationBoundary = [undefined, "{", "}", ";", "export", "default"];
const templatePart = /(?:\\[\s\S]|\$(?!\{)|[^`\\$])*(?:`|\$\{)/y;

function tokens(source) {
  const result = [];
  let index = 0;
  const scan = (interpolation = false) => {
    const parentheses = [];
    let afterControl = false;
    let functionDeclaration = false;
    const braces = [];
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
      if (token === "}" && interpolation && !braces.length) {
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
      const previous = result.at(-1);
      if (token === "function") {
        const before = previous === "async" ? result.at(-2) : previous;
        functionDeclaration = declarationBoundary.includes(before);
      }
      if (token === "{") braces.push(afterControl || /^(?:else|do|try|finally)$/.test(previous));
      if (token === "(") {
        parentheses.push(control.test(previous) || functionDeclaration);
        functionDeclaration = false;
      }
      afterControl = (token === ")" && parentheses.pop()) || (token === "}" && braces.pop());
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
  if (parts[index] === "from" && quoted(parts[index + 1])) return parts[index + 1];
}

function literalArgument(parts, start) {
  const argument = parts[start];
  if (![")", ","].includes(parts[start + 1])) return;
  if (quoted(argument) || (argument?.startsWith("`") && !argument.includes("${"))) return argument;
}

function localRequireScopes(parts) {
  // Bind function names and simple parameters to the body that owns them.
  const bodyBindings = new Set();
  let scope = {};
  return parts.map((token, index) => {
    if (token === "function") {
      const nameIndex = index + (parts[index + 1] === "*" ? 2 : 1);
      const name = parts[nameIndex] === "(" ? undefined : parts[nameIndex];
      const start = nameIndex + (name ? 1 : 0);
      let end = start + 1;
      for (let depth = 1; end < parts.length && depth; end++) {
        if (parts[end] === "(") depth++;
        if (parts[end] === ")") depth--;
      }
      const before = parts[index - (parts[index - 1] === "async" ? 2 : 1)];
      const parameters = parts.slice(start + 1, end - 1);
      if (name === "require" && declarationBoundary.includes(before))
        scope.localRequire = true;
      if (parts[end] === "{" && (name === "require" || parameters.some(
        (part, offset) => part === "require" && (offset === 0 || parameters[offset - 1] === ",") &&
          [undefined, ",", "="].includes(parameters[offset + 1]),
      ))) bodyBindings.add(end);
    }
    if (token === "{") scope = { parent: scope, localRequire: bodyBindings.has(index) };
    if (token === "require" && ["const", "let", "var"].includes(parts[index - 1]) &&
        parts[index + 1] === "=") {
      const start = index + (parts[index + 2] === "async" ? 3 : 2);
      const value = parts[start];
      const arrow = parts[start + 1] === "=" && parts[start + 2] === ">";
      if (["(", "function"].includes(value) || arrow) scope.localRequire = true;
    }
    const current = scope;
    if (token === "}") scope = scope.parent ?? scope;
    return current;
  });
}

export function externalScriptDependencies(source) {
  const parts = tokens(source.replace(/^#![^\r\n]*/, ""));
  const external = new Set();
  const scopes = parts.includes("require") ? localRequireScopes(parts) : [];
  for (const [index, token] of parts.entries()) {
    const next = parts[index + 1];
    let literal;
    if (token === "import" && parts[index - 1] !== ".") {
      if (quoted(next)) literal = next;
      else if (next === "(") literal = literalArgument(parts, index + 2);
      else if (next !== "." && next !== ":") literal = fromSpecifier(parts, index + 1);
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
