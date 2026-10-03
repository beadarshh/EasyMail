import { ImageResponse } from "next/og";

const SIZES = new Set([192, 512]);

// Installed-app (PWA) icon: the mark sits on a black background.
// The mark stays inside the central 60% so the same image works as a maskable icon.
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
        <svg viewBox="0 0 64 64" width={size * 0.6} height={size * 0.6}>
          <path d="M8 8 32 32 8 56Z" fill="#fafafa" />
          <path d="M20 44 56 8V32L32 56Z" fill="#fafafa" fillOpacity="0.45" />
          <path d="M44 44 56 32V56Z" fill="#fafafa" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
