import type { GitReader } from "./git.ts";

/** Read a known, bounded set of immutable blobs with one Git process. */
export async function readBlobs(
  reader: Pick<GitReader, "run">,
  sizes: ReadonlyMap<string, number>,
  signal?: AbortSignal,
): Promise<Map<string, Buffer>> {
  if (!sizes.size) return new Map();
  const ids = [...sizes.keys()];
  const limit =
    [...sizes.values()].reduce((a, b) => a + b, 0) + ids.length * 100 + 1024;
  const output = await reader.run(
    ["cat-file", "--batch"],
    signal,
    limit,
    `${ids.join("\n")}\n`,
  );
  const result = new Map<string, Buffer>();
  let offset = 0;
  for (const id of ids) {
    const end = output.indexOf(10, offset);
    const header = output.subarray(offset, end).toString();
    const size = sizes.get(id)!;
    if (
      end < 0 ||
      header !== `${id} blob ${size}` ||
      output[end + 1 + size] !== 10
    )
      throw Error("Incomplete Git blob batch");
    result.set(id, output.subarray(end + 1, end + 1 + size));
    offset = end + size + 2;
  }
  return result;
}
