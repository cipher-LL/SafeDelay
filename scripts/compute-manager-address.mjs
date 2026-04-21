#!/usr/bin/env node
// Compute SafeDelayManager addresses for chipnet and mainnet

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as libauth from '@bitauth/libauth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, 'dist');

function computeAddress(artifact, spPkh, networkPrefix) {
  const bytecodeHex = artifact.debug?.bytecode;
  if (!bytecodeHex) throw new Error('No bytecode in artifact');

  const encodedArgs = [Uint8Array.from(Buffer.from(spPkh, 'hex'))];
  const redeemScript = new Uint8Array(
    encodedArgs.flatMap(a => [...a].reverse()).concat([...Buffer.from(bytecodeHex, 'hex')])
  );

  const hash = libauth.hash256(redeemScript);
  const lockingBytecode = libauth.encodeLockingBytecodeP2sh32(hash);
  const addressResult = libauth.lockingBytecodeToCashAddress({
    prefix: networkPrefix,
    bytecode: lockingBytecode,
  });

  return typeof addressResult === 'string' ? addressResult : addressResult.address;
}

const spPkh = process.argv[2] || '2f0dd32b662beccb21e2b72e811a58f605bcf35f';
const artifact = JSON.parse(readFileSync(join(__dirname, '..', 'dist', 'SafeDelayManager.artifact.json'), 'utf8'));

console.log('\nSafeDelayManager Deployment Addresses');
console.log('SP PKH:', spPkh);
console.log('');
console.log('Chipnet:', computeAddress(artifact, spPkh, 'bchtest'));
console.log('Mainnet:', computeAddress(artifact, spPkh, 'bitcoincash'));
console.log('');