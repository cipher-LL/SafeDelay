/**
 * compile-all.mjs — Compile all SafeDelay contracts
 * 
 * Compiles SafeDelay.cash, SafeDelayManager.cash, and SafeDelayMultiSig.cash
 * in sequence, reporting success/failure for each. Exits with non-zero if
 * any contract fails, but always attempts all three.
 * 
 * After successful compilation, prints the SHA256 bytecode hash so users
 * can verify against artifacts/HASHES.json without a separate command.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { createHash } from 'crypto';

const ARTIFACT_DIR = 'dist';

const contracts = [
  { name: 'SafeDelay', file: 'SafeDelay.cash' },
  { name: 'SafeDelayManager', file: 'SafeDelayManager.cash' },
  { name: 'SafeDelayMultiSig', file: 'SafeDelayMultiSig.cash' },
];

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function computeBytecodeHash(artifactPath) {
  try {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    // Use debug.bytecode — the canonical bytecode hash committed to HASHES.json
    const bytecode = artifact.debug?.bytecode;
    if (!bytecode) return null;
    const hash = createHash('sha256').update(Buffer.from(bytecode, 'hex')).digest('hex');
    return hash;
  } catch {
    return null;
  }
}

function compile(name, file) {
  const outFile = `${ARTIFACT_DIR}/${name}.artifact.json`;
  console.log(`\n[${name}] Compiling ${file} → ${outFile}`);
  try {
    execSync(`npx cashc ${file} -o ${outFile}`, { stdio: 'inherit' });
    const hash = computeBytecodeHash(outFile);
    if (hash) {
      console.log(`[${name}] ✓ Success — bytecode hash: ${hash}`);
    } else {
      console.log(`[${name}] ✓ Success`);
    }
    return true;
  } catch (err) {
    console.error(`[${name}] ✗ FAILED — exit code ${err.status}`);
    return false;
  }
}

ensureDir(ARTIFACT_DIR);

console.log('Compiling all SafeDelay contracts...\n');
let allPassed = true;
for (const { name, file } of contracts) {
  if (!compile(name, file)) allPassed = false;
}

console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('All contracts compiled successfully ✓');
  console.log('\nRegenerating HASHES.json...');
  try {
    const { execSync: execSyncHash } = await import('child_process');
    execSyncHash('node scripts/generate-hashes.mjs', { stdio: 'inherit' });
  } catch {
    console.warn('⚠️  Failed to regenerate HASHES.json — run `node scripts/generate-hashes.mjs` manually');
  }
} else {
  console.error('One or more contracts failed to compile ✗');
  process.exit(1);
}