export type ShareTarget = {
  repository: string;
  change: string;
  integrationBranch?: string;
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
  return `/share?${shareParams(target)}`;
}

export function sharedReadUrl(target: ShareTarget, path: string) {
  const [name, query] = path.split("?");
  const params = new URLSearchParams(query);
  for (const [key, value] of shareParams(target)) params.set(key, value);
  return `/api/shared-changes/${name}?${params}`;
}
