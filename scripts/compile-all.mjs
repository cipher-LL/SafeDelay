/**
 * compile-all.mjs — Compile all SafeDelay contracts
 * 
 * Compiles SafeDelay.cash, SafeDelayManager.cash, and SafeDelayMultiSig.cash
 * in sequence, reporting success/failure for each. Exits with non-zero if
 * any contract fails, but always attempts all three.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

const ARTIFACT_DIR = 'dist';

const contracts = [
  { name: 'SafeDelay', file: 'SafeDelay.cash' },
  { name: 'SafeDelayManager', file: 'SafeDelayManager.cash' },
  { name: 'SafeDelayMultiSig', file: 'SafeDelayMultiSig.cash' },
];

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function compile(name, file) {
  const outFile = `${ARTIFACT_DIR}/${name}.artifact.json`;
  console.log(`\n[${name}] Compiling ${file} → ${outFile}`);
  try {
    execSync(`npx cashc ${file} -o ${outFile}`, { stdio: 'inherit' });
    console.log(`[${name}] ✓ Success`);
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
} else {
  console.error('One or more contracts failed to compile ✗');
  process.exit(1);
}