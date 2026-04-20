/**
 * SafeDelay Contract Deployment Script
 *
 * Deploys SafeDelay (or SafeDelayMultiSig) time-locked wallet contracts.
 *
 * Usage:
 *   node scripts/deploy-contract.mjs --owner <pkh_hex> --blocks <duration> [--network chipnet|mainnet]
 *   node scripts/deploy-contract.mjs --owner 1a2b3c... --blocks 100 --network chipnet
 *   node scripts/deploy-contract.mjs --multi-sig --owner1 <pkh> --owner2 <pkh> --owner3 <pkh> --threshold 2 --blocks 100
 *
 * Prerequisites:
 *   - paytaca CLI for wallet funding (or fund manually)
 *   - BCH in wallet for gas
 *
 * How it works:
 *   SafeDelay bytecode is deterministic — constructor args (ownerPKH, lockEndBlock)
 *   are data pushed to the stack, not part of the redeem script hash.
 *   So we pre-compute the P2SH32 address, then the user funds it to activate.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as libauth from '@bitauth/libauth';
import * as crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', 'artifacts');

// ============ HASHES ============

function loadHashes() {
  const hashesPath = join(ARTIFACTS_DIR, 'HASHES.json');
  if (existsSync(hashesPath)) {
    return JSON.parse(readFileSync(hashesPath, 'utf8'));
  }
  return {};
}

// ============ CLI Args ============
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    acc[key] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
  }
  return acc;
}, {});

const NETWORK = args.network || 'chipnet';
const IS_MAINNET = NETWORK === 'mainnet';
const NETWORK_PREFIX = IS_MAINNET ? 'bitcoincash' : 'bchtest';
const RPC_URL = IS_MAINNET
  ? 'https://bchd.electroncash.net:8335/rpc'
  : 'https://tbchd.electroncash.dk:8335/rpc';

const DUST_SATS = 546;

// ============ Artifact Loading ============

function loadArtifact(name) {
  const path = join(ARTIFACTS_DIR, `${name}.artifact.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function encodeConstructorArgs(artifact, args) {
  const encoded = [];
  for (let i = 0; i < artifact.constructorInputs.length; i++) {
    const input = artifact.constructorInputs[i];
    const arg = args[i];

    if (input.type === 'bytes20') {
      // bytes20: push 20 bytes directly
      if (typeof arg === 'string') {
        const hex = arg.replace(/^0x/, '').padStart(40, '0');
        encoded.push(Uint8Array.from(Buffer.from(hex, 'hex')));
      } else {
        encoded.push(arg);
      }
    } else if (input.type === 'int') {
      // int: encode as OP_PUSHINTN (VM number format)
      const vmNum = libauth.bigIntToVmNumber(BigInt(arg));
      encoded.push(vmNum);
    } else {
      throw new Error(`Unsupported constructor input type: ${input.type}`);
    }
  }
  return encoded;
}

function computeAddress(artifact, args) {
  const bytecodeHex = artifact.debug?.bytecode;
  if (!bytecodeHex) throw new Error(`No bytecode in ${artifact.contractName} artifact`);

  const baseBytecode = Uint8Array.from(Buffer.from(bytecodeHex, 'hex'));
  const encodedArgs = encodeConstructorArgs(artifact, args);

  // Build redeem script: encoded_args (reversed for CashScript LE) + baseBytecode
  // CashScript args are stored little-endian in the script
  const redeemScript = new Uint8Array(
    encodedArgs.flatMap(a => [...a].reverse()).concat([...baseBytecode])
  );

  // Compute hash256 (double SHA256)
  const hash = libauth.hash256(redeemScript);

  // Build P2SH32 locking bytecode and convert to address
  const lockingBytecode = libauth.encodeLockingBytecodeP2sh32(hash);
  const addressResult = libauth.lockingBytecodeToCashAddress({
    prefix: NETWORK_PREFIX,
    bytecode: lockingBytecode,
  });

  const address = typeof addressResult === 'string' ? addressResult : addressResult.address;
  return { address, redeemScriptHex: Buffer.from(redeemScript).toString('hex'), bytecodeHash: null };
}

function verifyBytecode(artifact) {
  const bytecodeHex = artifact.debug?.bytecode;
  if (!bytecodeHex) return { verified: false, reason: 'No bytecode in artifact' };

  const bytecodeBytes = Uint8Array.from(Buffer.from(bytecodeHex, 'hex'));
  const hash = crypto.createHash('sha256').update(bytecodeBytes).digest('hex');
  const hashes = loadHashes();
  const contractName = artifact.contractName;

  if (hashes[contractName]) {
    const expected = hashes[contractName].bytecodeHash;
    if (hash === expected) {
      return { verified: true, hash, matches: expected, contractName };
    }
    return { verified: false, hash, expected, contractName };
  }
  return { verified: null, hash, reason: `No known hash for ${contractName} in HASHES.json` };
}

function formatBlockTime(blockHeight, currentBlock) {
  const blocksUntil = blockHeight - (currentBlock || 0);
  const minutesUntil = blocksUntil * 10;
  const hoursUntil = Math.round(minutesUntil / 60);
  const daysUntil = (hoursUntil / 24).toFixed(1);
  return `block ${blockHeight} (~${daysUntil} days from now)`;
}

// ============ Electrum RPC Helpers ============

async function electrumRpc(method, params = []) {
  const resp = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

async function getBlockHeight() {
  return await electrumRpc('get_block_count');
}

async function getUtxos(address) {
  try {
    return await electrumRpc('get_address_utxos', [address, 0, 100]);
  } catch (e) {
    console.error(`   ⚠️ Could not check UTXOs: ${e.message}`);
    return [];
  }
}

async function waitForFunding(address, minSats = DUST_SATS, timeoutMs = 180000) {
  console.log(`   ⏳ Waiting up to ${timeoutMs / 1000}s for ${minSats} sats...`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const utxos = await getUtxos(address);
    const funded = utxos.find(u => u.value >= minSats);
    if (funded) {
      console.log(`   ✅ UTXO confirmed! ${funded.value} sats at ${funded.height}`);
      return funded;
    }
    process.stdout.write(`.`);
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log(`\n   ⏱️  Timeout waiting for funding.`);
  return null;
}

// ============ Deployment ============

async function deploySafeDelay(ownerPKH, lockEndBlock, currentBlock) {
  const artifact = loadArtifact('SafeDelay');

  console.log(`\n📦 SafeDelay Deployment`);
  console.log(`   ownerPKH:      ${ownerPKH.slice(0, 8)}...${ownerPKH.slice(-8)}`);
  console.log(`   lockEndBlock:  ${lockEndBlock} ${currentBlock ? `(${formatBlockTime(lockEndBlock, currentBlock)})` : ''}`);
  console.log(`   network:       ${NETWORK}`);

  // Verify bytecode before deployment
  const verification = verifyBytecode(artifact);
  if (verification.verified === true) {
    console.log(`\n   ✅ Bytecode verified`);
    console.log(`   📋 Bytecode SHA256: ${verification.hash}`);
  } else if (verification.verified === false) {
    console.error(`\n   ❌ Bytecode MISMATCH! Expected: ${verification.expected}`);
    console.error(`   📋 Got: ${verification.hash}`);
    console.error(`   ⚠️  DO NOT PROCEED - bytecode does not match audited version!`);
  } else {
    console.log(`\n   ⚠️  Bytecode not in HASHES.json: ${verification.hash}`);
    console.log(`   ℹ️  Add to artifacts/HASHES.json to enable verification`);
  }

  const { address } = computeAddress(artifact, [ownerPKH, lockEndBlock]);
  console.log(`\n   Contract address: ${address}`);

  // Check if already funded
  const utxos = await getUtxos(address);
  if (utxos.length > 0) {
    console.log(`\n   ✅ Contract already funded! (${utxos.length} UTXO(s), ${utxos[0].value} sats)`);
    return { address, alreadyDeployed: true };
  }

  console.log(`\n   ⏳ Contract not yet funded (needs ${DUST_SATS} sats minimum).`);
  return { address, alreadyDeployed: false };
}

async function deploySafeDelayMultiSig(owner1Pkh, owner2Pkh, owner3Pkh, threshold, lockEndBlock) {
  const artifact = loadArtifact('SafeDelayMultiSig');

  console.log(`\n📦 Computing SafeDelayMultiSig deployment address...`);
  console.log(`   owner1:        ${owner1Pkh.slice(0, 8)}...`);
  console.log(`   owner2:        ${owner2Pkh.slice(0, 8)}...`);
  console.log(`   owner3:        ${owner3Pkh.slice(0, 8)}...`);
  console.log(`   threshold:     ${threshold}`);
  console.log(`   lockEndBlock:  ${lockEndBlock}`);
  console.log(`   network:       ${NETWORK}`);

  const { address } = computeAddress(artifact, [owner1Pkh, owner2Pkh, owner3Pkh, BigInt(threshold), BigInt(lockEndBlock)]);
  console.log(`\n   Contract address: ${address}`);

  const utxos = await getUtxos(address);
  if (utxos.length > 0) {
    console.log(`\n   ✅ Contract already funded! (${utxos.length} UTXO(s), ${utxos[0].value} sats)`);
    return { address, alreadyDeployed: true };
  }

  console.log(`\n   ⏳ Contract not yet funded (needs ${DUST_SATS} sats minimum).`);
  return { address, alreadyDeployed: false };
}

// ============ Funding via paytaca ============

async function tryPaytacaFund(address, sats) {
  try {
    const { execSync } = await import('child_process');
    console.log(`\n💸 Attempting auto-fund via paytaca CLI...`);
    const result = execSync(`paytaca send ${address} ${sats / 1e8}`, { encoding: 'utf8' });
    console.log(`   ✅ paytaca send output: ${result.slice(0, 200)}`);
    return true;
  } catch (e) {
    console.log(`   ⚠️  paytaca auto-fund failed (${e.message}). Please fund manually.`);
    return false;
  }
}

// ============ Main ============

async function main() {
  console.log(`\n========================================`);
  console.log(`   SafeDelay Contract Deployment`);
  console.log(`   Network: ${NETWORK}`);
  console.log(`========================================`);

  // Parse multi-sig mode
  if (args.multiSig) {
    const { owner1, owner2, owner3, threshold, blocks } = args;
    if (!owner1 || !owner2 || !owner3 || !threshold || !blocks) {
      console.error(`\n❌ Multi-sig mode requires: --owner1, --owner2, --owner3, --threshold, --blocks`);
      process.exit(1);
    }

    let currentBlock;
    try {
      currentBlock = await getBlockHeight();
      console.log(`   Current block height: ${currentBlock}`);
    } catch (e) {
      console.warn(`   ⚠️  Could not fetch block height, using hardcoded estimate`);
    }
    const lockEndBlock = currentBlock ? parseInt(currentBlock) + parseInt(blocks) : 0;

    const result = await deploySafeDelayMultiSig(owner1, owner2, owner3, parseInt(threshold), lockEndBlock);
    if (!result.alreadyDeployed) {
      console.log(`\n💰 To deploy SafeDelayMultiSig, send ${DUST_SATS}+ sats to:`);
      console.log(`   ${result.address}`);
      console.log(`\n   paytaca: paytaca send ${result.address} 0.00000546`);

      const funded = await waitForFunding(result.address, DUST_SATS, 180000);
      if (!funded) {
        console.log(`\n⏸️  Re-run this script after funding to verify deployment.`);
      }
    }
    console.log(`\n📍 Deployed SafeDelayMultiSig address: ${result.address}`);
    return;
  }

  // Single-owner SafeDelay
  const { owner, blocks } = args;
  if (!owner || !blocks) {
    console.error(`
❌ Missing required arguments.

Usage:
  node scripts/deploy-contract.mjs --owner <pkh_hex> --blocks <num_blocks> [--network chipnet|mainnet]

Options:
  --owner     Owner public key hash (40 hex chars = 20 bytes)
  --blocks    Lock duration in blocks (~10 min/block on BCH mainnet)
  --network   chipnet (default) or mainnet

Example (chipnet, 100 blocks ~16 hours):
  node scripts/deploy-contract.mjs --owner 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b --blocks 100 --network chipnet

To get your PKH from a BCH address:
  (Use a tool or derive from your private key)

For SafeDelayMultiSig (3 owners):
  node scripts/deploy-contract.mjs --multi-sig --owner1 <pkh> --owner2 <pkh> --owner3 <pkh> --threshold 2 --blocks 100
`);
    process.exit(1);
  }

  // Validate ownerPKH
  const cleanOwner = owner.replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/i.test(cleanOwner)) {
    console.error(`\n❌ Invalid ownerPKH: must be 40 hex chars (20 bytes). Got: ${owner}`);
    process.exit(1);
  }

  // Resolve absolute lock block height
  let currentBlock;
  try {
    currentBlock = await getBlockHeight();
    console.log(`   Current block height: ${currentBlock}`);
  } catch (e) {
    console.warn(`   ⚠️  Could not fetch block height from Electrum, using hardcoded estimate`);
  }

  const lockEndBlock = currentBlock
    ? parseInt(currentBlock) + parseInt(blocks)
    : parseInt(blocks); // fallback: treat blocks as absolute height

  console.log(`   Lock duration: ${blocks} blocks`);
  console.log(`   Lock end block: ${lockEndBlock} (${formatBlockTime(lockEndBlock, currentBlock)})`);

  const result = await deploySafeDelay(cleanOwner, lockEndBlock, currentBlock);

  if (result.alreadyDeployed) {
    console.log(`\n📍 Already deployed: ${result.address}`);
    return;
  }

  // Try auto-fund
  console.log(`\n💰 To deploy, send ${DUST_SATS}+ sats to:`);
  console.log(`   ${result.address}`);
  console.log(`\n   paytaca: paytaca send ${result.address} 0.00000546`);
  console.log(`   Or fund with more for operational costs (recommend 2000+ sats).`);

  await tryPaytacaFund(result.address, DUST_SATS);

  const funded = await waitForFunding(result.address, DUST_SATS, 180000);
  if (funded) {
    console.log(`\n========================================`);
    console.log(`   ✅ SafeDelay Deployed Successfully!`);
    console.log(`========================================`);
    console.log(`\n📍 Contract Address: ${result.address}`);
    console.log(`   Owner PKH:        ${cleanOwner}`);
    console.log(`   Lock expires at:  block ${lockEndBlock}`);
    console.log(`   Network:          ${NETWORK}`);
    console.log(`\n💡 Save this address — it's your SafeDelay wallet!`);
    console.log(`   Fund it to add BCH, withdraw after block ${lockEndBlock}.`);
  } else {
    console.log(`\n⏸️  Funding not detected. Re-run after sending sats to verify.`);
  }
}

main().catch(e => {
  console.error(`\n❌ Deployment error: ${e.message}`);
  process.exit(1);
});
