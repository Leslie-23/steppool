import type { NextConfig } from "next";

// Static export: served by a Render static site, which never sleeps and uses no free instance hours.
// Every page fetches its data in the browser, so nothing here needs a Node server.
const nextConfig: NextConfig = {
  output: "export",
  // /sponsor/thanks -> sponsor/thanks/index.html, which any static host serves without rewrite rules.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
