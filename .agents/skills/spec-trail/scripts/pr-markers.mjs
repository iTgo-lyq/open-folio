function paragraphFields(lines) {
  const fields = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && fields.length) { fields.at(-1).value += '\n' + line.trim(); continue; }
    const match = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (!match) return [];
    fields.push({key:match[1], value:match[2].trim()});
  }
  return fields.filter(field => field.key.startsWith('SpecTrail-'));
}

// Blank lines inside fenced code or raw HTML can look like metadata boundaries.
function metadataParagraphs(body) {
  const paragraphs = body.trimEnd().split(/\r?\n\s*\r?\n/);
  if (paragraphs.length < 2) return [];
  let fence, htmlEnd;
  return paragraphs.map(paragraph => {
    const lines = paragraph.split(/\r?\n/);
    let plain = !fence && !htmlEnd;
    for (const line of lines) {
      if (htmlEnd) {
        if (line.toLowerCase().includes(htmlEnd)) htmlEnd = undefined;
        continue;
      }
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim())
          fence = undefined;
        continue;
      }
      if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
        plain = false;
        fence = marker[1];
        continue;
      }
      const html = /^ {0,3}(<!--|<(pre|script|style|textarea)(?=[ \t>]|$))/i.exec(line);
      if (html) {
        plain = false;
        const end = html[2] ? `</${html[2].toLowerCase()}>` : '-->';
        if (!line.toLowerCase().includes(end)) htmlEnd = end;
      }
    }
    return plain ? paragraphFields(lines) : [];
  });
}

/** @returns {{kind:'change',id:string}|{kind:'release',version:string,includes:string[]}|{kind:'none'|'invalid'}} */
export function prMarker(body) {
  const paragraphs = metadataParagraphs(body);
  const all = paragraphs.flat();
  const valid = id => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
  if (all.some(field => field.key === 'SpecTrail-Change')) {
    if (all.length === 1 && valid(all[0].value)) return {kind:'change',id:all[0].value};
    return {kind:'invalid'};
  }
  const fields = paragraphs.at(-1) ?? [];
  if (!fields.length) return {kind:'none'};
  const versions = fields.filter(field => field.key === 'SpecTrail-Version').map(field => field.value);
  const includes = fields.filter(field => field.key === 'SpecTrail-Includes').map(field => field.value);
  if (versions.length === 1 && /^[^\s]+$/.test(versions[0]) &&
      fields.length === includes.length + 1 && includes.every(valid) && new Set(includes).size === includes.length)
    return {kind:'release',version:versions[0],includes};
  return {kind:'invalid'};
}
