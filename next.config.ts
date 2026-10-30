import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright and the SQLite builtin must run in Node, not be bundled.
  serverExternalPackages: ["playwright", "playwright-core"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        // The sandboxed preview iframe has an opaque origin; fonts need CORS.
        source: "/fonts/:file*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
