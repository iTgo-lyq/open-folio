"use client";
// 工作台壳层：展开侧栏 / 点击标志收起为悬浮胶囊、浮在内容面上的玻璃顶栏、同步状态、账号菜单与手机底部导航。
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronsUpDown,
  GitPullRequest,
  House,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  TriangleAlert,
  PanelsTopLeft,
  X,
  KeyRound,
} from "lucide-react";
import {
  Avatar,
  BrandMark,
  Button,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from "@open-folio/ui";
import { primaryRecord } from "@/lib/model";
import { CLEAR_PROTOTYPE_VIEW } from "@/lib/prototypes";
import { syncStatus } from "@/lib/sync-status";
import { useWorkspace } from "./context";
import { usePersonal } from "./personal-context";
import { useAccountActions } from "./account-actions";
import { useTheme } from "./theme";
import { useMediaQuery, useOnline } from "./use-media";
import { ToolbarSlotContext, type ToolbarSlots } from "./toolbar-slot";
import styles from "./shell.module.css";

type Module = "home" | "specs" | "changes" | "prototypes" | "connections";
const NAV = [
  { id: "home", title: "我的仓库", short: "仓库", icon: House },
  { id: "specs", title: "Specs", short: "Specs", icon: BookOpen },
  { id: "changes", title: "Changes", short: "Changes", icon: GitPullRequest },
  { id: "prototypes", title: "原型", short: "原型", icon: PanelsTopLeft },
] as const;

export function Shell({
  module,
  focusedPreview,
  children,
  banners,
}: {
  module: Module;
  focusedPreview: boolean;
  children: ReactNode;
  banners?: ReactNode;
}) {
  const { nav, q, projectId, data, message, notice } = useWorkspace();
  const personal = usePersonal();
  const mobile = useMediaQuery("(max-width: 760px)");
  const tablet = useMediaQuery("(min-width: 761px) and (max-width: 1023px)");
  const preference =
    personal.session?.workspace?.preferences.railCollapsed ?? false;
  const [collapsedPref, setCollapsedPref] = useState(preference);
  const [tabletExpanded, setTabletExpanded] = useState(false);
  useEffect(() => setCollapsedPref(preference), [preference]);
  const collapsed = tablet ? !tabletExpanded : collapsedPref;
  const [slots, setSlots] = useState<ToolbarSlots>({ left: null, right: null });
  const leftSlot = useCallback(
    (left: HTMLDivElement | null) =>
      setSlots((s) => (s.left === left ? s : { ...s, left })),
    [],
  );
  const rightSlot = useCallback(
    (right: HTMLDivElement | null) =>
      setSlots((s) => (s.right === right ? s : { ...s, right })),
    [],
  );
  const reading = ["specs", "changes", "prototypes"].includes(module);
  const toggle = () => {
    if (mobile) return;
    if (tablet) return setTabletExpanded((v) => !v);
    const next = !collapsedPref;
    setCollapsedPref(next);
    void personal
      .updatePreferences({ railCollapsed: next })
      .catch((e) => notice(e.message));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const go = (m: string) => nav({ m, doc: null, ...CLEAR_PROTOTYPE_VIEW });
  const signedIn = !!personal.session?.authenticated;
  const usable = (id: string) =>
    id === "home" || (!!projectId && !!personal.connection);
  const count = (id: string) => {
    if (!data || id === "home" || id === "specs") return undefined;
    if (id === "changes")
      return (
        data.changes.filter((g) => primaryRecord(g)?.state?.status === "active")
          .length || undefined
      );
    return data.currentPrototype.entries.length || undefined;
  };
  const navLink = (
    item: (typeof NAV)[number],
    variant: "full" | "rail" | "mobile",
  ) => {
    const current = module === item.id;
    const disabled = !usable(item.id);
    const link = (
      <a
        key={item.id}
        href={`?${new URLSearchParams({ ...q, m: item.id })}`}
        className={styles[`${variant}Item`]}
        aria-label={variant === "rail" ? item.title : undefined}
        aria-current={current ? "page" : undefined}
        aria-disabled={disabled || undefined}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) go(item.id);
        }}
      >
        <item.icon size={variant === "full" ? 16 : 18} aria-hidden="true" />
        {variant === "full" && (
          <>
            <span className={styles.grow}>{item.title}</span>
            {count(item.id) && (
              <span className={styles.count}>{count(item.id)}</span>
            )}
          </>
        )}
        {variant === "mobile" && <span>{item.short}</span>}
      </a>
    );
    return variant === "rail" ? (
      <Tooltip
        key={item.id}
        side="right"
        content={
          disabled ? `${item.title}：先选择仓库并绑定 Token` : item.title
        }
      >
        {link}
      </Tooltip>
    ) : (
      link
    );
  };
  return (
    <ToolbarSlotContext.Provider value={slots}>
      <div
        className={styles.app}
        data-collapsed={collapsed || undefined}
        style={{ colorScheme: "var(--of-color-scheme)" }}
      >
        <aside className={styles.side} aria-label="工作台导航">
          <div className={styles.sideHead}>
            <Tooltip
              side="right"
              content={`${collapsed ? "展开侧栏" : "收起侧栏"}  ⌘\\`}
            >
              <button
                type="button"
                className={styles.logo}
                onClick={toggle}
                aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
                aria-expanded={!collapsed}
                aria-keyshortcuts="Meta+Backslash Control+Backslash"
              >
                <BrandMark size={24} label="OpenFolio" />
                <span className={styles.wordmark} aria-hidden="true">
                  OpenFolio
                </span>
              </button>
            </Tooltip>
          </div>
          <div className={styles.full} inert={collapsed}>
            <nav className={styles.sideNav} aria-label="模块导航">
              {navLink(NAV[0], "full")}
              {signedIn && personal.connection && (
                <div className={styles.group}>
                  <RepoMenu variant="side" />
                  {NAV.slice(1).map((n) => navLink(n, "full"))}
                </div>
              )}
            </nav>
            {signedIn && (
              <div className={styles.foot}>
                <AccountMenu active={module === "connections"} />
              </div>
            )}
          </div>
          <div className={styles.rail} inert={!collapsed}>
            <nav className={styles.capsule} aria-label="模块导航">
              {NAV.map((n) => navLink(n, "rail"))}
            </nav>
            {signedIn && (
              <div className={styles.railFoot}>
                <AccountMenu compact active={module === "connections"} />
              </div>
            )}
          </div>
        </aside>
        <main className={styles.surface} id="main" tabIndex={-1}>
          <header className={styles.toolbar}>
            <div className={styles.tbLeft}>
              {focusedPreview ? (
                <button
                  type="button"
                  className={styles.back}
                  onClick={() => nav(CLEAR_PROTOTYPE_VIEW)}
                  aria-label="返回原型总览"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  原型
                </button>
              ) : reading && personal.connection ? (
                <RepoMenu variant="toolbar" />
              ) : (
                <span className={styles.tbBrand}>
                  <BrandMark size={22} />
                </span>
              )}
              <div className={styles.slot} ref={leftSlot} />
            </div>
            <div className={styles.tbRight}>
              <div className={styles.slot} ref={rightSlot} />
              {reading && personal.connection && <SyncStatus module={module} />}
              {signedIn && (
                <span className={styles.tbAccount}>
                  <AccountMenu compact active={module === "connections"} />
                </span>
              )}
            </div>
          </header>
          <div className={styles.body}>
            {banners}
            {children}
          </div>
        </main>
        <nav className={styles.mobileNav} aria-label="模块导航">
          {NAV.map((n) => navLink(n, "mobile"))}
        </nav>
        {message && (
          <div className={styles.toast} role="status">
            <span>{message}</span>
            <IconButton
              aria-label="关闭提示"
              size="sm"
              onClick={() => notice("")}
            >
              <X />
            </IconButton>
          </div>
        )}
      </div>
    </ToolbarSlotContext.Provider>
  );
}

// 侧栏与收起 / 手机顶栏共用的仓库切换菜单。
function RepoMenu({ variant }: { variant: "side" | "toolbar" }) {
  const { projects, projectId, q, selectRepository, nav } = useWorkspace();
  const current =
    projects.find((p) => p.id === projectId)?.name ??
    (projectId ? (q.fullName ?? "分享的仓库") : "");
  const [owner, name] = current.includes("/")
    ? [
        current.slice(0, current.indexOf("/")),
        current.slice(current.indexOf("/") + 1),
      ]
    : ["", current];
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={variant === "side" ? styles.repoSwitch : styles.tbRepo}
          aria-label={current ? `当前仓库：${current}，切换仓库` : "选择仓库"}
        >
          <Avatar
            name={name || "?"}
            shape="square"
            size={variant === "side" ? undefined : "sm"}
          />
          {variant === "side" ? (
            <span className={styles.stack}>
              <strong>{name || "选择仓库"}</strong>
              {owner && <small>{owner}</small>}
            </span>
          ) : (
            <span className={styles.clamp}>{name || "选择仓库"}</span>
          )}
          {variant === "side" ? (
            <ChevronsUpDown
              size={14}
              className={styles.faint}
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              size={14}
              className={styles.faint}
              aria-hidden="true"
            />
          )}
        </button>
      </MenuTrigger>
      <MenuContent aria-label="切换仓库" className={styles.wideMenu}>
        <MenuLabel>切换仓库</MenuLabel>
        <MenuRadioGroup
          value={projectId}
          onValueChange={(key) => selectRepository(key)}
        >
          {projects.map((p) => (
            <MenuRadioItem key={p.id} value={p.id}>
              <Avatar
                name={p.name.split("/").pop() ?? p.name}
                shape="square"
                size="sm"
              />
              <span className={styles.clamp}>{p.name}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem
          onSelect={() =>
            nav({ m: "home", doc: null, ...CLEAR_PROTOTYPE_VIEW })
          }
        >
          <House aria-hidden="true" />
          所有仓库
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

// 侧栏底部的唯一身份入口：切换 Token、账号设置、外观与退出。
function AccountMenu({
  compact,
  active,
}: {
  compact?: boolean;
  active: boolean;
}) {
  const personal = usePersonal();
  const { nav, notice } = useWorkspace();
  const [theme, setTheme] = useTheme();
  const { busy, switchTo, logout } = useAccountActions();
  const username = personal.session?.account?.username ?? "";
  const connection = personal.connection;
  const trigger = (
    <button
      type="button"
      className={compact ? styles.accountCompact : styles.accountButton}
      data-active={active || undefined}
      aria-label={`账号：${username}`}
    >
      <Avatar name={username || "?"} size="md" />
      {!compact && (
        <>
          <span className={styles.stack}>
            <strong>{username}</strong>
            <small>{connection?.label ?? "尚未选择 Token"}</small>
          </span>
          <ChevronsUpDown
            size={14}
            className={styles.faint}
            aria-hidden="true"
          />
        </>
      )}
    </button>
  );
  return (
    <Menu>
      {compact ? (
        <Tooltip side="right" content="账号">
          <MenuTrigger asChild>{trigger}</MenuTrigger>
        </Tooltip>
      ) : (
        <MenuTrigger asChild>{trigger}</MenuTrigger>
      )}
      <MenuContent
        aria-label="账号"
        side={compact ? "right" : "top"}
        align={compact ? "end" : "start"}
        className={styles.wideMenu}
      >
        <div className={styles.menuHead}>
          <Avatar name={username || "?"} size="lg" />
          <span className={styles.stack}>
            <strong>{username}</strong>
            <small>OpenFolio 账号</small>
          </span>
        </div>
        <MenuSeparator />
        <MenuLabel>使用的 Token</MenuLabel>
        {personal.session?.connections.length ? (
          <MenuRadioGroup
            value={connection?.id ?? ""}
            onValueChange={(id) =>
              void switchTo(id).then(
                (error) => error && notice(`切换失败：${error}`),
              )
            }
          >
            {personal.session.connections.map((c) => (
              <MenuRadioItem key={c.id} value={c.id} disabled={!!busy}>
                <KeyRound aria-hidden="true" />
                <span className={styles.stack}>
                  <span>{c.label}</span>
                  <small>@{c.identity.login}</small>
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        ) : (
          <p className={styles.menuNote}>尚未绑定 Token。</p>
        )}
        <MenuItem
          onSelect={() =>
            nav({ m: "connections", doc: null, ...CLEAR_PROTOTYPE_VIEW })
          }
        >
          <Settings aria-hidden="true" />
          账号与 Token
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>外观</MenuLabel>
        <MenuRadioGroup
          value={theme}
          onValueChange={(v) => setTheme(v as "light" | "dark")}
        >
          <MenuRadioItem value="light">
            <Sun aria-hidden="true" />
            浅色
          </MenuRadioItem>
          <MenuRadioItem value="dark">
            <Moon aria-hidden="true" />
            深色
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem
          disabled={!!busy}
          onSelect={() =>
            void logout().then((error) => error && notice(`退出失败：${error}`))
          }
        >
          <LogOut aria-hidden="true" />
          退出登录
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

// 顶栏唯一的读取状态入口：来源、快照时间与刷新。
function SyncStatus({ module }: { module: Module }) {
  const { data, loading, refreshing, error, errorCode, refresh, q, nav } =
    useWorkspace();
  const personal = usePersonal();
  const online = useOnline();
  const status = syncStatus({ online, loading, refreshing, error, errorCode });
  const branch =
    module === "changes"
      ? data?.integrationBranch
      : (data?.selectedBranch ?? data?.integrationBranch);
  const commit = data?.branches.find((b) => b.name === branch)?.commit;
  const time = data
    ? new Date(data.capturedAt).toLocaleString("zh-CN", { hour12: false })
    : "尚未读取";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={styles.sync}
          data-tone={status.tone}
          aria-label={`同步状态：${status.label}`}
        >
          <span className={styles.syncDot} aria-hidden="true" />
          <span className={styles.syncLabel}>{status.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="读取来源"
        align="end"
        className={styles.syncPop}
      >
        <strong className={styles.popTitle}>读取来源</strong>
        <dl className={styles.kv}>
          <dt>仓库</dt>
          <dd>{data?.projectName ?? q.fullName ?? "—"}</dd>
          <dt>分支</dt>
          <dd>
            <code>{branch ?? "待接入"}</code>
          </dd>
          <dt>快照</dt>
          <dd>
            {commit && <code>{commit.slice(0, 7)}</code>}{" "}
            {refreshing ? "正在读取…" : time}
          </dd>
          <dt>Token</dt>
          <dd>{personal.connection?.label ?? "未选择"}</dd>
        </dl>
        {status.detail && (
          <p className={styles.popNote} data-tone={status.tone}>
            <TriangleAlert size={15} aria-hidden="true" />
            <span>{status.detail}</span>
          </p>
        )}
        <div className={styles.popActions}>
          <Button
            size="sm"
            onClick={() => void refresh()}
            disabled={!personal.connection || refreshing}
            aria-label={refreshing ? "正在读取中心仓库" : "刷新中心仓库"}
          >
            <RefreshCw
              className={refreshing ? styles.spin : undefined}
              aria-hidden="true"
            />
            刷新
          </Button>
          {status.tone === "error" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => nav({ m: "connections", ...CLEAR_PROTOTYPE_VIEW })}
            >
              当前凭据
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
