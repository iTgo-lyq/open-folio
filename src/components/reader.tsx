"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ListTree, PanelLeft, Type, X } from "lucide-react";
import {
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Switch,
} from "@open-folio/ui";
import type { Heading } from "@/lib/model";
import { useSavedScroll } from "./context";
import { ToolbarSlot } from "./toolbar-slot";
import { useMediaQuery } from "./use-media";
import styles from "./reader.module.css";

type Preferences = { size: "normal" | "large"; focus: boolean };
const preferenceKey = "openfolio.reading";

// Specs、Change 材料和匿名分享共用滚动、目录及本机阅读偏好。
export function Reader({
  pane,
  paneLabel,
  paneTitle,
  headings = [],
  pageKey,
  anchor,
  onAnchor,
  ready = true,
  wide = false,
  children,
}: {
  pane: ReactNode;
  paneLabel: string;
  paneTitle: string;
  headings?: Heading[];
  pageKey: string;
  anchor?: string;
  onAnchor: (id: string) => void;
  ready?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const fullToc = useMediaQuery("(min-width: 1280px)");
  const [preferences, setPreferences] = useState<Preferences>({
    size: "normal",
    focus: false,
  });
  const [hidden, setHidden] = useState(false),
    [paneOpen, setPaneOpen] = useState(false),
    [tocOpen, setTocOpen] = useState(false);
  const [active, setActive] = useState("");
  const article = useRef<HTMLElement>(null),
    paneNavigated = useRef(false),
    tocNavigated = useRef(false),
    headingFocus = useRef("");
  const scroll = useSavedScroll(
    `${pageKey}.${ready ? "loaded" : "pending"}`,
    anchor,
  );
  const previousPage = useRef(pageKey);
  useEffect(() => {
    if (previousPage.current === pageKey) return;
    previousPage.current = pageKey;
    const frame = requestAnimationFrame(() =>
      article.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [pageKey]);
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(preferenceKey) ?? "null");
      if (value)
        setPreferences({
          size: value.size === "large" ? "large" : "normal",
          focus: value.focus === true,
        });
    } catch {}
  }, []);
  const update = (patch: Partial<Preferences>) =>
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  const signature = headings.map((h) => h.id).join("\n");
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    let frame = 0;
    const updateActive = () => {
      const inset =
        parseFloat(getComputedStyle(element).scrollPaddingTop) || 76;
      const top = element.getBoundingClientRect().top + inset;
      const items = Array.from(
        element.querySelectorAll<HTMLElement>(
          "h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]",
        ),
      );
      let id = items[0]?.id ?? "";
      for (const item of items)
        if (item.getBoundingClientRect().top <= top + 24) id = item.id;
      if (
        items.length &&
        element.scrollTop > 0 &&
        element.scrollTop + element.clientHeight >= element.scrollHeight - 4
      )
        id = items.at(-1)!.id;
      setActive(id);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActive);
    };
    schedule();
    element.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    if (article.current) observer.observe(article.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [pageKey, ready, signature, preferences.size, scroll]);
  const focusHeading = () => {
    const id = headingFocus.current;
    headingFocus.current = "";
    requestAnimationFrame(() => {
      const target = id
        ? scroll.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
        : article.current;
      if (target) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    });
  };
  const selectHeading = (id: string) => {
    if (tocOpen) tocNavigated.current = true;
    headingFocus.current = id;
    onAnchor(id);
    setTocOpen(false);
    setPaneOpen(false);
    focusHeading();
  };
  const toc = (
    <nav aria-label="本页目录" className={styles.tocLinks}>
      {headings.map((h) => (
        <a
          key={h.id}
          href={`#${encodeURIComponent(h.id)}`}
          aria-current={active === h.id ? "location" : undefined}
          style={{ paddingLeft: 10 + Math.max(0, h.depth - 2) * 12 }}
          onClick={(event) => {
            event.preventDefault();
            selectHeading(h.id);
          }}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
  const hidePane = hidden || preferences.focus;
  const closePaneForLink = (event: React.MouseEvent) => {
    if ((event.target as Element).closest("a")) {
      paneNavigated.current = true;
      setPaneOpen(false);
    }
  };
  return (
    <>
      <ToolbarSlot side="right">
        {(!desktop || hidePane) && (
          <IconButton
            aria-label={`打开${paneLabel}`}
            tooltip
            onClick={() => {
              if (desktop) {
                setHidden(false);
                update({ focus: false });
              } else setPaneOpen(true);
            }}
          >
            <PanelLeft />
          </IconButton>
        )}
        {headings.length > 0 && (!fullToc || preferences.focus || wide) && (
          <IconButton
            aria-label="本页目录"
            tooltip
            onClick={() => setTocOpen(true)}
          >
            <ListTree />
          </IconButton>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <IconButton aria-label="阅读设置" tooltip>
              <Type />
            </IconButton>
          </PopoverTrigger>
          <PopoverContent
            aria-label="阅读设置"
            align="end"
            className={styles.preferences}
          >
            <strong>阅读设置</strong>
            <div className={styles.preferenceRow}>
              <span>字号</span>
              <SegmentedControl
                label="字号"
                value={preferences.size}
                onValueChange={(value) =>
                  update({ size: value as Preferences["size"] })
                }
                items={[
                  { value: "normal", label: "标准" },
                  { value: "large", label: "较大" },
                ]}
              />
            </div>
            {desktop && (
              <>
                <div className={styles.preferenceRow}>
                  <span>专注阅读</span>
                  <Switch
                    aria-label="专注阅读"
                    checked={preferences.focus}
                    onCheckedChange={(focus) => update({ focus })}
                  />
                </div>
                <p>专注阅读收起目录，只保留正文。</p>
              </>
            )}
          </PopoverContent>
        </Popover>
      </ToolbarSlot>
      <div
        className={styles.reader}
        data-pane-hidden={hidePane || undefined}
        data-toc-hidden={
          !headings.length || preferences.focus || wide || undefined
        }
        data-size={preferences.size}
        data-wide={wide || undefined}
      >
        <aside className={styles.pane} aria-label={paneLabel}>
          <div className={styles.paneHeading}>
            <strong>{paneTitle}</strong>
            <IconButton
              size="sm"
              aria-label="收起目录"
              tooltip
              onClick={() => setHidden(true)}
            >
              <PanelLeft />
            </IconButton>
          </div>
          {pane}
        </aside>
        <div
          className={styles.scroll}
          ref={scroll}
          role="region"
          aria-label="阅读正文"
        >
          <article className={styles.article} ref={article} tabIndex={-1}>
            {children}
          </article>
        </div>
        {!!headings.length && (
          <aside className={styles.toc}>
            <div>本页目录</div>
            {toc}
          </aside>
        )}
      </div>
      <Sheet open={paneOpen} onOpenChange={setPaneOpen}>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            if (paneNavigated.current) {
              event.preventDefault();
              paneNavigated.current = false;
              article.current?.focus({ preventScroll: true });
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{paneLabel}</SheetTitle>
            <IconButton
              aria-label="关闭目录"
              onClick={() => setPaneOpen(false)}
            >
              <X />
            </IconButton>
          </SheetHeader>
          <SheetBody onClick={closePaneForLink}>
            {pane}
            {!!headings.length && (
              <div className={styles.sheetToc}>
                <strong>本页目录</strong>
                {toc}
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
      <Sheet open={tocOpen} onOpenChange={setTocOpen}>
        <SheetContent
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            if (tocNavigated.current) {
              event.preventDefault();
              tocNavigated.current = false;
              headingFocus.current = anchor ?? "";
              focusHeading();
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>本页目录</SheetTitle>
            <IconButton aria-label="关闭目录" onClick={() => setTocOpen(false)}>
              <X />
            </IconButton>
          </SheetHeader>
          <SheetBody>{toc}</SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
