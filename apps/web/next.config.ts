import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Firebase Hosting で配信するため静的書き出しにする（firebase.json の hosting.public が apps/web/out）。
  // 静的書き出しでは cacheComponents（PPR）が使えないので有効にしない。
  output: "export",
};

export default nextConfig;
