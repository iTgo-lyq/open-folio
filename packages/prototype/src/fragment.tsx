import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@open-folio/ui/styles.css";
import "../../../src/app/globals.css";
import "./fragment.css";
import { Shell } from "../../../src/components/shell";
import { PublicShell } from "../../../src/components/public-shell";
import { Empty } from "../../../src/components/document";
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
export function WorkbenchFrame({
  module,
  children,
}: {
  module: Fragment["module"];
  children: ReactNode;
}) {
  const { q } = useWorkspace();
  return (
    <Shell module={module} focusedPreview={!!q.prototype}>
      {children}
    </Shell>
  );
}
export function ReadingState({
  scene,
  children,
}: {
  scene: string;
  children: ReactNode;
}) {
  return scene === "loading" || scene === "error" || scene === "empty" ? (
    <PublicShell title="只读材料">
      <Empty
        title={
          scene === "loading"
            ? "正在读取…"
            : scene === "error"
              ? "演示读取失败，请切换正常场景重试。"
              : "暂无内容"
        }
      />
    </PublicShell>
  ) : (
    children
  );
}
function Scene({ fragment, scene }: { fragment: Fragment; scene: string }) {
  useState(() => {
    resetMock(scene);
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
