import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../api");

/**
 * The api/ folder is deployed to Azure standalone: Oryx installs only what
 * api/package.json declares. Anything imported but undeclared may still resolve
 * locally (hoisted from a transitive dep, or from the repo-root node_modules
 * when tests run) and then vanish on deploy, taking the whole Functions app down
 * with it. So every bare import must be declared in api/package.json.
 */

const builtins = new Set(builtinModules);

/** Collapses a specifier like "@scope/pkg/sub/path" or "pkg/sub" to its package name. */
function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function jsFilesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/**
 * Each pattern is anchored on a non-member position so method calls that merely
 * end in `from` -- `Buffer.from("base64")` -- are not mistaken for imports.
 */
const IMPORT_PATTERNS = [
  /(?:^|[^\w.$])from\s+["']([^"']+)["']/g, // import x from "pkg" / export … from "pkg"
  /(?:^|[^\w.$])import\s+["']([^"']+)["']/g, // import "pkg"
  /(?:^|[^\w.$])import\s*\(\s*["']([^"']+)["']/g, // await import("pkg")
  /(?:^|[^\w.$])require\s*\(\s*["']([^"']+)["']/g, // require("pkg")
];

function bareImportsIn(file) {
  const source = readFileSync(file, "utf8");
  const specifiers = IMPORT_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)]).map(
    (match) => match[1]
  );

  return specifiers
    .filter((specifier) => !specifier.startsWith(".") && !specifier.startsWith("node:"))
    .map(packageName)
    .filter((name) => !builtins.has(name));
}

test("every package imported by api/ is declared in api/package.json", () => {
  const declared = new Set(
    Object.keys(JSON.parse(readFileSync(path.join(apiDir, "package.json"), "utf8")).dependencies)
  );

  const undeclared = new Map();
  const sources = [...jsFilesUnder(path.join(apiDir, "src")), ...jsFilesUnder(path.join(apiDir, "tina"))];
  for (const file of sources) {
    for (const name of bareImportsIn(file)) {
      if (!declared.has(name)) {
        undeclared.set(name, path.relative(apiDir, file));
      }
    }
  }

  assert.deepEqual(
    [...undeclared.entries()],
    [],
    `Undeclared imports would break the deployed Functions app: ${[...undeclared]
      .map(([name, file]) => `"${name}" (api/${file})`)
      .join(", ")}`
  );
});
