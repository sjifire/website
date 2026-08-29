import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../api");

/**
 * api/ is deployed to Azure standalone, and Oryx installs it from api/'s own
 * manifest and lockfile -- the repo root is not there. An import that resolves
 * locally only because the package was hoisted from a transitive dependency, or
 * because the repo-root node_modules is in scope when tests run, will therefore
 * vanish on deploy and take the whole Functions app down with it. That is what
 * broke /admin: uuid rode along under @azure/msal-node until a bump dropped it.
 *
 * This is a static check on the manifest. It does not prove the tree installs or
 * loads; a CI step that runs `npm ci --prefix api` and imports
 * api/src/functions/index.js would, and would also cover lockfile drift and
 * subpath-export removals that this cannot see.
 */

const builtins = new Set(builtinModules);

/** Collapses a specifier like "@scope/pkg/sub/path" or "pkg/sub" to its package name. */
function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Every .js/.mjs/.cjs file api/ ships, skipping installed packages. */
function sourceFilesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(full);
    return /\.[cm]?js$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Drops comments so prose such as `// pulled from "Entra ID"` is not read as an
 * import. The `[^:]` guard keeps `https://…` inside string literals intact.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Each pattern is anchored on a non-member position so a method call ending in
 * `from` -- `Buffer.from("base64")` -- is not mistaken for an import. The quote
 * boundary stays `\s*` so space-free forms like `import x from"pkg"` still match.
 */
const IMPORT_PATTERNS = [
  /(?:^|[^\w.$])from\s*["']([^"']+)["']/g, // import x from "pkg" / export … from "pkg"
  /(?:^|[^\w.$])import\s*["']([^"']+)["']/g, // import "pkg"
  /(?:^|[^\w.$])import\s*\(\s*["']([^"']+)["']/g, // await import("pkg")
  /(?:^|[^\w.$])require\s*\(\s*["']([^"']+)["']/g, // require("pkg")
];

function bareImportsIn(file) {
  const source = stripComments(readFileSync(file, "utf8"));
  const specifiers = IMPORT_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)]).map(
    (match) => match[1]
  );

  return specifiers
    .filter((specifier) => !specifier.startsWith(".") && !specifier.startsWith("node:"))
    .map(packageName)
    .filter((name) => !builtins.has(name));
}

test("every package imported by api/ is declared in api/package.json", () => {
  const manifest = JSON.parse(readFileSync(path.join(apiDir, "package.json"), "utf8"));
  const declared = new Set(Object.keys(manifest.dependencies ?? {}));

  const undeclared = new Map();
  for (const file of sourceFilesUnder(apiDir)) {
    for (const name of bareImportsIn(file)) {
      if (declared.has(name)) continue;
      const importers = undeclared.get(name) ?? [];
      importers.push(path.relative(apiDir, file));
      undeclared.set(name, importers);
    }
  }

  assert.deepEqual(
    [...undeclared.keys()],
    [],
    `Undeclared imports would break the deployed Functions app: ${[...undeclared]
      .map(([name, files]) => `"${name}" (${[...new Set(files)].map((f) => `api/${f}`).join(", ")})`)
      .join("; ")}`
  );
});
