#!/usr/bin/env node
/**
 * JSON-LD lint — blocking, part of `npm run verify`.
 *
 * Walks every built `dist/*.html` / `dist/programs/*.html` (admin.html
 * excluded — it only exists when INCLUDE_ADMIN=1) and parses every
 * `<script type="application/ld+json">` block found. Fails the build if any
 * such block does not parse as JSON, or parses but lacks a `@type`.
 *
 * fs-only, no browser — mirrors tests/crawlability.spec.js's approach so it
 * stays fast enough to run on every build.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');

/** Recursively list files under `dir` matching `predicate`, relative to `dir`. */
function listFiles(dir, predicate) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full, predicate).map((f) => join(entry, f)));
    } else if (predicate(entry)) {
      out.push(entry);
    }
  }
  return out;
}

/** Extracts the text content of every application/ld+json <script> block in `html`. */
function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

function main() {
  if (!existsSync(distDir)) {
    console.error('❌ validate-jsonld: dist/ does not exist — run `npm run build` first');
    process.exit(1);
  }

  const htmlFiles = listFiles(distDir, (name) => name.endsWith('.html')).filter(
    (relPath) => !relPath.split(/[\\/]/).includes('admin.html')
  );

  let blockCount = 0;
  let errorCount = 0;
  const errors = [];

  for (const relPath of htmlFiles) {
    const html = readFileSync(join(distDir, relPath), 'utf8');
    const blocks = extractJsonLdBlocks(html);
    blocks.forEach((raw, i) => {
      blockCount += 1;
      const label = `${relPath} (JSON-LD block ${i + 1})`;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        errorCount += 1;
        errors.push(`${label}: does not parse as JSON — ${e.message}`);
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed['@type']) {
        errorCount += 1;
        errors.push(`${label}: missing @type`);
      }
    });
  }

  console.log(`JSON-LD lint: scanned ${htmlFiles.length} page(s), found ${blockCount} application/ld+json block(s).`);

  if (errorCount > 0) {
    console.error(`\n❌ ${errorCount} JSON-LD error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log('✅ JSON-LD lint passed');
  process.exit(0);
}

main();
