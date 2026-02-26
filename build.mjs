// Build script using esbuild — fast transpilation without type checking
// Type checking is done separately via `npm run typecheck` (optional, needs 8GB heap)

import { build } from 'esbuild';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// Collect all .ts files from src/
function getEntryPoints(dir, base = dir) {
  const entries = [];
  for (const file of readdirSync(dir)) {
    const fullPath = join(dir, file);
    if (statSync(fullPath).isDirectory()) {
      entries.push(...getEntryPoints(fullPath, base));
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.d.ts')) {
      entries.push(fullPath);
    }
  }
  return entries;
}

const entryPoints = getEntryPoints('src');

await build({
  entryPoints,
  outdir: 'dist',
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  // Keep .js extensions in imports (already present in source as .js)
  bundle: false,
  // Don't bundle — preserve file structure for Node.js ESM
});

console.log(`Built ${entryPoints.length} files to dist/`);
