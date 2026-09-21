import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENTRY = path.join(REPO_ROOT, "index.client.tsx");

/**
 * The host compiles `index.client.tsx` with esbuild and then rewrites its CommonJS
 * interop getters to eager `value:` reads before evaluating the bundle
 * (`@getpaseo/server` plugins/compiler.ts: `makeHermesInteropEager` +
 * `wrapCommonJsBundle`). Under that eager snapshot an entry that re-exports an
 * imported binding exposes `undefined` as its default export, and the host rejects
 * the plugin with "must default export a function". This test reproduces that load
 * path end to end so the shape cannot regress silently.
 */
const SDK_EXTERNALS = [
  "@getpaseo/plugin",
  "@getpaseo/plugin/client",
  "@getpaseo/plugin/client/ui",
  "@getpaseo/plugin/client/react-native",
  "@getpaseo/plugin/server",
  "@getpaseo/plugin/server/provider",
  "@getpaseo/plugin/server/acp",
  "@tanstack/react-query",
  "react",
  "react/jsx-runtime",
  "react-native",
  "zod",
];

/**
 * esbuild is not a project dependency (Vite 8 bundles with rolldown, which emits an
 * eager `module.exports` and cannot reproduce the host's snapshot). Prefer a
 * caller-provided binary, then the project install, then the copy the Paseo desktop
 * app ships for its own plugin compiler.
 */
function findEsbuildBinary(): string | null {
  const fromEnv = process.env.ESBUILD_BINARY_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("esbuild/package.json");
    const bin = path.join(path.dirname(pkg), "bin", "esbuild");
    if (existsSync(bin)) return bin;
  } catch {
    // Not installed; fall through to the app copy.
  }

  const candidates = [
    "/Applications/Paseo.app/Contents/Resources/app.asar.unpacked/node_modules/@esbuild/darwin-arm64/bin/esbuild",
    "/Applications/Paseo.app/Contents/Resources/app.asar.unpacked/node_modules/@esbuild/darwin-x64/bin/esbuild",
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function makeHermesInteropEager(code: string): string {
  return code.replaceAll("get: () => from[key]", "value: from[key]");
}

function wrapCommonJsBundle(code: string): string {
  return `(function(require) {\nconst module = { exports: {} };\nconst exports = module.exports;\n${code}\nreturn module.exports;\n})`;
}

function hostRequire(specifier: string): unknown {
  const stub: unknown = new Proxy(function () {} as (...args: unknown[]) => unknown, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => "" : key === "then" ? undefined : stub,
    apply: () => stub as object,
    construct: () => stub as object,
  });
  void specifier;
  return stub;
}

function loadClientEntryAsHostDoes(esbuild: string): unknown {
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), "prompt-kit-entry-")), "bundle.cjs");
  execFileSync(
    esbuild,
    [
      ENTRY,
      "--bundle",
      "--format=cjs",
      "--jsx=automatic",
      "--platform=neutral",
      "--target=es2020",
      "--supported:async-await=false",
      "--tree-shaking=true",
      "--log-level=warning",
      ...SDK_EXTERNALS.map((specifier) => `--external:${specifier}`),
      `--outfile=${out}`,
    ],
    { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  const wrapped = wrapCommonJsBundle(makeHermesInteropEager(readFileSync(out, "utf8")));
  const evaluate = (0, eval)(wrapped) as (req: typeof hostRequire) => unknown;
  return evaluate(hostRequire);
}

const esbuildBinary = findEsbuildBinary();

describe("client entry loads under the host plugin loader", () => {
  it("exposes a function as its default export after the host's eager interop rewrite", (context) => {
    if (!esbuildBinary) {
      context.skip(
        "no esbuild available (not a project dependency; set ESBUILD_BINARY_PATH to run)",
      );
      return;
    }
    const loaded = loadClientEntryAsHostDoes(esbuildBinary);
    const contributed = Reflect.get(loaded as object, "default");
    expect(typeof contributed).toBe("function");
  });
});
