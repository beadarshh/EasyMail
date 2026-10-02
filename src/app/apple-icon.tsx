import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icons can't be transparent (iOS fills them black), so the mark sits on white.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        <svg viewBox="0 0 64 64" width="120" height="120">
          <path d="M8 8 32 32 8 56Z" fill="#0a0a0a" />
          <path d="M20 44 56 8V32L32 56Z" fill="#0a0a0a" fillOpacity="0.45" />
          <path d="M44 44 56 32V56Z" fill="#0a0a0a" />
        </svg>
      </div>
    ),
    size,
  );
}
