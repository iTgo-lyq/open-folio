"use client";
import { useEffect, useState } from "react";
import type { PublicPreview } from "@/server/public-previews";
import { useWorkspace } from "./context";
import { usePersonal } from "./personal-context";
import { api } from "./api";
export function usePublication(
  entry: string | undefined,
  revision: string | undefined,
  change?: string,
  enabled = true,
) {
  const { readUrl, q, data, projectId } = useWorkspace(),
    personal = usePersonal();
  const connection = personal?.connection,
    epoch = personal?.epoch;
  const key = `${connection?.id}:${connection?.revision}:${epoch}:${projectId}:${data?.integrationBranch}:${revision}:${change}:${entry}`;
  const [result, setResult] = useState<{
      key: string;
      publication?: PublicPreview;
      url?: string;
      error?: string;
    }>({ key: "" }),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!entry || !enabled || !connection) return;
    const controller = new AbortController();
    api<{ publication: PublicPreview; url: string }>(
      readUrl("previews/prepare"),
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: connection.id,
          integrationBranch: data?.integrationBranch ?? q.integrationBranch,
          entry,
          ...(revision ? { revision } : {}),
          ...(change ? { change } : {}),
          ...(data?.id ? { snapshot: data.id } : {}),
          ...(q.repositoryId && q.fullName
            ? { repositoryId: q.repositoryId, fullName: q.fullName }
            : {}),
        }),
      },
    )
      .then((value) => {
        if (!controller.signal.aborted) setResult({ key, ...value });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setResult({ key, error: e.message });
      });
    return () => controller.abort();
  }, [key, readUrl, enabled, retry]);
  return {
    ...(result.key === key ? result : {}),
    retry: () => {
      setResult({ key: "" });
      setRetry((v) => v + 1);
    },
  };
}
export function publicationThumbnail(
  meta: PublicPreview | undefined,
  device?: string,
) {
  if (!meta) return "";
  return meta.type === "hosted"
    ? (meta.thumbnails?.find((t) => t.device === device)?.url ?? "")
    : `/api/public-previews/${meta.id}/${device ?? "component"}.jpg`;
}
