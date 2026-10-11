import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.OPENFOLIO_BUILD_DIR || ".next",
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["playwright"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/((?!prototype-assets(?:/|$)).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        source: "/current-preview/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/preview/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};
export default config;
