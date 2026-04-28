/**
 * generate-hashes.mjs
 *
 * Scans the dist/ directory for compiled CashScript artifacts and generates
 * a canonical HASHES.json with SHA256 bytecode hashes and byte counts.
 *
 * Usage:
 *   node scripts/generate-hashes.mjs
 *
 * Output:
 *   artifacts/HASHES.json — committed to git, tracks bytecode hashes
 *
 * After modifying contracts:
 *   1. npm run compile         (rebuild dist/)
 *   2. node scripts/generate-hashes.mjs  (regenerate HASHES.json)
 *   3. Verify hashes match expected values before deploying
 */

import { createHash } from 'crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const OUTPUT_PATH = join(__dirname, '..', 'artifacts', 'HASHES.json');

mkdirSync(join(__dirname, '..', 'artifacts'), { recursive: true });

function computeBytecodeHash(bytecodeHex) {
  return createHash('sha256').update(bytecodeHex, 'hex').digest('hex');
}

function getBytecodeLength(bytecodeHex) {
  return Math.floor(bytecodeHex.length / 2);
}

async function main() {
  console.log('📦 Generating HASHES.json from dist/ artifacts...\n');

  if (!existsSync(DIST_DIR)) {
    console.error('❌ dist/ directory not found. Run \'npm run compile\' first.');
    process.exit(1);
  }

  const files = readdirSync(DIST_DIR).filter(f => f.endsWith('.artifact.json'));
  if (files.length === 0) {
    console.error('❌ No .artifact.json files found in dist/.');
    process.exit(1);
  }

  const hashes = {};

  for (const file of files) {
    const artifactPath = join(DIST_DIR, file);
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    const name = file.replace('.artifact.json', '');
    const bytecode = artifact.debug?.bytecode;

    if (!bytecode) {
      console.warn(`⚠️  No bytecode in ${file}, skipping.`);
      continue;
    }

    const bytecodeHash = computeBytecodeHash(bytecode);
    const bytecodeLength = getBytecodeLength(bytecode);
    const compiler = artifact.compiler
      ? (typeof artifact.compiler === 'string' ? artifact.compiler : `${artifact.compiler.name} ${artifact.compiler.version}`)
      : artifact.metadata?.compilerVersion || 'unknown';

    hashes[name] = {
      bytecodeHash: bytecodeHash,
      bytecodeLength: bytecodeLength,
      compiler: compiler,
      pragma: artifact.abi?.pragma || undefined,
    };

    console.log(`  ✅ ${name} (${bytecodeLength} bytes) — ${bytecodeHash}`);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(hashes, null, 2));
  console.log(`\n📝 Wrote ${OUTPUT_PATH}`);
  console.log(`   ${Object.keys(hashes).length} contracts tracked.`);
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});