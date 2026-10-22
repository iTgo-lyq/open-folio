"use client";
import { useRef } from "react";
import { Copy, FileText, MoreHorizontal, X } from "lucide-react";
import {
  Button,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@open-folio/ui";
import type { DocumentRef } from "@/lib/model";
import { Empty, Markdown, Source, useCopyPageLink } from "./document";
import { useWorkspace, useDocument } from "./context";
import styles from "./reader.module.css";
import { reportSharedResourceFailure } from "./api";

export function ReadingDocument({
  value,
  error,
  loading,
  after,
}: {
  value: { document: DocumentRef; body: string } | null;
  error: string;
  loading: boolean;
  after?: React.ReactNode;
}) {
  const { q, nav, refresh } = useWorkspace();
  const trigger = useRef<HTMLButtonElement>(null);
  const copy = useCopyPageLink(value?.document);
  if (error)
    return (
      <Empty title="暂时无法读取文档">
        <p>{error}</p>
        <Button onClick={() => void refresh()}>读取最新版本</Button>
      </Empty>
    );
  if (!value)
    return <Empty title={loading ? "正在读取文档…" : "选择一份文档"} />;
  const doc = value.document;
  return (
    <>
      <div className={styles.docMeta} role="group" aria-label="文档来源">
        <code title={doc.path}>{doc.path}</code>
        <span>· {doc.branch}</span>
        <code title={doc.commit}>{doc.commit.slice(0, 7)}</code>
        <Menu>
          <MenuTrigger asChild>
            <IconButton ref={trigger} aria-label="更多操作" tooltip>
              <MoreHorizontal />
            </IconButton>
          </MenuTrigger>
          <MenuContent
            aria-label="文档操作"
            align="end"
            onCloseAutoFocus={(event) => {
              if (q.raw) event.preventDefault();
            }}
          >
            <MenuItem onSelect={() => void copy()}>
              <Copy />
              复制阅读链接
            </MenuItem>
            <MenuItem onSelect={() => nav({ raw: "1" })}>
              <FileText />
              查看原文
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      {doc.kind === "json" ? (
        <>
          <h1>{doc.title}</h1>
          <pre className={styles.raw}>{value.body}</pre>
        </>
      ) : (
        <Markdown body={value.body} document={doc} className={styles.prose} />
      )}
      {after}
      <Sheet
        open={!!q.raw}
        onOpenChange={(open) => {
          if (!open) nav({ raw: null });
        }}
      >
        <SheetContent
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>原文</SheetTitle>
            <IconButton
              aria-label="关闭原文"
              onClick={() => nav({ raw: null })}
            >
              <X />
            </IconButton>
          </SheetHeader>
          <SheetBody>
            <div className={styles.docMeta}>
              <code>{doc.path}</code>
              <span>
                {doc.branch} · {doc.commit.slice(0, 7)}
              </span>
            </div>
            <pre className={styles.raw} tabIndex={0}>
              {value.body}
            </pre>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function DocumentSheet() {
  const { q, nav, data, readUrl } = useWorkspace();
  const doc = data?.documents.find((document) => document.id === q.doc);
  const { value, error, loading } = useDocument(
    doc?.kind === "image" ? undefined : q.doc,
  );
  const focus = useRef<HTMLElement | null>(null);
  return (
    <Sheet
      open={!!q.doc}
      onOpenChange={(open) => {
        if (!open) nav({ doc: null, da: null, raw: null, asset: null });
      }}
    >
      <SheetContent
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          focus.current = window.document.activeElement as HTMLElement;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (focus.current?.isConnected) focus.current.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>{doc?.title ?? "文档"}</SheetTitle>
          <IconButton
            aria-label="关闭文档"
            onClick={() => nav({ doc: null, da: null, raw: null, asset: null })}
          >
            <X />
          </IconButton>
        </SheetHeader>
        <SheetBody>
          {doc?.kind === "image" ? (
            <>
              <img
                className={styles.image}
                src={readUrl(`assets/${doc.id}?snapshot=${data!.id}`)}
                alt={doc.title}
                onError={() =>
                  void reportSharedResourceFailure(
                    readUrl(`assets/${doc.id}?snapshot=${data!.id}`),
                  )
                }
              />
              <Source document={doc} />
            </>
          ) : error ? (
            <Empty title="暂时无法读取文档">
              <p>{error}</p>
            </Empty>
          ) : !value ? (
            <Empty title={loading ? "正在读取文档…" : "选择一份文档"} />
          ) : (
            <>
              <Source document={value.document} />
              {q.raw || value.document.kind === "json" ? (
                <pre className={styles.raw} tabIndex={0}>
                  {value.body}
                </pre>
              ) : (
                <Markdown
                  body={value.body}
                  document={value.document}
                  className={styles.prose}
                />
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
