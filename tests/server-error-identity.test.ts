import assert from "node:assert/strict";
import test from "node:test";

const errors = (copy: string) =>
  import(new URL(`../src/server/errors.ts?copy=${copy}`, import.meta.url).href);
const providers = (copy: string) =>
  import(
    new URL(`../src/server/providers/types.ts?copy=${copy}`, import.meta.url)
      .href
  );

test("business errors retain identity across instrumentation and API module copies", async () => {
  const startup = await errors("instrumentation");
  const api = await errors("api");
  assert.equal(startup.AppError, api.AppError);
  const denied = new startup.AppError(
    "SESSION_REQUIRED",
    "请先登录账号。",
    401,
  );
  assert.ok(denied instanceof api.AppError);
  assert.equal(api.publicError(denied), denied);
  assert.equal(api.publicError(denied).status, 401);
});

test("provider errors retain inheritance and retry hints across module copies", async () => {
  const startup = await providers("instrumentation");
  const api = await providers("api");
  const { AppError, publicError } = await errors("provider-api");
  assert.equal(startup.ProviderError, api.ProviderError);
  const limited = new startup.ProviderError(
    "RATE_LIMITED",
    "稍后重试。",
    429,
    "60",
  );
  assert.ok(limited instanceof api.ProviderError);
  assert.ok(limited instanceof AppError);
  assert.equal(publicError(limited), limited);
  assert.equal(publicError(limited).status, 429);
  assert.equal(publicError(limited).retryAfter, "60");
  const local = new AppError("SESSION_REQUIRED", "请先登录。", 401);
  assert.ok(!(local instanceof api.ProviderError));
});

test("unknown errors and similar objects remain private internal failures", async () => {
  const { publicError } = await errors("untrusted");
  for (const value of [
    new Error("private detail"),
    { code: "SESSION_REQUIRED", status: 401, message: "private detail" },
    Object.assign(new Error("private detail"), {
      code: "SESSION_REQUIRED",
      status: 401,
    }),
  ]) {
    const result = publicError(value);
    assert.equal(result.status, 503);
    assert.equal(result.code, "INTERNAL_ERROR");
    assert.ok(!result.message.includes("private detail"));
  }
});
