export const SHARE_READING_KEYS = [
  "ct",
  "document",
  "anchor",
  "raw",
  "asset",
  "preview",
  "device",
  "orientation",
  "zoom",
  "cf",
  "cv",
] as const;
export type ShareLocation = Partial<
  Record<(typeof SHARE_READING_KEYS)[number], string>
>;

export function shareLocation(
  query: URLSearchParams | Record<string, string>,
): ShareLocation {
  return Object.fromEntries(
    SHARE_READING_KEYS.flatMap((key) => {
      const value =
        query instanceof URLSearchParams ? query.get(key) : query[key];
      return value ? [[key, value]] : [];
    }),
  );
}

// A new material replaces its old document/chapter; adjustments keep the material.
export function shareReadingParams(
  query: URLSearchParams,
  saved: ShareLocation = {},
) {
  const explicit = shareLocation(query);
  const changedMaterial = explicit.ct || explicit.document || explicit.asset;
  return new URLSearchParams(
    Object.entries(changedMaterial ? explicit : { ...saved, ...explicit }),
  );
}

export function sharedTextDocument(location: ShareLocation = {}) {
  if (location.document) return location.document;
  if (location.ct?.startsWith("file:")) return location.ct.slice(5);
  if (
    [
      "requirement",
      "technical",
      "plan",
      "research",
      "execution",
      "review",
    ].includes(location.ct ?? "")
  )
    return `${location.ct}.md`;
}

export type ShareTarget = {
  repository: string;
  change: string;
  integrationBranch?: string;
  shortId?: string;
  location?: ShareLocation;
};

export function shareParams(target: ShareTarget) {
  const params = new URLSearchParams({
    repository: target.repository,
    change: target.change,
  });
  if (target.integrationBranch)
    params.set("integrationBranch", target.integrationBranch);
  return params;
}

export function sharePath(target: ShareTarget) {
  if (target.shortId) return `/s/${encodeURIComponent(target.shortId)}`;
  return `/share?${shareParams(target)}`;
}

export function agentSharePath(
  target: ShareTarget,
  options: { document?: string; snapshot?: string } = {},
) {
  const params = target.shortId ? new URLSearchParams() : shareParams(target);
  if (options.document !== undefined) params.set("document", options.document);
  if (options.snapshot !== undefined) params.set("snapshot", options.snapshot);
  const path = target.shortId
    ? `/s/${encodeURIComponent(target.shortId)}/agent`
    : "/share/agent";
  return `${path}${params.size ? `?${params}` : ""}`;
}

export function sharedReadUrl(target: ShareTarget, path: string) {
  const [name, query] = path.split("?");
  const params = new URLSearchParams(query);
  for (const [key, value] of shareParams(target)) params.set(key, value);
  return `/api/shared-changes/${name}?${params}`;
}
