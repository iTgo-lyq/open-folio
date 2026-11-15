import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@open-folio/ui/styles.css";
import "../../../src/app/globals.css";
import "./fragment.css";
import { LoaderCircle } from "lucide-react";
import { Button } from "@open-folio/ui";
import { Shell } from "../../../src/components/shell";
import { Empty } from "../../../src/components/document";
import shellStyles from "../../../src/components/shell.module.css";
import { FragmentProvider, useWorkspace } from "./mocks/context";
import { PersonalProvider } from "./mocks/personal-context";
import { resetMock } from "./mocks/api";
import { installMemoryBrowser } from "./browser";

type Fragment = {
  title: string;
  module: "home" | "specs" | "changes" | "prototypes" | "connections";
  source: string;
  scenes?: string[];
  sharing?: boolean;
  render: (scene: string) => ReactNode;
};
const sceneNames: Record<string, string> = {
  default: "正常",
  empty: "空态",
  loading: "加载中",
  error: "请求失败",
  login: "登录 / 注册",
  unavailable: "不存在 / 已撤回",
};
// Workspace 未导出页面主体，这里按其读取占位和同步失败横幅轻量还原。
export function WorkbenchFrame({
  module,
  children,
}: {
  module: Fragment["module"];
  children: ReactNode;
}) {
  const { q, data, error, refresh, nav } = useWorkspace();
  const reading = ["specs", "changes", "prototypes"].includes(module);
  return (
    <Shell
      module={module}
      focusedPreview={!!q.prototype}
      banners={
        reading &&
        error && (
          <div className={shellStyles.banner} data-tone="error" role="alert">
            <span className={shellStyles.grow}>{error}</span>
            <Button size="sm" variant="ghost" onClick={() => void refresh()}>
              重试
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => nav({ m: "connections" })}
            >
              当前凭据
            </Button>
          </div>
        )
      }
    >
      {!reading || data ? (
        children
      ) : (
        <div className={shellStyles.legacy}>
          <Empty
            title="正在打开工作台…"
            icon={<LoaderCircle className={shellStyles.spin} />}
          />
        </div>
      )}
    </Shell>
  );
}
function Scene({ fragment, scene }: { fragment: Fragment; scene: string }) {
  useState(() => {
    resetMock(scene, fragment.module);
  });
  return (
    <PersonalProvider scene={scene}>
      <FragmentProvider
        module={fragment.module}
        scene={scene}
        sharing={fragment.sharing}
      >
        {fragment.render(scene)}
      </FragmentProvider>
    </PersonalProvider>
  );
}
function FragmentBench({ fragment }: { fragment: Fragment }) {
  const [scene, setScene] = useState("default");
  const [theme, setTheme] = useState("light");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const show = (event: Event) =>
      setNotice((event as CustomEvent<string>).detail);
    window.addEventListener("prototype-notice", show);
    return () => window.removeEventListener("prototype-notice", show);
  }, []);
  return (
    <>
      <header className="prototype-toolbar">
        <strong>{fragment.title}</strong>
        <label>
          场景{" "}
          <select
            aria-label="原型场景"
            value={scene}
            onChange={(event) => {
              localStorage.clear();
              sessionStorage.clear();
              setScene(event.target.value);
              setNotice("");
            }}
          >
            {(fragment.scenes ?? ["default", "empty", "loading", "error"]).map(
              (value) => (
                <option key={value} value={value}>
                  {sceneNames[value]}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          主题{" "}
          <select
            aria-label="原型主题"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <small title={fragment.source}>业务组件复用 · 虚构数据 · 仅内存</small>
      </header>
      <div className="prototype-surface" data-fragment={fragment.module}>
        <Scene key={scene} fragment={fragment} scene={scene} />
      </div>
      {notice && (
        <p className="prototype-notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
export function mount(fragment: Fragment) {
  installMemoryBrowser();
  createRoot(document.getElementById("prototype-root")!).render(
    <FragmentBench fragment={fragment} />,
  );
}
