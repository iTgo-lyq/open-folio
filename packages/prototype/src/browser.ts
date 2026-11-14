export function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(String(key));
    },
    setItem: (key, value) => {
      values.set(String(key), String(value));
    },
  };
}
export function installMemoryBrowser() {
  for (const name of ["localStorage", "sessionStorage"])
    Object.defineProperty(window, name, {
      configurable: true,
      value: memoryStorage(),
    });
  window.history.pushState = () => {};
  window.history.replaceState = () => {};
  window.fetch = async () => {
    throw Error("原型不允许真实请求；请在数据边界补齐 mock。");
  };
  let clipboard = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        clipboard = text;
      },
      readText: async () => clipboard,
    },
  });
  document.addEventListener("click", (event) => {
    const control = (event.target as Element).closest("button, input");
    if (
      (control instanceof HTMLButtonElement ||
        control instanceof HTMLInputElement) &&
      control.type === "submit" &&
      control.form &&
      !event.defaultPrevented
    ) {
      event.preventDefault();
      if (control.form.reportValidity())
        control.form.dispatchEvent(
          new SubmitEvent("submit", {
            bubbles: true,
            cancelable: true,
            submitter: control,
          }),
        );
    }
    if ((event.target as Element).closest("a") && !event.defaultPrevented) {
      event.preventDefault();
      window.dispatchEvent(
        new CustomEvent("prototype-notice", {
          detail: "外部链接仅演示，不会离开当前片段。",
        }),
      );
    }
  });
  document.addEventListener("keydown", (event) => {
    const input = event.target;
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      event.defaultPrevented ||
      !(input instanceof HTMLInputElement) ||
      !input.form
    )
      return;
    event.preventDefault();
    if (input.form.reportValidity())
      input.form.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
  });
}
