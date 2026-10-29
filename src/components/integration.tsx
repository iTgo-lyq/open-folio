"use client";
import { materialClass } from "./material-styles";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { ArrowLeft, Copy, GitMerge, WrapText, X } from "lucide-react";
import { Button, IconButton, Tooltip } from "@open-folio/ui";
import type {
  IntegrationSummary,
  IntegrationFile,
  IntegrationFiles,
  IntegrationDiff,
} from "@/lib/integration";
import { api, useWorkspace } from "./context";
import { Empty, ErrorNotice } from "./document";

const statuses: Record<string, string> = {
  A: "新增",
  M: "修改",
  D: "删除",
  R: "重命名",
  C: "复制",
  T: "类型变化",
};
const kinds = {
  text: "",
  binary: "二进制",
  submodule: "子模块",
  symlink: "符号链接",
  "mode-only": "文件模式",
};
// 列表默认是修改，只标出其他状态与非文本类型。
const fileLabel = (file: IntegrationFile) =>
  [
    file.status !== "M" && (statuses[file.status] ?? file.status),
    kinds[file.kind],
  ]
    .filter(Boolean)
    .join(" · ");
export function ChangeIntegration({ id }: { id: string }) {
  const { data, q, nav, readUrl, notice, refresh } = useWorkspace();
  const url = readUrl(
    `changes/${encodeURIComponent(id)}/integration?snapshot=${data!.id}`,
  );
  const [attempt, setAttempt] = useState(0),
    [fileAttempt, setFileAttempt] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    summary?: IntegrationSummary;
    page?: IntegrationFiles;
    error?: string;
  }>({ key: "" });
  const [more, setMore] = useState<{
    key: string;
    loading?: boolean;
    error?: string;
  }>({ key: "" });
  const moreController = useRef<AbortController | null>(null);
  const [copyValue, setCopyValue] = useState("");
  const [wrapLines, setWrapLines] = useState(false);
  const copyInput = useRef<HTMLTextAreaElement>(null);
  const diffPanel = useRef<HTMLDivElement>(null),
    list = useRef<HTMLElement>(null);
  const key = `${url}:${attempt}`;
  const summary = response.key === key ? response.summary : undefined;
  const page = response.key === key ? response.page : undefined;
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const summary = await api<IntegrationSummary>(url, {
          signal: controller.signal,
        });
        const page =
          summary.record.status === "found"
            ? await api<IntegrationFiles>(
                readUrl(
                  `changes/${encodeURIComponent(id)}/integration/files?snapshot=${data!.id}`,
                ),
                { signal: controller.signal },
              )
            : undefined;
        if (!controller.signal.aborted) setResponse({ key, summary, page });
      } catch (error) {
        if (!controller.signal.aborted)
          setResponse({ key, error: (error as Error).message });
      }
    })();
    return () => {
      controller.abort();
      moreController.current?.abort();
    };
  }, [key, url, readUrl, id, data?.id]);
  const selected = q.cf || page?.files[0]?.id;
  const fileKey = `${key}:${selected}:${fileAttempt}`;
  const [diff, setDiff] = useState<{
    key: string;
    value?: IntegrationDiff;
    error?: string;
  }>({ key: "" });
  useEffect(() => {
    if (!selected || summary?.record.status !== "found") return;
    const controller = new AbortController();
    api<IntegrationDiff>(
      readUrl(
        `changes/${encodeURIComponent(id)}/integration/files/${encodeURIComponent(selected)}?snapshot=${data!.id}`,
      ),
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setDiff({ key: fileKey, value });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setDiff({ key: fileKey, error: error.message });
      });
    return () => controller.abort();
  }, [fileKey, selected, summary?.record.status, readUrl, id, data?.id]);
  const fileDiff = diff.key === fileKey ? diff.value : undefined;
  useEffect(() => {
    if (diffPanel.current) {
      diffPanel.current.scrollTop = 0;
      diffPanel.current.scrollLeft = 0;
    }
  }, [fileKey]);
  async function loadMore() {
    if (!page?.next || moreController.current) return;
    const controller = new AbortController();
    moreController.current = controller;
    setMore({ key, loading: true });
    try {
      const next = await api<IntegrationFiles>(
        readUrl(
          `changes/${encodeURIComponent(id)}/integration/files?snapshot=${data!.id}&cursor=${encodeURIComponent(page.next)}`,
        ),
        { signal: controller.signal },
      );
      if (!controller.signal.aborted)
        setResponse((previous) =>
          previous.key === key
            ? {
                ...previous,
                page: {
                  ...next,
                  files: [...previous.page!.files, ...next.files],
                },
              }
            : previous,
        );
      if (!controller.signal.aborted) setMore({ key });
    } catch (error) {
      if (!controller.signal.aborted)
        setMore({ key, error: (error as Error).message });
    } finally {
      if (moreController.current === controller) moreController.current = null;
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notice("已复制");
    } catch {
      setCopyValue(value);
    }
  }
  function choose(file: string) {
    nav({ cf: file, cv: "diff" });
    requestAnimationFrame(() => diffPanel.current?.focus());
  }
  const error = response.key === key ? response.error : undefined;
  if (error)
    return (
      <Empty title="暂时无法读取合入记录">
        <p>{error}</p>
        <Button onClick={() => setAttempt((value) => value + 1)}>
          重新读取
        </Button>
      </Empty>
    );
  if (!summary)
    return (
      <div role="status">
        <Empty title="正在读取合入记录…">
          <p>正在查找本次交付的固定版本。</p>
        </Empty>
      </div>
    );
  const record = summary.record;
  if (record.status !== "found")
    return (
      <Empty
        title={
          {
            missing: "暂无合入记录",
            invalid: "合入记录存在异常",
            unavailable: "暂时无法读取合入记录",
          }[record.status]
        }
      >
        <p>{record.message}</p>
        {record.status === "missing" && <p>归档文档仍可从其他页签阅读。</p>}
        {record.candidates?.map((commit) => (
          <p key={commit}>
            <code>{commit}</code>
          </p>
        ))}
        {record.status === "unavailable" && (
          <Button onClick={() => void refresh()}>重新读取</Button>
        )}
      </Empty>
    );
  const file =
    fileDiff?.file ?? page?.files.find((file) => file.id === selected);
  const stats = summary.stats;
  return (
    <div className={materialClass("integration-view")}>
      <div className={materialClass("integration-meta")}>
        <span className={materialClass("integration-record-status")}>
          <GitMerge size={13} />
          已合入 {summary.integrationBranch}
        </span>
        <span aria-hidden="true">·</span>
        <time dateTime={record.committedAt}>
          {new Date(record.committedAt).toLocaleString("zh-CN", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </time>
        <span aria-hidden="true">·</span>
        <Button
          variant="text"
          size="sm"
          className={materialClass("integration-commit")}
          title={record.commit}
          aria-label={`复制合入提交 ${record.commit.slice(0, 10)}`}
          onClick={() => void copy(record.commit)}
        >
          <code>{record.commit.slice(0, 10)}</code>
          <Copy />
        </Button>
        <span aria-hidden="true">·</span>
        <Tooltip content="固定合入版本，包含代码、文档与归档移动；差异以本次合入前后为边界。">
          <span className={materialClass("integration-scope")} tabIndex={0}>
            只读
          </span>
        </Tooltip>
      </div>
      <div
        className={materialClass("diff-layout")}
        data-view={q.cv === "diff" ? "diff" : "list"}
      >
        <nav
          className={materialClass("diff-files")}
          aria-label="合入文件"
          ref={list}
        >
          <div className={materialClass("diff-file-heading")}>
            <strong>{stats?.total ?? page?.total ?? 0} 个文件</strong>
            {stats && (
              <span className={materialClass("diff-counts")}>
                <span className={materialClass("diff-added")}>
                  +{stats.added}
                </span>
                <span className={materialClass("diff-removed")}>
                  −{stats.removed}
                </span>
              </span>
            )}
            {!!stats?.unstatable && (
              <small>{stats.unstatable} 个文件不计行数</small>
            )}
          </div>
          {page?.files.map((file) => (
            <button
              key={file.id}
              data-file={file.id}
              className={materialClass("diff-file-item")}
              title={file.path}
              aria-current={file.id === selected}
              onClick={() => choose(file.id)}
            >
              <span className={materialClass("diff-file-line")}>
                <span className={materialClass("diff-file-name")}>
                  {file.path.split("/").at(-1)}
                </span>
                {file.added !== null && (
                  <span className={materialClass("diff-counts")}>
                    <span className={materialClass("diff-added")}>
                      +{file.added}
                    </span>
                    <span className={materialClass("diff-removed")}>
                      −{file.removed}
                    </span>
                  </span>
                )}
              </span>
              <span className={materialClass("diff-file-line")}>
                {fileLabel(file) && (
                  <span className={materialClass("diff-file-status")}>
                    {fileLabel(file)}
                  </span>
                )}
                <span className={materialClass("diff-file-directory")}>
                  <bdi>
                    {file.path.includes("/")
                      ? file.path.slice(0, file.path.lastIndexOf("/") + 1)
                      : "/"}
                  </bdi>
                </span>
              </span>
            </button>
          ))}
          {more.key === key && more.error && (
            <ErrorNotice>{more.error}</ErrorNotice>
          )}
          {page?.next && (
            <Button
              className={materialClass("diff-more")}
              loading={more.key === key && more.loading}
              onClick={() => void loadMore()}
            >
              加载更多文件
            </Button>
          )}
        </nav>
        <section className={materialClass("diff-panel")} aria-label="文件差异">
          <div className={materialClass("diff-heading")}>
            <Button
              variant="text"
              size="sm"
              className={materialClass("diff-back")}
              onClick={() => {
                nav({ cv: "list" });
                requestAnimationFrame(() =>
                  list.current
                    ?.querySelector<HTMLButtonElement>(
                      `[data-file="${CSS.escape(selected ?? "")}"]`,
                    )
                    ?.focus(),
                );
              }}
            >
              <ArrowLeft />
              文件
            </Button>
            <div className={materialClass("diff-file-summary")}>
              <strong>
                {file?.path.split("/").at(-1) ??
                  (selected ? "读取文件…" : "本次合入没有文件变化")}
              </strong>
              {file && (
                <p>
                  <code>{file.path}</code>
                  {` · ${[
                    statuses[file.status] ?? file.status,
                    kinds[file.kind],
                    file.oldPath && `原路径：${file.oldPath}`,
                    file.oldMode !== file.newMode &&
                      `${file.oldMode} → ${file.newMode}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}`}
                </p>
              )}
            </div>
            <div className={materialClass("diff-tools")}>
              <IconButton
                size="sm"
                aria-label="自动换行"
                aria-pressed={wrapLines}
                tooltip
                onClick={() => setWrapLines((value) => !value)}
              >
                <WrapText />
              </IconButton>
              <IconButton
                size="sm"
                aria-label="复制 Git 比较命令"
                tooltip
                onClick={() => void copy(summary.command!)}
              >
                <Copy />
              </IconButton>
            </div>
          </div>
          <div
            className={materialClass("diff-content")}
            role="region"
            ref={diffPanel}
            tabIndex={0}
            aria-label="统一差异"
            data-wrap={wrapLines}
          >
            {diff.key === fileKey && diff.error ? (
              <Empty title="文件差异读取失败">
                <p>{diff.error}</p>
                <Button onClick={() => setFileAttempt((value) => value + 1)}>
                  重新读取
                </Button>
              </Empty>
            ) : fileDiff ? (
              fileDiff.kind !== "text" ? (
                <Empty title={fileDiff.message ?? "无法展示文本差异"}>
                  <p>文件仍包含在本次合入的完整变更中。</p>
                </Empty>
              ) : (
                <table
                  className={materialClass("diff-table")}
                  aria-label={`${fileDiff.file.path} 的统一差异`}
                >
                  <colgroup>
                    <col className={materialClass("line-no")} />
                    <col className={materialClass("line-no")} />
                    <col className={materialClass("sign")} />
                    <col />
                  </colgroup>
                  <tbody>
                    {fileDiff.lines.map((line, index) => (
                      <tr
                        key={index}
                        data-kind={line.kind}
                        className={materialClass(line.kind)}
                      >
                        {["hunk", "note"].includes(line.kind) ? (
                          <td colSpan={4}>{line.text}</td>
                        ) : (
                          <>
                            <td
                              className={materialClass("line-no")}
                              aria-label="旧行号"
                            >
                              {line.old}
                            </td>
                            <td
                              className={materialClass("line-no")}
                              aria-label="新行号"
                            >
                              {line.new}
                            </td>
                            <td className={materialClass("sign")}>
                              {line.kind === "add"
                                ? "+"
                                : line.kind === "remove"
                                  ? "−"
                                  : " "}
                            </td>
                            <td>{line.text}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : selected ? (
              <p className={materialClass("diff-loading")} role="status">
                正在读取文件差异…
              </p>
            ) : null}
          </div>
        </section>
      </div>
      <Dialog.Root
        open={!!copyValue}
        onOpenChange={(open) => {
          if (!open) setCopyValue("");
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={materialClass("drawer-overlay")} />
          <Dialog.Content
            className={materialClass("integration-copy-dialog")}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              copyInput.current?.focus();
              copyInput.current?.select();
            }}
          >
            <Dialog.Title>手动复制</Dialog.Title>
            <Dialog.Description>
              浏览器暂不支持自动复制，请复制下方内容。
            </Dialog.Description>
            <textarea
              ref={copyInput}
              value={copyValue}
              readOnly
              aria-label="待复制内容"
            />
            <Dialog.Close asChild>
              <IconButton aria-label="关闭复制窗口">
                <X size={16} />
              </IconButton>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
