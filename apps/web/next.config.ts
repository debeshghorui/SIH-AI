import type { NextConfig } from "next";

process.env.NEXT_TELEMETRY_DISABLED = "1";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8787/:path*",
      },
    ];
  },
};

export default nextConfig;
