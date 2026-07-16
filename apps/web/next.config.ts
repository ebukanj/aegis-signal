import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone output — the deployment story.
   *
   * `next build` traces exactly which node_modules the server needs and emits a
   * self-contained `./.next/standalone` folder. The production Docker image copies
   * that folder and nothing else: no pnpm, no workspace, no dev tooling — a small
   * image that starts with plain `node server.js` on Coolify.
   *
   * Windows note: the tracing step creates SYMLINKS (pnpm's store layout), which
   * Windows only allows with Developer Mode on. A local `pnpm build` on a stock
   * Windows box fails at "copy traced files" — the Docker build on Linux, which is
   * the only place this output is consumed, is unaffected.
   */
  output: "standalone",
};

export default nextConfig;
