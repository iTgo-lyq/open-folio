import "server-only";
import {
  personalSessions,
  type PersonalSessions,
} from "./personal-sessions.ts";
import {
  requirePersonalOrigin,
  sessionCookie,
  readPersonalBody,
  personalJson,
  personalError,
  renewPersonalResponse,
  requestRevision,
} from "./personal-http.ts";
export async function preferencesResponse(
  request: Request,
  store: PersonalSessions = personalSessions(),
) {
  try {
    requirePersonalOrigin(request);
    const preferences = await store.updatePreferences(
      sessionCookie(request),
      await readPersonalBody(request),
      request.headers.get("x-openfolio-workspace") ?? undefined,
      requestRevision(request),
    );
    return await renewPersonalResponse(
      request,
      personalJson({ preferences }),
      store,
    );
  } catch (e) {
    return personalError(e);
  }
}
