import { defineConfig } from "tsup";

// Bundle the worker and its workspace packages into a single ESM entry; third-party
// dependencies stay external and are installed in the production image.
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@uptimekit\//],
});
