import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse v1.1.1 reads ./test/data/05-versions-space.pdf on import.
  // Tell Next.js to include it in the serverless function bundle.
  outputFileTracingIncludes: {
    "/api/**": ["./test/data/**"],
  },
};

export default nextConfig;
