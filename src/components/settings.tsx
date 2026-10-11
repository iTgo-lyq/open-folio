"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { FolderGit2, Plus, Settings2, Trash2, X } from "lucide-react";
import {
  Button,
  IconButton,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  Input,
  Textarea,
} from "@open-folio/ui";
import type { AppConfig, ConfigSnapshot, Limits } from "@/lib/model";
import { AccessForm } from "./access";
import { api, ApiError, useWorkspace } from "./context";

const limitFields: [keyof Limits, string, string, number][] = [
  ["refreshMs", "读取超时", "秒", 1000],
  ["branches", "分支数量", "个", 1],
  ["documents", "文档数量", "份", 1],
  ["markdownBytes", "Markdown 文件", "MiB", 1048576],
  ["jsonBytes", "JSON 文件", "KiB", 1024],
  ["imageBytes", "图片文件", "MiB", 1048576],
  ["totalBytes", "正文总容量", "MiB", 1048576],
  ["previewBytes", "单个 HTML 原型", "MiB", 1048576],
  ["previewTotalBytes", "原型总容量", "MiB", 1048576],
  ["previewEntries", "原型入口数量", "个", 1],
];
type ProjectDraft = {
  key: string;
  id: string;
  name: string;
  repositoryUrl: string;
  specBranch: string;
  origins: string;
  inviteCode: string;
};
type Draft = { projects: ProjectDraft[]; limits: Record<string, string> };
function draftFor(config: AppConfig): Draft {
  return {
    projects: config.projects.map((p) => ({
      ...p,
      key: crypto.randomUUID(),
      inviteCode: p.inviteCode ?? crypto.randomUUID(),
      specBranch: p.specBranch ?? "",
      origins: p.prototypeOrigins?.join("\n") ?? "",
    })),
    limits: Object.fromEntries(
      limitFields.map(([key, , , unit]) => [
        key,
        config.limits?.[key] === undefined
          ? ""
          : String(config.limits[key]! / unit),
      ]),
    ),
  };
}
function configFor(draft: Draft): AppConfig {
  const limits = Object.fromEntries(
    limitFields
      .filter(([key]) => draft.limits[key] !== "")
      .map(([key, , , unit]) => [
        key,
        Math.round(Number(draft.limits[key]) * unit),
      ]),
  );
  return {
    schemaVersion: 1,
    projects: draft.projects.map((p) => ({
      id: p.id.trim(),
      name: p.name.trim(),
      inviteCode: p.inviteCode.trim(),
      repositoryUrl: p.repositoryUrl.trim(),
      ...(p.specBranch.trim() ? { specBranch: p.specBranch.trim() } : {}),
      ...(p.origins.trim()
        ? {
            prototypeOrigins: p.origins
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean),
          }
        : {}),
    })),
    ...(Object.keys(limits).length ? { limits } : {}),
  };
}
export function SettingsDialog({
  open,
  setOpen,
  trigger,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  trigger: React.RefObject<HTMLElement | null>;
}) {
  const { configurationSaved, accessChanged, notice } = useWorkspace();
  const [needsAdmin, setNeedsAdmin] = useState(false);
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [discard, setDiscard] = useState(false);
  const [reload, setReload] = useState(0);
  const original = useRef("");
  const dirty = draft !== null && JSON.stringify(draft) !== original.current;
  const apply = (value: ConfigSnapshot) => {
    const next = draftFor(value.config);
    original.current = JSON.stringify({
      ...next,
      projects: next.projects.map((p, i) => ({
        ...p,
        inviteCode: value.config.projects[i].inviteCode ?? "",
      })),
    });
    setSnapshot(value);
    setDraft(next);
  };
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setNeedsAdmin(false);
    setLoading(true);
    setError("");
    setSaved(false);
    setDiscard(false);
    setDraft(null);
    void api<ConfigSnapshot>("/api/config", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) apply(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          if (e instanceof ApiError && e.code === "ADMIN_REQUIRED")
            setNeedsAdmin(true);
          else setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, reload]);
  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty]);
  const close = () => {
    if (saving) return;
    if (dirty) setDiscard(true);
    else setOpen(false);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !snapshot || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const next = await api<ConfigSnapshot>("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: configFor(draft),
          revision: snapshot.revision,
        }),
      });
      configurationSaved(snapshot.config, next.config);
      apply(next);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "未能确认保存结果，请重新加载配置后核对。",
      );
    } finally {
      setSaving(false);
    }
  };
  const editProject = (key: string, patch: Partial<ProjectDraft>) =>
    setDraft(
      (value) =>
        value && {
          ...value,
          projects: value.projects.map((p) =>
            p.key === key ? { ...p, ...patch } : p,
          ),
        },
    );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="settings-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = trigger.current?.isConnected
              ? trigger.current
              : Array.from(
                  document.querySelectorAll<HTMLElement>(
                    "[data-config-trigger]",
                  ),
                ).find((element) => element.getClientRects().length > 0);
            target?.focus();
          }}
        >
          <header className="settings-header">
            <div>
              <Dialog.Title>
                <Settings2 size={20} />
                工作台配置
              </Dialog.Title>
              <Dialog.Description>
                维护项目来源和读取限制，保存后立即生效。
              </Dialog.Description>
            </div>
            <IconButton aria-label="关闭配置" onClick={close} disabled={saving}>
              <X size={18} />
            </IconButton>
          </header>
          {needsAdmin ? (
            <AccessForm
              onSuccess={() => {
                accessChanged();
                setReload((v) => v + 1);
              }}
            />
          ) : (
            <form onSubmit={save} className="settings-form">
              <div className="settings-body">
                {loading && <p role="status">正在读取配置…</p>}
                {draft && snapshot && (
                  <fieldset disabled={saving} className="settings-fields">
                    <div className="settings-section-heading">
                      <div>
                        <h3>项目</h3>
                        <p>登记中心 Git 仓库，让团队找到同一份工程记录。</p>
                      </div>
                      <Button
                        onClick={() =>
                          setDraft({
                            ...draft,
                            projects: [
                              ...draft.projects,
                              {
                                key: crypto.randomUUID(),
                                id: "",
                                name: "",
                                repositoryUrl: "",
                                specBranch: "",
                                origins: "",
                                inviteCode: crypto.randomUUID(),
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={15} />
                        添加项目
                      </Button>
                    </div>
                    {!draft.projects.length && (
                      <div className="settings-empty">
                        <FolderGit2 size={26} />
                        <p>还没有项目，添加一个仓库即可开始。</p>
                      </div>
                    )}
                    {draft.projects.map((p, index) => (
                      <Card key={p.key} size="sm" className="settings-project">
                        <CardHeader>
                          <CardTitle>{p.name || "新项目"}</CardTitle>
                          <CardDescription>
                            {p.id || "填写项目标识和仓库地址"}
                          </CardDescription>
                          <CardAction>
                            <IconButton
                              aria-label={`移除项目 ${p.name || index + 1}`}
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  projects: draft.projects.filter(
                                    (item) => item.key !== p.key,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </CardAction>
                        </CardHeader>
                        <CardContent>
                          <FieldGroup className="settings-grid">
                            <Field>
                              <FieldLabel htmlFor={`${p.key}-name`}>
                                项目名称
                              </FieldLabel>
                              <Input
                                id={`${p.key}-name`}
                                required
                                value={p.name}
                                onChange={(e) =>
                                  editProject(p.key, { name: e.target.value })
                                }
                                placeholder="例如：工程协作"
                              />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`${p.key}-id`}>
                                项目标识
                              </FieldLabel>
                              <Input
                                id={`${p.key}-id`}
                                required
                                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                                title="使用小写字母、数字和连字符，项目间不能重复"
                                value={p.id}
                                onChange={(e) =>
                                  editProject(p.key, { id: e.target.value })
                                }
                                placeholder="例如：open-folio"
                              />
                            </Field>
                            <Field className="settings-wide">
                              <FieldLabel htmlFor={`${p.key}-invite`}>
                                项目邀请码
                              </FieldLabel>
                              <div className="settings-invite">
                                <Input
                                  id={`${p.key}-invite`}
                                  required
                                  maxLength={256}
                                  autoComplete="off"
                                  value={p.inviteCode}
                                  onChange={(e) =>
                                    editProject(p.key, {
                                      inviteCode: e.target.value,
                                    })
                                  }
                                />
                                <Button
                                  onClick={() =>
                                    editProject(p.key, {
                                      inviteCode: crypto.randomUUID(),
                                    })
                                  }
                                >
                                  重新生成
                                </Button>
                                <Button
                                  disabled={
                                    dirty ||
                                    !snapshot.config.projects.some(
                                      (item) =>
                                        item.id === p.id &&
                                        item.inviteCode === p.inviteCode,
                                    )
                                  }
                                  onClick={async () => {
                                    const url = new URL(
                                      window.location.pathname,
                                      window.location.origin,
                                    );
                                    url.searchParams.set("project", p.id);
                                    url.hash = new URLSearchParams({
                                      invite: p.inviteCode,
                                    }).toString();
                                    try {
                                      await navigator.clipboard.writeText(
                                        url.toString(),
                                      );
                                      notice("分享链接已复制");
                                    } catch {
                                      setError(
                                        "无法复制，请检查浏览器的剪贴板权限。",
                                      );
                                    }
                                  }}
                                >
                                  复制分享链接
                                </Button>
                              </div>
                              <FieldDescription>
                                长期有效；更换并保存后，旧链接与已记住的访问权限失效。修改后请先保存再分享。
                              </FieldDescription>
                            </Field>
                            <Field className="settings-wide">
                              <FieldLabel htmlFor={`${p.key}-repository`}>
                                仓库地址
                              </FieldLabel>
                              <Input
                                id={`${p.key}-repository`}
                                type="url"
                                required
                                value={p.repositoryUrl}
                                onChange={(e) =>
                                  editProject(p.key, {
                                    repositoryUrl: e.target.value,
                                  })
                                }
                                placeholder="https://github.com/owner/repository.git"
                                aria-describedby={`${p.key}-repository-help`}
                              />
                              <FieldDescription id={`${p.key}-repository-help`}>
                                HTTPS 地址；凭据由服务的 Git 环境提供。
                              </FieldDescription>
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`${p.key}-branch`}>
                                默认分支（可选）
                              </FieldLabel>
                              <Input
                                id={`${p.key}-branch`}
                                value={p.specBranch}
                                onChange={(e) =>
                                  editProject(p.key, {
                                    specBranch: e.target.value,
                                  })
                                }
                                placeholder="使用远端默认分支"
                              />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`${p.key}-origins`}>
                                原型来源（可选）
                              </FieldLabel>
                              <Textarea
                                id={`${p.key}-origins`}
                                value={p.origins}
                                onChange={(e) =>
                                  editProject(p.key, {
                                    origins: e.target.value,
                                  })
                                }
                                placeholder="https://static.example.com"
                                aria-describedby={`${p.key}-origins-help`}
                              />
                              <FieldDescription id={`${p.key}-origins-help`}>
                                每行一个 HTTPS 来源，不含路径。
                              </FieldDescription>
                            </Field>
                          </FieldGroup>
                        </CardContent>
                      </Card>
                    ))}
                    <details className="settings-limits">
                      <summary>
                        资源限制<span>留空使用默认值</span>
                      </summary>
                      <FieldGroup className="settings-grid">
                        {limitFields.map(([key, label, unit, factor]) => (
                          <Field key={key}>
                            <FieldLabel htmlFor={`limit-${key}`}>
                              {label}（{unit}）
                            </FieldLabel>
                            <Input
                              id={`limit-${key}`}
                              type="number"
                              min={1 / factor}
                              step={1 / factor}
                              max={Number.MAX_SAFE_INTEGER / factor}
                              value={draft.limits[key]}
                              placeholder={String(
                                snapshot.defaults[key] / factor,
                              )}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  limits: {
                                    ...draft.limits,
                                    [key]: e.target.value,
                                  },
                                })
                              }
                              aria-describedby={`limit-${key}-help`}
                            />
                            <FieldDescription id={`limit-${key}-help`}>
                              默认 {snapshot.defaults[key] / factor} {unit}
                            </FieldDescription>
                          </Field>
                        ))}
                      </FieldGroup>
                    </details>
                    <p className="settings-location">
                      配置文件 <code>{snapshot.path}</code>
                    </p>
                  </fieldset>
                )}
              </div>
              <footer className="settings-footer">
                {error && (
                  <div className="settings-error" role="alert">
                    <span>{error}</span>
                    <Button
                      onClick={() => {
                        if (
                          !dirty ||
                          window.confirm("重新加载会放弃当前修改，继续吗？")
                        )
                          setReload((v) => v + 1);
                      }}
                    >
                      重新加载配置
                    </Button>
                  </div>
                )}
                {discard ? (
                  <div className="settings-discard" role="alert">
                    <span>有未保存的修改，要放弃吗？</span>
                    <Button onClick={() => setDiscard(false)}>继续编辑</Button>
                    <Button onClick={() => setOpen(false)}>放弃修改</Button>
                  </div>
                ) : (
                  <div className="settings-actions">
                    <span role="status">
                      {dirty ? "有未保存的修改" : saved ? "配置已保存" : ""}
                    </span>
                    <Button onClick={close} disabled={saving}>
                      关闭
                    </Button>
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={!draft || !dirty || loading}
                      loading={saving}
                    >
                      {saving ? "正在保存…" : "保存配置"}
                    </Button>
                  </div>
                )}
              </footer>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
