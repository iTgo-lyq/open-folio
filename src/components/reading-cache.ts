import type { PrototypeCatalog } from "../lib/prototypes.ts";
import type { DocumentRef, Workbench } from "../lib/model.ts";
import { api } from "./api.ts";

export type DocumentValue = { document: DocumentRef; body: string };
type ReadUrl = (path: string) => string;

// One instance per confirmed reading identity. Nothing is persisted in the browser.
export class ReadingCache {
  private entries = new Map<string, { value: unknown; bytes: number }>();
  private bytes = 0;
  private generation = 0;
  private readers = new Map<string, Map<string, number>>();
  private maxEntries: number;
  private maxBytes: number;
  constructor(maxEntries = 128, maxBytes = 16 * 1024 * 1024) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }
  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value as T;
  }
  set(key: string, value: unknown) {
    const bytes = JSON.stringify(value).length * 2;
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.bytes;
    this.entries.delete(key);
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
  }
  clear() {
    this.generation++;
    this.entries.clear();
    this.bytes = 0;
  }
  private documentKey(document: DocumentRef, readUrl: ReadUrl) {
    return JSON.stringify([readUrl("workbench"), document.id, document.blob]);
  }
  document(document: DocumentRef, readUrl: ReadUrl): DocumentValue | undefined {
    const body = this.get<string>(this.documentKey(document, readUrl));
    // Blob bytes are immutable; metadata belongs to the current snapshot.
    return body === undefined ? undefined : { document, body };
  }
  async readDocument(
    document: DocumentRef,
    snapshot: string,
    readUrl: ReadUrl,
    signal: AbortSignal,
  ) {
    const cached = this.document(document, readUrl);
    if (cached) return cached;
    const generation = this.generation;
    const value = await api<DocumentValue>(
      readUrl(
        `documents/${encodeURIComponent(document.id)}?snapshot=${snapshot}`,
      ),
      { signal },
    );
    signal.throwIfAborted();
    if (generation !== this.generation)
      throw new DOMException("Reading identity changed", "AbortError");
    this.set(this.documentKey(document, readUrl), value.body);
    return { document, body: value.body };
  }
  watch(id: string, readUrl: ReadUrl) {
    const key = readUrl("workbench");
    let readers = this.readers.get(key);
    if (!readers) this.readers.set(key, (readers = new Map()));
    readers.set(id, (readers.get(id) ?? 0) + 1);
    return () => {
      const count = (readers!.get(id) ?? 1) - 1;
      if (count) readers!.set(id, count);
      else readers!.delete(id);
      if (!readers!.size) this.readers.delete(key);
    };
  }
  watchCatalog(readUrl: ReadUrl) {
    return this.watch("\0prototypes", readUrl);
  }
  async readCatalog(snapshot: string, readUrl: ReadUrl, signal: AbortSignal) {
    const key = readUrl(`prototypes?snapshot=${snapshot}`);
    const cached = this.get<PrototypeCatalog>(key);
    if (cached) return cached;
    const generation = this.generation;
    const value = await api<PrototypeCatalog>(key, { signal });
    signal.throwIfAborted();
    if (generation !== this.generation)
      throw new DOMException("Reading identity changed", "AbortError");
    this.set(key, value);
    return value;
  }
  async prepare(next: Workbench, readUrl: ReadUrl, signal: AbortSignal) {
    // Keep body, metadata, links and resources on the previous version until
    // every currently visible reader is ready, including navigation during IO.
    const prepared = new Set<string>();
    const generation = this.generation;
    for (;;) {
      signal.throwIfAborted();
      if (generation !== this.generation)
        throw new DOMException("Reading identity changed", "AbortError");
      const readers = this.readers.get(readUrl("workbench"));
      const pending: Promise<unknown>[] = next.documents
        .filter(
          (d) =>
            readers?.has(d.id) &&
            !prepared.has(d.id) &&
            d.readable &&
            ["markdown", "json"].includes(d.kind),
        )
        .map((d) => {
          prepared.add(d.id);
          return this.readDocument(d, next.id, readUrl, signal);
        });
      if (readers?.has("\0prototypes") && !prepared.has("\0prototypes")) {
        prepared.add("\0prototypes");
        pending.push(this.readCatalog(next.id, readUrl, signal));
      }
      if (!pending.length) return;
      await Promise.all(pending);
    }
  }
}
