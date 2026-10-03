"use client";

// Last resort: replaces the whole document if the root layout itself fails.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", maxWidth: 360, padding: 24 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>EasyMail hit a problem</h1>
          <p style={{ color: "#666", fontSize: 14 }}>Your data is safe. Reload to try again.</p>
          <button
            onClick={() => retry()}
            style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: 0, background: "#111", color: "#fff", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
