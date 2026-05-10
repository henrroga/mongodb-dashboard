#!/usr/bin/env node
// Tiny CSS lint: ensures every var(--name) reference resolves to a token
// defined in :root or has a fallback. No PostCSS, no extra deps.
//
// Exits 1 (and prints the offenders) on any unresolved reference, so it can
// gate CI just like `node --check` does for JS.

const fs = require("fs");
const path = require("path");

function loadCss(file) {
  return fs.readFileSync(file, "utf8");
}

function extractDefinedTokens(css) {
  const defined = new Set();
  // Match `--name: value;` declarations anywhere — :root, [data-theme=...]
  // blocks, or @media (prefers-color-scheme: ...) wrappers.
  const re = /(--[A-Za-z0-9_-]+)\s*:/g;
  let m;
  while ((m = re.exec(css)) !== null) defined.add(m[1]);
  return defined;
}

function extractReferences(css) {
  // Each occurrence of var(--foo) or var(--foo, fallback). Returns
  // [{ name, hasFallback, line, snippet }].
  const out = [];
  const re = /var\((--[A-Za-z0-9_-]+)\s*(,)?[^)]*\)/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const idx = m.index;
    const upTo = css.slice(0, idx);
    const line = upTo.split("\n").length;
    const lineStart = upTo.lastIndexOf("\n") + 1;
    const lineEnd = css.indexOf("\n", idx);
    const snippet = css
      .slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
      .trim();
    out.push({
      name: m[1],
      hasFallback: !!m[2],
      line,
      snippet,
    });
  }
  return out;
}

function lint(file) {
  const css = loadCss(file);
  const defined = extractDefinedTokens(css);
  const refs = extractReferences(css);

  const undefinedRefs = refs.filter(
    (r) => !defined.has(r.name) && !r.hasFallback
  );
  return { defined, refs, undefinedRefs };
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const target = args[0] || "public/css/style.css";
const abs = path.resolve(target);
if (!fs.existsSync(abs)) {
  console.error(`✗ ${target} not found`);
  process.exit(2);
}

const { defined, refs, undefinedRefs } = lint(abs);
console.log(
  `Scanned ${target}: ${defined.size} tokens defined, ${refs.length} var() references.`
);

// Hex color audit: count direct #RGB / #RRGGBB outside the token-definition
// blocks. These are values that should generally be tokens. We don't fail
// on this — just report — so the existing baseline doesn't break CI. Run
// with --strict-hex to flag new hexes added beyond the baseline.
const css = loadCss(abs);
const hexRefs = (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((h) => h.length === 4 || h.length === 7 || h.length === 9);
// Estimate definitions: hex values inside :root or [data-theme="..."] blocks
// are baseline tokens, expected.
const tokenBlockRe = /(:root|\[data-theme=[^\]]+\])\s*\{([\s\S]*?)\}/g;
let inTokenBlocks = 0;
let m2;
while ((m2 = tokenBlockRe.exec(css)) !== null) {
  inTokenBlocks += (m2[2].match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
}
const outsideTokenBlocks = hexRefs.length - inTokenBlocks;
console.log(
  `  Direct hex colors: ${hexRefs.length} total (${inTokenBlocks} in token blocks, ${outsideTokenBlocks} elsewhere).`
);

const STRICT_HEX = process.argv.includes("--strict-hex");
const HEX_BASELINE = parseInt(process.env.MAX_HEX_OUTSIDE_TOKENS || "100", 10);
if (STRICT_HEX && outsideTokenBlocks > HEX_BASELINE) {
  console.error(
    `\n✗ ${outsideTokenBlocks} hex color(s) outside token blocks exceeds the baseline of ${HEX_BASELINE}.`
  );
  console.error("Use a token: var(--accent), var(--bg-tertiary), etc.");
  process.exit(1);
}

if (undefinedRefs.length === 0) {
  console.log("✓ All var() references resolve.");
  process.exit(0);
}

console.error(`\n✗ ${undefinedRefs.length} unresolved var() reference(s):\n`);
const seen = new Set();
for (const r of undefinedRefs) {
  const key = `${r.line}:${r.name}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.error(`  ${target}:${r.line}  ${r.name}`);
  console.error(`    ${r.snippet}`);
}
console.error(
  "\nFix: define the token in :root (and per-theme blocks if needed) or " +
    "add a fallback like var(--foo, #ccc)."
);
process.exit(1);
