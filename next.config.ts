import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // argon2 is a native Node addon — don't try to bundle it for the
  // server runtime. Keep it as a CommonJS require at runtime.
  serverExternalPackages: ["@node-rs/argon2"],
  // The repo lives under a directory with a sibling lockfile;
  // pin Turbopack's workspace root to silence the warning.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
