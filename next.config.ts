import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Vercel caps function request bodies at 4.5 MB, so outgoing
      // attachments are limited to ~4 MB per email (see MAX_ATTACHMENT_MB).
      bodySizeLimit: "4.5mb",
    },
  },
  async redirects() {
    // Analytics was merged into the dashboard.
    return [{ source: "/analytics", destination: "/", permanent: true }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Not "no-referrer": that makes browsers send `Origin: null` on form
          // posts, which Next.js rejects for server actions. "same-origin" still
          // sends nothing to external sites (e.g. links clicked inside emails).
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
