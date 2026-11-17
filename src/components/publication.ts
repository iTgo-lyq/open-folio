"use client";
import { useEffect, useState } from "react";
import type { Device, PreviewArtifact } from "@/lib/model";
import type { PublicPreview } from "@/server/public-previews";
import { useWorkspace } from "./context";
import { usePersonal } from "./personal-context";
import { api } from "./api";

type PreparedPublication = { publication: PublicPreview; url: string };

export function usePublication(
  entry: string | undefined,
  revision: string | undefined,
  {
    change,
    enabled = true,
    reusePrepared = false,
  }: { change?: string; enabled?: boolean; reusePrepared?: boolean } = {},
) {
  const { readUrl, q, data, cache } = useWorkspace();
  const connection = usePersonal()?.connection;
  const path = readUrl("previews/prepare");
  const integrationBranch = data?.integrationBranch ?? q.integrationBranch;
  const key = JSON.stringify([
    path,
    integrationBranch,
    revision,
    change,
    entry,
  ]);
  const cached =
    reusePrepared && enabled && connection && revision
      ? cache.get<PreparedPublication>(key)
      : undefined;
  const [result, setResult] = useState<{
      key: string;
      cache: typeof cache;
      value?: PreparedPublication;
      error?: string;
    }>(),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!entry || !enabled || !connection) return;
    if (reusePrepared && revision && cache.get<PreparedPublication>(key))
      return;
    const controller = new AbortController();
    api<PreparedPublication>(path, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: connection.id,
        integrationBranch,
        entry,
        ...(revision ? { revision } : {}),
        ...(change ? { change } : {}),
        ...(data?.id ? { snapshot: data.id } : {}),
        ...(q.repositoryId && q.fullName
          ? { repositoryId: q.repositoryId, fullName: q.fullName }
          : {}),
      }),
    })
      .then((value) => {
        if (controller.signal.aborted) return;
        if (revision && !change) cache.set(key, value);
        setResult({ key, cache, value });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setResult({ key, cache, error: e.message });
      });
    return () => controller.abort();
  }, [cache, key, enabled, reusePrepared, retry]);
  const current =
    enabled && connection && result?.key === key && result.cache === cache
      ? result
      : undefined;
  return {
    ...(cached ?? current?.value),
    error: cached ? undefined : current?.error,
    retry: () => {
      setResult(undefined);
      setRetry((v) => v + 1);
    },
  };
}
export function prototypeThumbnail(
  artifact: PreviewArtifact | undefined,
  meta: PublicPreview | undefined,
  device?: Device,
) {
  if (artifact?.type === "hosted") {
    const registered = artifact.thumbnails?.find((t) => t.device === device);
    if (registered) return registered.url;
  }
  if (!meta) return "";
  return (
    meta.thumbnails?.find((t) => t.device === device)?.url ??
    `/api/public-previews/${meta.id}/${device ?? "component"}.jpg`
  );
}
