/**
 * SafeDelayManager Deployment Script
 *
 * Deploys SafeDelayManager - a registry for tracking SafeDelay wallets.
 *
 * Usage:
 *   node scripts/deploy-manager.mjs --sp-pkh <pkh_hex> [--network chipnet|mainnet]
 *
 * Prerequisites:
 *   - paytaca CLI for wallet funding (or fund manually)
 *   - BCH in wallet for gas
 *
 * How it works:
 *   SafeDelayManager is an NFT-bound registry. Each createDelay call appends
 *   an entry (ownerPkh + lockEndBlock) to the manager's NFT commitment.
 *
 *   Child SafeDelay addresses are computed off-chain:
 *     SafeDelay address = hash256(ownerPKH_le || lockEndBlock_le || SafeDelayBytecode)
 *   where SafeDelayBytecode is from the SafeDelay.artifact.json.
 *
 *   Users deploy SafeDelay contracts themselves (using deploy-contract.mjs or similar),
 *   then call createDelay to register their SafeDelay in the manager.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as libauth from '@bitauth/libauth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', 'dist');

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
  ? 'https://api.blacktown.io/rpc'
  : 'https://api.blacktown.io/rpc';

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
      if (typeof arg === 'string') {
        const hex = arg.replace(/^0x/, '').padStart(40, '0');
        encoded.push(Uint8Array.from(Buffer.from(hex, 'hex')));
      } else {
        encoded.push(arg);
      }
    } else if (input.type === 'bytes') {
      // bytes: push as-is
      if (typeof arg === 'string') {
        const hex = arg.replace(/^0x/, '');
        encoded.push(Uint8Array.from(Buffer.from(hex, 'hex')));
      } else {
        encoded.push(arg);
      }
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
  return { address, redeemScriptHex: Buffer.from(redeemScript).toString('hex') };
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

async function getBlockHeight() {
  return await electrumRpc('get_block_count');
}

// ============ Deployment ============

async function deployManager(serviceProviderPkh) {
  const artifact = loadArtifact('SafeDelayManager');

  console.log(`\n📦 Computing SafeDelayManager deployment address...`);
  console.log(`   serviceProviderPkh: ${serviceProviderPkh.slice(0, 8)}...${serviceProviderPkh.slice(-8)}`);
  console.log(`   network:           ${NETWORK}`);

  const { address } = computeAddress(artifact, [serviceProviderPkh]);
  console.log(`\n   Manager address: ${address}`);

  // Check if already funded
  const utxos = await getUtxos(address);
  if (utxos.length > 0) {
    console.log(`\n   ✅ Manager already funded! (${utxos.length} UTXO(s), ${utxos[0].value} sats)`);
    return { address, alreadyDeployed: true };
  }

  console.log(`\n   ⏳ Manager not yet funded (needs ${DUST_SATS} sats minimum).`);
  return { address, alreadyDeployed: false };
}

// ============ Child Address Computation ============

function computeChildSafeDelayAddress(ownerPkh, lockEndBlock) {
  const safeDelayArtifact = loadArtifact('SafeDelay');
  const safeDelayBytecodeHex = safeDelayArtifact.debug?.bytecode;
  if (!safeDelayBytecodeHex) throw new Error('No SafeDelay bytecode found');

  // Encode lockEndBlock as 8 bytes big-endian
  const lockEndBlockBytes = Buffer.alloc(8);
  lockEndBlockBytes.writeBigUInt64BE(BigInt(lockEndBlock), 0);

  // Encode ownerPKH (20 bytes)
  const ownerPkhBytes = Uint8Array.from(Buffer.from(ownerPkh.replace(/^0x/, '').padStart(40, '0'), 'hex'));

  // Redeem script: ownerPKH_le + lockEndBlock_le + SafeDelayBytecode
  // Note: CashScript stores constructor args little-endian in the bytecode
  const redeemScript = new Uint8Array([
    ...[...ownerPkhBytes].reverse(),           // ownerPKH little-endian
    ...[...lockEndBlockBytes].reverse(),       // lockEndBlock little-endian
    ...Buffer.from(safeDelayBytecodeHex, 'hex') // SafeDelay bytecode
  ]);

  const hash = libauth.hash256(redeemScript);
  const lockingBytecode = libauth.encodeLockingBytecodeP2sh32(hash);
  const addressResult = libauth.lockingBytecodeToCashAddress({
    prefix: NETWORK_PREFIX,
    bytecode: lockingBytecode,
  });

  return typeof addressResult === 'string' ? addressResult : addressResult.address;
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
  console.log(`   SafeDelayManager Deployment`);
  console.log(`   Network: ${NETWORK}`);
  console.log(`========================================`);

  // Check for compute-child mode FIRST
  if (args['compute-child']) {
    const { owner, blocks } = args;
    if (!owner || !blocks) {
      console.error(`\n❌ --compute-child requires --owner and --blocks`);
      process.exit(1);
    }
    const cleanOwner = owner.replace(/^0x/, '');
    const lockEndBlock = parseInt(blocks);
    const childAddress = computeChildSafeDelayAddress(cleanOwner, lockEndBlock);
    console.log(`\n📦 Computed SafeDelay address:`);
    console.log(`   Owner PKH:      ${cleanOwner}`);
    console.log(`   Lock end block: ${lockEndBlock}`);
    console.log(`   Address:        ${childAddress}`);
    return;
  }

  const { spPkh } = args;
  if (!spPkh) {
    console.error(`
❌ Missing required arguments.

Usage:
  node scripts/deploy-manager.mjs --sp-pkh <pkh_hex> [--network chipnet|mainnet]

Options:
  --sp-pkh   Service provider public key hash (40 hex chars = 20 bytes)
  --network  chipnet (default) or mainnet

Example (chipnet):
  node scripts/deploy-manager.mjs --sp-pkh 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b --network chipnet

To get your PKH from a BCH address:
  Use @bitauth/libauth or any BCH utility to derive the hash160 of a P2PKH address.

Child SafeDelay Address Computation (for off-chain use):
  node scripts/deploy-manager.mjs --compute-child --owner <pkh> --blocks <endBlock> [--network chipnet]
`);
    process.exit(1);
  }

  // Validate spPkh
  const cleanSpPkh = spPkh.replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/i.test(cleanSpPkh)) {
    console.error(`\n❌ Invalid spPkh: must be 40 hex chars (20 bytes). Got: ${spPkh}`);
    process.exit(1);
  }

  // Check for compute-child mode
  if (args['compute-child']) {
    const { owner, blocks } = args;
    if (!owner || !blocks) {
      console.error(`\n❌ --compute-child requires --owner and --blocks`);
      process.exit(1);
    }
    const cleanOwner = owner.replace(/^0x/, '');
    const lockEndBlock = parseInt(blocks);
    const childAddress = computeChildSafeDelayAddress(cleanOwner, lockEndBlock);
    console.log(`\n📦 Computed SafeDelay address:`);
    console.log(`   Owner PKH:      ${cleanOwner}`);
    console.log(`   Lock end block: ${lockEndBlock}`);
    console.log(`   Address:        ${childAddress}`);
    return;
  }

  // Deploy manager
  const result = await deployManager(cleanSpPkh);

  if (result.alreadyDeployed) {
    console.log(`\n📍 Already deployed: ${result.address}`);
    return;
  }

  // Try auto-fund
  console.log(`\n💰 To deploy, send ${DUST_SATS}+ sats to:`);
  console.log(`   ${result.address}`);
  console.log(`\n   paytaca: paytaca send ${result.address} 0.00000546`);

  await tryPaytacaFund(result.address, DUST_SATS);

  const funded = await waitForFunding(result.address, DUST_SATS, 180000);
  if (funded) {
    console.log(`\n========================================`);
    console.log(`   ✅ SafeDelayManager Deployed Successfully!`);
    console.log(`========================================`);
    console.log(`\n📍 Manager Address: ${result.address}`);
    console.log(`   Service Provider: ${cleanSpPkh}`);
    console.log(`   Network:          ${NETWORK}`);
    console.log(`\n💡 Save this address — it's your SafeDelayManager!`);
    console.log(`   Use createDelay(ownerPkh, lockEndBlock, feeSats) to register SafeDelays.`);
  } else {
    console.log(`\n⏸️  Funding not detected. Re-run after sending sats to verify.`);
  }
}

main().catch(e => {
  console.error(`\n❌ Deployment error: ${e.message}`);
  process.exit(1);
});
