import { expect, type FrameLocator, type Page } from "@playwright/test";

export async function verifyPrototypeCapabilities(
  page: Page,
  frame: FrameLocator,
) {
  const body = frame.locator("body");
  await body.evaluate((body) => {
    const controls = document.createElement("div");
    controls.id = "capabilities";
    controls.innerHTML =
      '<button>确认框</button><button>打开窗口</button><a download="prototype.txt">下载</a>';
    controls.querySelector("button")!.onclick = () => {
      controls.dataset.confirmed = String(confirm("原型确认"));
    };
    controls.querySelectorAll("button")[1].onclick = () =>
      window.open("about:blank");
    controls.querySelector("a")!.href = URL.createObjectURL(
      new Blob(["prototype"]),
    );
    body.prepend(controls);
  });
  const controls = frame.locator("#capabilities");
  try {
    for (const accepted of [true, false]) {
      const dialog = page.waitForEvent("dialog").then(async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toBe("原型确认");
        if (accepted) await dialog.accept();
        else await dialog.dismiss();
      });
      await controls
        .getByRole("button", { name: "确认框", exact: true })
        .click();
      await dialog;
      await expect(controls).toHaveAttribute(
        "data-confirmed",
        String(accepted),
      );
    }
    expect(
      await body.evaluate(async () => {
        const policy = (
          document as Document & {
            featurePolicy: { allowsFeature(feature: string): boolean };
          }
        ).featurePolicy;
        const permissions = [
          "camera",
          "microphone",
          "geolocation",
          "clipboard-write",
          "fullscreen",
        ].every((feature) => policy.allowsFeature(feature));
        const key = `openfolio-capability-${crypto.randomUUID()}`;
        localStorage.setItem(key, "ok");
        const storage = localStorage.getItem(key);
        localStorage.removeItem(key);
        const network = (await fetch(location.href)).ok;
        const worker = await new Promise<string>((resolve, reject) => {
          const url = URL.createObjectURL(
            new Blob(['postMessage("ok")'], { type: "text/javascript" }),
          );
          const worker = new Worker(url);
          worker.onmessage = (event) => {
            resolve(event.data);
            worker.terminate();
            URL.revokeObjectURL(url);
          };
          worker.onerror = reject;
        });
        const nested = document.createElement("iframe");
        nested.name = key;
        nested.srcdoc = '<p id="nested">ok</p>';
        const loaded = new Promise<void>(
          (resolve) => (nested.onload = () => resolve()),
        );
        document.body.append(nested);
        await loaded;
        const embedded =
          nested.contentDocument?.getElementById("nested")?.textContent;
        const form = document.createElement("form");
        form.target = key;
        form.action = location.href;
        const submitted = new Promise<void>(
          (resolve) => (nested.onload = () => resolve()),
        );
        document.body.append(form);
        form.submit();
        await submitted;
        const submission =
          nested.contentWindow?.location.pathname === location.pathname;
        form.remove();
        nested.remove();
        return { permissions, storage, network, worker, embedded, submission };
      }),
    ).toEqual({
      permissions: true,
      storage: "ok",
      network: true,
      worker: "ok",
      embedded: "ok",
      submission: true,
    });
    const popupEvent = page.waitForEvent("popup");
    await controls
      .getByRole("button", { name: "打开窗口", exact: true })
      .click();
    const popup = await popupEvent;
    try {
      await popup.waitForLoadState();
    } finally {
      await popup.close();
    }
    const downloadEvent = page.waitForEvent("download");
    await controls.getByRole("link", { name: "下载", exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe("prototype.txt");
    await download.delete();
  } finally {
    await controls.evaluate((controls) => {
      URL.revokeObjectURL(controls.querySelector("a")!.href);
      controls.remove();
    });
  }
}
