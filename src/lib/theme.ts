// 主题是设备偏好：默认跟随系统，用户选择保存在本机浏览器，匿名页面同样适用。
export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "openfolio.theme";

// 根布局在 <head> 内联执行，在首帧前写入 <html data-theme>；未选择时随系统切换，并同步其他标签页的选择。
export const themeScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)},d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");var s=function(){try{var v=localStorage.getItem(k);return v==="light"||v==="dark"?v:null}catch(e){return null}};var a=function(){d.setAttribute("data-theme",s()||(m.matches?"dark":"light"))};a();m.addEventListener("change",a);addEventListener("storage",function(e){if(e.key===k)a()})}catch(e){}})()`;

export function readTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 存储不可用时仍切换本页，刷新后回到系统设置。
  }
  document.documentElement.dataset.theme = theme;
}
