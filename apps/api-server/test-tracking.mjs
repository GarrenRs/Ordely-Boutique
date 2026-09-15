import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

await esbuild({
  entryPoints: [
    path.resolve(artifactDir, "src/tests/tracking.test.ts"),
  ],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: path.resolve(artifactDir, "dist/tests"),
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
  sourcemap: "linked",
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
  },
});