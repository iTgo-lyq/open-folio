import "server-only";
import { z } from "zod";
import {
  personalSessions,
  type PersonalSessions,
} from "./personal-sessions.ts";
import { AppError } from "./errors.ts";
import {
  sessionCookie,
  requirePersonalOrigin,
  readPersonalBody,
  personalJson,
  personalError,
  renewPersonalResponse,
  requestRevision,
} from "./personal-http.ts";
export async function tokenResponse(
  request: Request,
  store: PersonalSessions = personalSessions(),
) {
  try {
    requirePersonalOrigin(request);
    if (
      new URL(request.url).search ||
      (request.body &&
        !z
          .object({})
          .strict()
          .safeParse(await readPersonalBody(request)).success)
    )
      throw new AppError(
        "INVALID_PARAMETER",
        "复制仅适用于当前已登录凭据。",
        400,
      );
    const lease = await store.lease(
      sessionCookie(request),
      undefined,
      request.signal,
      false,
      requestRevision(request),
    );
    try {
      const response = lease.context.secret.use((token) =>
        personalJson({ token }),
      );
      await renewPersonalResponse(request, response, store);
      await lease.assertCurrent();
      return response;
    } finally {
      lease.release();
    }
  } catch (e) {
    return personalError(e);
  }
}
export async function devicesResponse(
  request: Request,
  id?: string,
  store: PersonalSessions = personalSessions(),
) {
  try {
    if (request.method === "GET" && !id)
      return await renewPersonalResponse(
        request,
        personalJson({
          devices: await store.devices(
            sessionCookie(request),
            requestRevision(request),
          ),
        }),
        store,
      );
    requirePersonalOrigin(request);
    if (request.method !== "DELETE" || !z.string().uuid().safeParse(id).success)
      throw new AppError("INVALID_PARAMETER", "设备参数不合法。", 400);
    const result = await store.revokeDevice(
      sessionCookie(request),
      id!,
      requestRevision(request),
    );
    return personalJson(result);
  } catch (e) {
    return personalError(e);
  }
}
