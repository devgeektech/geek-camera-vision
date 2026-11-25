import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  transpilePackages: ["@visionops/shared"],
  async rewrites() {
    const destination = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";
    return [{ source: "/backend/:path*", destination: `${destination}/:path*` }];
  },
};

export default nextConfig;
