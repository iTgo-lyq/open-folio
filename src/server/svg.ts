import { SaxesParser } from "saxes";

// Format detection only: execution/network isolation is enforced by the image
// context and the asset response CSP, including when opened as a document.
export function isSvgImage(bytes: Buffer): boolean {
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parser = new SaxesParser({ xmlns: true });
    let rootSeen = false;
    const reject = () => {
      throw new Error("Unsupported SVG document");
    };
    parser.on("doctype", reject);
    parser.on("processinginstruction", reject);
    parser.on("xmldecl", ({ version, encoding }) => {
      if (version !== "1.0" || (encoding && !/^utf-8$/i.test(encoding)))
        reject();
    });
    parser.on("opentag", (tag) => {
      if (rootSeen) return;
      if (tag.local !== "svg" || tag.uri !== "http://www.w3.org/2000/svg")
        reject();
      rootSeen = true;
    });
    parser.write(source).close();
    return rootSeen;
  } catch {
    return false;
  }
}
