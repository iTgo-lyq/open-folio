import { test, expect, repositoryQuery } from "./connected";
function contrastSamples({
  selector,
  outline = false,
}: {
  selector: string;
  outline?: boolean;
}) {
  type Color = [number, number, number, number];
  const parse = (color: string): Color => {
    const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
    return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
  };
  const blend = (front: Color, back: Color): Color => [
    front[0] * front[3] + back[0] * (1 - front[3]),
    front[1] * front[3] + back[1] * (1 - front[3]),
    front[2] * front[3] + back[2] * (1 - front[3]),
    1,
  ];
  const background = (element: Element | null): Color =>
    element
      ? blend(
          parse(getComputedStyle(element).backgroundColor),
          background(element.parentElement),
        )
      : [255, 255, 255, 1];
  const luminance = (color: Color) =>
    color
      .slice(0, 3)
      .map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const ratio = (a: Color, b: Color) => {
    const values = [luminance(a), luminance(b)].sort((a, b) => a - b);
    return (values[1] + 0.05) / (values[0] + 0.05);
  };
  return [...document.querySelectorAll<HTMLElement>(selector)]
    .filter(
      (element) =>
        element.offsetWidth > 0 &&
        element.offsetHeight > 0 &&
        !element.hasAttribute("disabled"),
    )
    .map((element) => {
      const style = getComputedStyle(element),
        bg = background(outline ? element.parentElement : element);
      return {
        label:
          element.textContent?.trim().slice(0, 50) ||
          element.getAttribute("aria-label"),
        ratio: ratio(
          blend(parse(outline ? style.outlineColor : style.color), bg),
          bg,
        ),
        width: style.outlineWidth,
      };
    });
}
for (const theme of ["light", "dark"])
  test(`${theme} action, link, selected and status colors meet reading contrast`, async ({
    page,
    browser,
  }) => {
    await page.emulateMedia({
      reducedMotion: "reduce",
      colorScheme: theme as "light" | "dark",
    });
    await page.addInitScript(
      (theme) => localStorage.setItem("openfolio.theme", theme),
      theme,
    );
    await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader`);
    await expect(
      page.getByRole("heading", {
        name: "让工程文档成为清晰的阅读体验",
        exact: true,
      }),
    ).toBeVisible();
    await page.evaluate(async (theme) => {
      document.documentElement.dataset.theme = theme;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    }, theme);
    const samples = await page.evaluate(contrastSamples, {
      selector:
        '.of-ui-badge, nav a[aria-current="page"], a[href]:not([aria-label]), button:not(:empty)',
    });
    expect(samples.length).toBeGreaterThan(8);
    for (const sample of samples)
      expect(sample.ratio, sample.label ?? "action").toBeGreaterThanOrEqual(
        4.5,
      );
    await page.keyboard.press("Tab");
    const button = page.getByRole("button", { name: "分享", exact: true });
    await button.focus();
    const [focus] = await page.evaluate(contrastSamples, {
      selector: 'button[aria-label="分享"]',
      outline: true,
    });
    expect(focus.width).not.toBe("0px");
    expect(focus.ratio).toBeGreaterThanOrEqual(3);
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:10682",
      reducedMotion: "reduce",
    });
    try {
      const login = await context.newPage();
      await login.addInitScript(
        (theme) => localStorage.setItem("openfolio.theme", theme),
        theme,
      );
      await login.goto("/");
      await login.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await login.getByLabel("账号", { exact: true }).fill("contrast-check");
      await login.getByLabel("密码", { exact: true }).fill("fixture-password");
      const primary = login.getByRole("button", { name: "登录", exact: true });
      await expect(primary).toBeEnabled();
      const [action] = await login.evaluate(contrastSamples, {
        selector: ".of-ui-button--primary",
      });
      expect(action.ratio).toBeGreaterThanOrEqual(4.5);
    } finally {
      await context.close();
    }
  });
