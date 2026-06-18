import { getCurrentAdmin, isSetupRequired } from "@local/lib/auth";
import { json } from "@local/lib/http";
import { readCsrfToken } from "@local/lib/session";

export async function GET() {
  const [setupRequired, user, csrfToken] = await Promise.all([
    isSetupRequired(),
    getCurrentAdmin(),
    readCsrfToken(),
  ]);
  return json({
    setupRequired,
    authenticated: Boolean(user),
    csrfToken,
  });
}
