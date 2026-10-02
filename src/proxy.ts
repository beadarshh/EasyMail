import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Optimistic gate: every page and server action also calls requireSession().
export async function proxy(request: NextRequest) {
  const ok = !!(await verifySession(request.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET));
  if (ok) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}

export const config = {
  // Webhooks (signature-verified) and cron (bearer secret) authenticate themselves.
  matcher: ["/((?!login|setup|api/webhooks|api/cron|_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest).*)"],
};
