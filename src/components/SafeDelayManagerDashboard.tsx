/**
 * SafeDelayManagerDashboard.tsx
 *
 * Frontend dashboard for the SafeDelayManager registry contract.
 *
 * Features:
 * - Browse all SafeDelay wallets registered in a manager
 * - Filter by connected wallet's PKH
 * - Compute new SafeDelay addresses and guide funding
 * - Register funded SafeDelay addresses with the manager
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useNetwork } from '../context/NetworkContext';
import { useWallet } from '../context/WalletContext';
import { ElectrumNetworkProvider, Network, Contract } from 'cashscript';
import SafeDelayManagerArtifact from '../../dist/SafeDelayManager.artifact.json';
import {
  computeSafeDelayAddress,
  parseManagerCommitment,
  setSafeDelayBytecode,
  type Network as LibNetwork,
} from '../utils/SafeDelayManagerLibrary';
import SafeDelayArtifact from '../../artifacts/SafeDelay.artifact.json';
import { deploySafeDelay, addressToPubkeyHash } from '../utils/deployContract';
import type { SafeDelayManagerEntry } from '../types/index';

// Map our network strings to CashScript Network type
function toCashScriptNetwork(n: 'mainnet' | 'testnet' | 'chipnet'): Network {
  switch (n) {
    case 'mainnet': return Network.MAINNET;
    case 'testnet': return Network.TESTNET3;
    case 'chipnet': return Network.CHIPNET;
    default: return Network.TESTNET3;
  }
}

function toLibNetwork(n: 'mainnet' | 'testnet' | 'chipnet'): LibNetwork {
  return n as LibNetwork;
}

// ─── Styled Components ───────────────────────────────────────────────────────

const Container = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const Title = styled.h2`font-size: 24px; margin-bottom: 8px;`;
const Description = styled.p`color: rgba(255, 255, 255, 0.6); margin-bottom: 24px;`;

const Section = styled.div`
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
`;

const SectionTitle = styled.h3`font-size: 18px; margin-bottom: 12px; color: rgba(255, 255, 255, 0.9);`;

const FormRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
`;

const Input = styled.input`
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 14px;
  &:focus { outline: none; border-color: #4f46e5; }
  &::placeholder { color: rgba(255, 255, 255, 0.3); }
`;

const PrimaryBtn = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  &:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SecondaryBtn = styled.button`
  padding: 10px 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  &:hover:not(:disabled) { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.4); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SuccessBtn = styled(PrimaryBtn)`
  background: linear-gradient(135deg, #059669, #10b981);
  &:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4); }
`;

const MessageBox = styled.div<{ $type: 'success' | 'error' | 'info' }>`
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-top: 12px;
  background: ${({ $type }) =>
    $type === 'success' ? 'rgba(16, 185, 129, 0.2)' :
    $type === 'error' ? 'rgba(239, 68, 68, 0.2)' :
    'rgba(79, 70, 229, 0.2)'};
  color: ${({ $type }) =>
    $type === 'success' ? '#10b981' :
    $type === 'error' ? '#ef4444' : '#a5b4fc'};
  white-space: pre-wrap;
`;

const Grid3 = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
`;

const StatCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
`;

const StatValue = styled.div`font-size: 28px; font-weight: 700; color: #4f46e5;`;
const StatLabel = styled.div`font-size: 13px; color: rgba(255, 255, 255, 0.6); margin-top: 4px;`;

const WalletList = styled.div`display: flex; flex-direction: column; gap: 12px;`;

const WalletCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const WalletInfo = styled.div`flex: 1; min-width: 200px;`;
const WalletAddress = styled.div`font-family: monospace; font-size: 13px; word-break: break-all; color: rgba(255,255,255,0.8);`;
const WalletMeta = styled.div`font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 4px;`;
const WalletBalance = styled.div`font-size: 20px; font-weight: 700; color: #10b981;`;

const WalletStatus = styled.span<{ $locked: boolean }>`
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $locked }) => $locked ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'};
  color: ${({ $locked }) => $locked ? '#ef4444' : '#10b981'};
`;

const CopyBtn = styled.button`
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  background: rgba(79,70,229,0.2);
  color: #a5b4fc;
  cursor: pointer;
  &:hover { background: rgba(79,70,229,0.4); }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: rgba(255,255,255,0.5);
`;

const AddressBox = styled.div`
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(79,70,229,0.4);
  border-radius: 8px;
  padding: 12px 16px;
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`;

const ViewToggle = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface EntryWithBalance extends SafeDelayManagerEntry {
  balance: number;
  currentBlock: number;
}

// Cast Electrum UTXO to include NFT fields
interface NftUtxo {
  satoshis: bigint;
  tokenCategory: string;
  nftCommitment?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SafeDelayManagerDashboard() {
  const { network } = useNetwork();
  const { wallet, hasSigner } = useWallet();

  // Config
  const [managerAddress, setManagerAddress] = useState('');
  const [managerAddressInput, setManagerAddressInput] = useState('');
  const [serviceProviderPkh, setServiceProviderPkh] = useState(''); // required for createDelay

  // Registry data
  const [allEntries, setAllEntries] = useState<SafeDelayManagerEntry[]>([]);
  const [myEntries, setMyEntries] = useState<EntryWithBalance[]>([]);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  // Compute address form
  const [lockBlocks, setLockBlocks] = useState('144'); // ~1 day
  const [computedAddress, setComputedAddress] = useState<string | null>(null);
  const [computedLockEnd, setComputedLockEnd] = useState<number | null>(null);

  // Funded address for registration
  const [fundedAddress, setFundedAddress] = useState('');
  const [fundedLockEnd, setFundedLockEnd] = useState<number>(0);
  const [registerFee, setRegisterFee] = useState('1000');

  // Registration
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);

  // UI
  const [copied, setCopied] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'mine' | 'all'>('mine');

  // External SafeDelay tracking (e.g. from BadgerSurvivors prize claims)
  const [externalAddressInput, setExternalAddressInput] = useState('');
  const [externalOwnerPkh, setExternalOwnerPkh] = useState('');
  const [externalLockEnd, setExternalLockEnd] = useState<number>(0);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [externalResult, setExternalResult] = useState<{
    address: string;
    locked: boolean;
    remaining: number;
    days: number;
    balance: number;
  } | null>(null);

  // ─── Track external SafeDelay address ────────────────────────────────────
  const handleTrackExternal = useCallback(async () => {
    setExternalError(null);
    setExternalResult(null);

    if (!externalAddressInput && !externalOwnerPkh) {
      setExternalError('Enter a SafeDelay address or owner PKH');
      return;
    }

    try {
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
      const blockHeight = await provider.getBlockHeight();
      const bh = Number(blockHeight);

      let address = externalAddressInput.trim();
      let ownerPkh = externalOwnerPkh.trim();
      let lockEndBlock = externalLockEnd;

      // If only owner PKH is provided, compute address from bytecode + params
      if (!address && ownerPkh && lockEndBlock > 0) {
        if (!/^[0-9a-f]{40}$/i.test(ownerPkh)) {
          setExternalError('Owner PKH must be 40 hex characters');
          return;
        }
        address = computeSafeDelayAddress(ownerPkh, lockEndBlock, toLibNetwork(network));
      }

      if (!address) {
        setExternalError('Enter an address or provide owner PKH + lock end block');
        return;
      }

      // Fetch UTXOs to get balance and current lock status
      const utxos = await provider.getUtxos(address);
      const balance = utxos.reduce((sum: number, u: any) => sum + Number(u.value), 0) / 1e8;

      // Determine effective lock end block
      // If we don't have it from form input, try from UTXO data
      let effectiveLockEnd = lockEndBlock;
      if (effectiveLockEnd === 0 && utxos.length > 0) {
        // We can't derive lockEndBlock from UTXO alone without the contract
        // Ask user to provide it
        setExternalError(
          `Found ${utxos.length} UTXO(s) with ${balance.toFixed(4)} BCH. ` +
          `Provide the lock end block (from your prize claim) to check unlock status.`
        );
        setExternalResult({
          address,
          locked: false,
          remaining: 0,
          days: 0,
          balance
        });
        return;
      }

      if (effectiveLockEnd === 0) {
        setExternalError('Could not determine lock end block. Provide it manually.');
        return;
      }

      const remaining = Math.max(0, effectiveLockEnd - bh);
      const days = Math.floor(remaining / 144);
      const locked = effectiveLockEnd > bh;

      setExternalResult({ address, locked, remaining, days, balance });
    } catch (err) {
      setExternalError(err instanceof Error ? err.message : 'Failed to fetch SafeDelay status');
    }
  }, [externalAddressInput, externalOwnerPkh, externalLockEnd, network]);

  // ─── Initialize SafeDelay bytecode ─────────────────────────────────────────
  useEffect(() => {
    const bytecode = (SafeDelayArtifact as any).debug?.bytecode;
    if (bytecode) {
      setSafeDelayBytecode(bytecode);
    }
  }, []);

  // ─── Load registry ─────────────────────────────────────────────────────────
  const loadRegistry = useCallback(async (address: string) => {
    if (!address) return;
    setLoadingEntries(true);
    setEntriesError(null);
    try {
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
      const bh = await provider.getBlockHeight();
      setCurrentBlock(Number(bh));

      const utxos = await provider.getUtxos(address) as unknown as NftUtxo[];
      const nftUtxos = utxos.filter(u =>
        u.tokenCategory &&
        u.tokenCategory !== '0x' &&
        u.tokenCategory !== '00'.repeat(32)
      );

      if (nftUtxos.length === 0) {
        setAllEntries([]);
        setEntriesError('No manager UTXOs found. Is the contract deployed at this address?');
        setLoadingEntries(false);
        return;
      }

      const entries: SafeDelayManagerEntry[] = [];
      for (const utxo of nftUtxos) {
        if (!utxo.nftCommitment) continue;
        const commitmentBytes = Uint8Array.from(
          Buffer.from(utxo.nftCommitment.replace(/^0x/, ''), 'hex')
        );
        const parsed = parseManagerCommitment(commitmentBytes);
        for (const entry of parsed) {
          entries.push({
            ownerPkh: entry.ownerPkh,
            lockEndBlock: entry.lockEndBlock,
            address: computeSafeDelayAddress(entry.ownerPkh, entry.lockEndBlock, toLibNetwork(network)),
          });
        }
      }
      setAllEntries(entries);
    } catch (err) {
      setEntriesError(err instanceof Error ? err.message : 'Failed to load registry');
      setAllEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [network]);

  // ─── Fetch balances for filtered entries ───────────────────────────────────
  useEffect(() => {
    if (allEntries.length === 0) { setMyEntries([]); return; }

    const walletPkh = wallet.pubkeyHash?.toLowerCase();
    const filtered = viewMode === 'mine' && walletPkh
      ? allEntries.filter(e => e.ownerPkh.toLowerCase() === walletPkh)
      : allEntries;

    const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
    let cancelled = false;

    async function fetchBalances() {
      const results: EntryWithBalance[] = [];
      for (const entry of filtered) {
        if (!entry.address) continue;
        try {
          const utxos = await provider.getUtxos(entry.address);
          const balance = utxos.reduce((sum, u) => sum + Number(u.satoshis) / 1e8, 0);
          if (!cancelled) results.push({ ...entry, balance, currentBlock });
        } catch {
          if (!cancelled) results.push({ ...entry, balance: 0, currentBlock });
        }
      }
      if (!cancelled) {
        results.sort((a, b) => a.lockEndBlock - b.lockEndBlock);
        setMyEntries(results);
      }
    }

    fetchBalances();
    return () => { cancelled = true; };
  }, [allEntries, wallet.pubkeyHash, viewMode, network, currentBlock]);

  // ─── Compute new SafeDelay address ─────────────────────────────────────────
  const handleComputeAddress = useCallback(async () => {
    if (!wallet.connected || !wallet.pubkeyHash) {
      setEntriesError('Connect your wallet first');
      return;
    }
    const blocks = parseInt(lockBlocks);
    if (isNaN(blocks) || blocks <= 0) {
      setEntriesError('Invalid lock duration');
      return;
    }

    // Fetch current block if we don't have it
    let bh = currentBlock;
    if (bh === 0) {
      try {
        const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
        bh = Number(await provider.getBlockHeight());
        setCurrentBlock(bh);
      } catch {
        setEntriesError('Could not fetch current block height');
        return;
      }
    }

    const lockEnd = bh + blocks;
    const addr = computeSafeDelayAddress(wallet.pubkeyHash, lockEnd, toLibNetwork(network));
    setComputedAddress(addr);
    setComputedLockEnd(lockEnd);
    setEntriesError(null);
    setRegisterSuccess(null);
  }, [wallet.pubkeyHash, wallet.connected, lockBlocks, network, currentBlock]);

  // ─── Deploy SafeDelay to computed address ─────────────────────────────────
  const handleDeploy = useCallback(async () => {
    if (!computedAddress || computedLockEnd === null) return;
    if (!wallet.connected || !wallet.pubkeyHash) {
      setRegisterError('Connect your wallet first');
      return;
    }

    setRegistering(true);
    setRegisterError(null);

    try {
      const ownerPkh = await addressToPubkeyHash(wallet.address!);
      const result = await deploySafeDelay({
        ownerPubkeyHash: ownerPkh,
        lockEndBlock: computedLockEnd - currentBlock, // relative blocks
        network: network as 'mainnet' | 'testnet' | 'chipnet',
      });

      setFundedAddress(result.contractAddress);
      setFundedLockEnd(result.actualLockEndBlock);
      setComputedAddress(null);
      setRegisterSuccess(
        `✅ SafeDelay deployed at:\n${result.contractAddress}\n\n` +
        `Lock end: block ${result.actualLockEndBlock} (~${Math.round((result.actualLockEndBlock - currentBlock) / 144)} days)\n\n` +
        `Now click "Register with Manager" to add it to the registry.`
      );
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Deployment failed');
    } finally {
      setRegistering(false);
    }
  }, [computedAddress, computedLockEnd, wallet, currentBlock, network]);

  // ─── Register with SafeDelayManager ────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    if (!fundedAddress || !fundedLockEnd) {
      setRegisterError('Deploy a SafeDelay first');
      return;
    }
    if (!serviceProviderPkh || !/^[0-9a-f]{40}$/i.test(serviceProviderPkh)) {
      setRegisterError('Enter a valid 40-char hex service provider PKH');
      return;
    }
    if (!wallet.connected) {
      setRegisterError('Connect your wallet first');
      return;
    }

    setRegistering(true);
    setRegisterError(null);

    try {
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

      // Get manager NFT UTXOs
      const managerUtxos = await provider.getUtxos(managerAddress) as unknown as NftUtxo[];
      const nftUtxos = managerUtxos.filter(u =>
        u.tokenCategory && u.tokenCategory !== '0x' && u.tokenCategory !== '00'.repeat(32)
      );

      if (nftUtxos.length === 0) {
        throw new Error('No manager UTXOs found. Is the manager deployed?');
      }

      // Get wallet UTXOs for fee payment
      if (!wallet.address) throw new Error('No wallet address');
      const walletUtxos = await provider.getUtxos(wallet.address);
      if (walletUtxos.length === 0) throw new Error('Need BCH UTXOs for miner fees');

      // Build createDelay transaction using CashScript Contract
      const manager = new Contract(
        SafeDelayManagerArtifact as any,
        [serviceProviderPkh],
        { provider } as any
      );

      const feeSats = BigInt(parseInt(registerFee) || 1000);

      // Derive owner PKH from wallet address
      const ownerPkhHex = await addressToPubkeyHash(wallet.address);
      const ownerPkhBytes = Uint8Array.from(Buffer.from(ownerPkhHex, 'hex'));

      // Encode lock end block as 8 bytes big-endian for the contract
      const lockEndBuf = Buffer.alloc(8);
      lockEndBuf.writeBigUInt64BE(BigInt(fundedLockEnd), 0);

      // Build transaction: manager UTXO + wallet UTXO (for fee)
      const nftUtxo = nftUtxos[0];
      const feeUtxo = walletUtxos[0];

      const createDelayFn = (manager as any).functions.createDelay(
        ownerPkhBytes,
        Uint8Array.from(lockEndBuf),
        feeSats
      );

      const tx = await createDelayFn
        .from([nftUtxo as any, feeUtxo as any])
        .send();

      const txHash = typeof tx === 'string' ? tx : (tx.txid || tx.hash || '');
      setFundedAddress('');
      setFundedLockEnd(0);
      setRegisterSuccess(`✅ Registered! Tx: ${txHash.slice(0, 20)}...`);
      await loadRegistry(managerAddress);
    } catch (err) {
      console.error('Registration error:', err);
      setRegisterError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  }, [fundedAddress, fundedLockEnd, serviceProviderPkh, registerFee, wallet, managerAddress, network, loadRegistry]);

  // ─── Copy helper ───────────────────────────────────────────────────────────
  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text.replace(/^(bitcoincash:|bchtest:|bchreg:)/, ''));
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Container>
      <Title>SafeDelay Manager</Title>
      <Description>
        Browse and manage SafeDelay wallets in the on-chain registry.
      </Description>

      {/* ── Manager Config ── */}
      <SectionTitle>Registry Configuration</SectionTitle>
      <FormRow>
        <FormGroup style={{ flex: 1 }}>
          <Label>Manager Address (P2SH32)</Label>
          <Input
            placeholder="bchtest:pz... or bitcoincash:q..."
            value={managerAddressInput}
            onChange={e => setManagerAddressInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setManagerAddress(managerAddressInput.trim())}
            style={{ fontFamily: 'monospace', fontSize: '13px' }}
          />
        </FormGroup>
        <FormGroup style={{ minWidth: '200px' }}>
          <Label>Service Provider PKH (40 hex)</Label>
          <Input
            placeholder="0a1b2c3d4e..."
            value={serviceProviderPkh}
            onChange={e => setServiceProviderPkh(e.target.value.toLowerCase())}
            style={{ fontFamily: 'monospace', fontSize: '13px' }}
          />
        </FormGroup>
        <SecondaryBtn onClick={() => setManagerAddress(managerAddressInput.trim())} disabled={!managerAddressInput.trim()}>
          Load Registry
        </SecondaryBtn>
      </FormRow>

      {!managerAddress && (
        <MessageBox $type="info">
          Enter the SafeDelayManager contract address to browse the registry.
          The service provider PKH is required to register new entries.
        </MessageBox>
      )}

      {/* ── Registry Stats ── */}
      {allEntries.length > 0 && (
        <Grid3>
          <StatCard><StatValue>{allEntries.length}</StatValue><StatLabel>Total Wallets</StatLabel></StatCard>
          <StatCard>
            <StatValue>
              {allEntries.filter(e =>
                wallet.pubkeyHash && e.ownerPkh.toLowerCase() === wallet.pubkeyHash.toLowerCase()
              ).length}
            </StatValue>
            <StatLabel>My Wallets</StatLabel>
          </StatCard>
          <StatCard><StatValue>{currentBlock > 0 ? currentBlock.toLocaleString() : '—'}</StatValue><StatLabel>Current Block</StatLabel></StatCard>
        </Grid3>
      )}

      {/* ── View Toggle ── */}
      {allEntries.length > 0 && (
        <ViewToggle>
          <SecondaryBtn
            onClick={() => setViewMode('mine')}
            style={{ background: viewMode === 'mine' ? 'rgba(79,70,229,0.2)' : undefined, borderColor: viewMode === 'mine' ? '#4f46e5' : undefined, color: viewMode === 'mine' ? '#a5b4fc' : undefined }}
          >My Wallets</SecondaryBtn>
          <SecondaryBtn
            onClick={() => setViewMode('all')}
            style={{ background: viewMode === 'all' ? 'rgba(79,70,229,0.2)' : undefined, borderColor: viewMode === 'all' ? '#4f46e5' : undefined, color: viewMode === 'all' ? '#a5b4fc' : undefined }}
          >All Wallets</SecondaryBtn>
        </ViewToggle>
      )}

      {loadingEntries && <MessageBox $type="info">Scanning blockchain for registry entries...</MessageBox>}
      {entriesError && !managerAddress && <MessageBox $type="error">{entriesError}</MessageBox>}

      {/* ── Track External SafeDelay (e.g. from BadgerSurvivors prizes) ── */}
      {wallet.connected && (
        <Section>
          <SectionTitle>Track External SafeDelay</SectionTitle>
          <Description style={{ fontSize: '14px', marginBottom: '12px' }}>
            Track a SafeDelay created outside this dashboard — e.g. tournament prize deposits
            from BadgerSurvivors. Enter the address from your prize claim to view its status.
          </Description>

          <FormRow>
            <FormGroup style={{ flex: 1 }}>
              <Label>SafeDelay Address (P2SH32)</Label>
              <Input
                placeholder="bchtest:pz... or bitcoincash:q..."
                value={externalAddressInput}
                onChange={e => setExternalAddressInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTrackExternal()}
                style={{ fontFamily: 'monospace', fontSize: '13px' }}
              />
            </FormGroup>
            <FormGroup style={{ minWidth: '160px' }}>
              <Label>Owner PKH (40 hex)</Label>
              <Input
                placeholder="a1b2c3d4e5..."
                value={externalOwnerPkh}
                onChange={e => setExternalOwnerPkh(e.target.value.toLowerCase())}
                style={{ fontFamily: 'monospace', fontSize: '13px' }}
              />
            </FormGroup>
            <FormGroup style={{ minWidth: '160px' }}>
              <Label>Lock End Block</Label>
              <Input
                type="number"
                placeholder="850000"
                value={externalLockEnd || ''}
                onChange={e => setExternalLockEnd(parseInt(e.target.value) || 0)}
              />
            </FormGroup>
            <SecondaryBtn onClick={handleTrackExternal} disabled={!externalAddressInput && !externalOwnerPkh}>
              Track
            </SecondaryBtn>
          </FormRow>

          {externalError && <MessageBox $type="error" style={{ marginTop: '8px' }}>{externalError}</MessageBox>}

          {externalResult && (
            <AddressBox style={{ marginTop: '12px', borderColor: 'rgba(16,185,129,0.4)' }}>
              <span>
                <strong>SafeDelay Address:</strong><br />
                {externalResult.address}
              </span>
              <CopyBtn onClick={() => handleCopy(externalResult.address)}>
                {copied === externalResult.address ? '✓' : '📋 Copy'}
              </CopyBtn>
            </AddressBox>
          )}
          {externalResult && (
            <WalletMeta style={{ marginTop: '8px' }}>
              {externalResult.locked
                ? `🔒 Locked — ${externalResult.remaining.toLocaleString()} blocks remaining (~${externalResult.days} days)`
                : '✅ Fully unlocked — ready to withdraw'}
              {externalResult.balance > 0 && (
                <span style={{ color: '#10b981', display: 'block', marginTop: '4px', fontWeight: 700 }}>
                  {externalResult.balance.toFixed(4)} BCH
                </span>
              )}
            </WalletMeta>
          )}
        </Section>
      )}

      {/* ── Registered Wallets ── */}
      {myEntries.length > 0 && (
        <Section>
          <SectionTitle>
            {viewMode === 'mine' ? 'My SafeDelay Wallets' : `Registry Entries`} ({myEntries.length})
          </SectionTitle>
          <WalletList>
            {myEntries.map((entry, i) => {
              const locked = entry.lockEndBlock > entry.currentBlock;
              const remaining = entry.lockEndBlock - entry.currentBlock;
              const days = Math.floor(remaining / 144);
              return (
                <WalletCard key={entry.address || i}>
                  <WalletInfo>
                    <WalletAddress>{entry.address || '—'}</WalletAddress>
                    <WalletMeta>
                      Lock end: block {entry.lockEndBlock.toLocaleString()} •{' '}
                      {locked
                        ? `🔒 ${remaining.toLocaleString()} blocks (~${days} days)`
                        : '✅ Unlocked'}
                    </WalletMeta>
                    {viewMode === 'all' && (
                      <WalletMeta style={{ color: '#a5b4fc', marginTop: '2px' }}>
                        Owner: {entry.ownerPkh.slice(0, 10)}...{entry.ownerPkh.slice(-8)}
                      </WalletMeta>
                    )}
                  </WalletInfo>
                  <WalletBalance>{entry.balance.toFixed(4)} BCH</WalletBalance>
                  <WalletStatus $locked={locked}>{locked ? '🔒 Locked' : '✅ Unlocked'}</WalletStatus>
                  {entry.address && (
                    <CopyBtn onClick={() => handleCopy(entry.address!)}>
                      {copied === entry.address ? '✓ Copied' : '📋 Copy'}
                    </CopyBtn>
                  )}
                </WalletCard>
              );
            })}
          </WalletList>
        </Section>
      )}

      {allEntries.length > 0 && myEntries.length === 0 && viewMode === 'mine' && (
        <EmptyState>No SafeDelay wallets found for your wallet in this registry.</EmptyState>
      )}

      {/* ── Create + Register ── */}
      {wallet.connected && (
        <Section>
          <SectionTitle>Create New SafeDelay</SectionTitle>
          <Description style={{ fontSize: '14px', marginBottom: '16px' }}>
            Deploy a new SafeDelay wallet. Once deployed, register it with the manager.
          </Description>

          <FormRow style={{ alignItems: 'flex-end' }}>
            <FormGroup>
              <Label>Lock Duration (blocks)</Label>
              <Input
                type="number"
                min="1"
                value={lockBlocks}
                onChange={e => setLockBlocks(e.target.value)}
              />
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                ≈ {Math.round(parseInt(lockBlocks) / 144)} days
              </span>
            </FormGroup>

            {!computedAddress ? (
              <PrimaryBtn onClick={handleComputeAddress} disabled={!managerAddress}>
                🔮 Compute Address
              </PrimaryBtn>
            ) : (
              <SuccessBtn onClick={handleDeploy} disabled={registering}>
                {registering ? '⏳ Deploying...' : '🚀 Deploy SafeDelay'}
              </SuccessBtn>
            )}
          </FormRow>

          {computedAddress && (
            <AddressBox>
              <span>
                <strong>SafeDelay Address:</strong><br />
                {computedAddress}
                {computedLockEnd && (
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                    Lock end: block {computedLockEnd} (~{Math.round(computedLockEnd / 144)} days from now)
                  </span>
                )}
              </span>
              <CopyBtn onClick={() => handleCopy(computedAddress)}>
                {copied === computedAddress ? '✓' : '📋 Copy'}
              </CopyBtn>
            </AddressBox>
          )}

          {/* ── Registration ── */}
          {fundedAddress && (
            <>
              <AddressBox style={{ borderColor: 'rgba(16,185,129,0.4)', marginTop: '16px' }}>
                <span>
                  <strong>✅ Deployed & ready to register:</strong><br />
                  {fundedAddress}
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                    Lock end: block {fundedLockEnd}
                  </span>
                </span>
              </AddressBox>

              <FormRow style={{ marginTop: '12px' }}>
                <FormGroup>
                  <Label>Fee to Service Provider (sats)</Label>
                  <Input
                    type="number"
                    min="546"
                    value={registerFee}
                    onChange={e => setRegisterFee(e.target.value)}
                    style={{ width: '130px' }}
                  />
                </FormGroup>
                <SuccessBtn
                  onClick={handleRegister}
                  disabled={registering || !serviceProviderPkh || !managerAddress}
                >
                  {registering ? '⏳ Registering...' : '📝 Register with Manager'}
                </SuccessBtn>
              </FormRow>

              {!serviceProviderPkh && (
                <MessageBox $type="info" style={{ marginTop: '8px' }}>
                  Enter the service provider PKH above to enable registration.
                </MessageBox>
              )}
            </>
          )}

          {registerError && <MessageBox $type="error">{registerError}</MessageBox>}
          {registerSuccess && <MessageBox $type="success">{registerSuccess}</MessageBox>}

          {!hasSigner && (
            <MessageBox $type="info" style={{ marginTop: '12px' }}>
              💡 Use a CashScript wallet (Paytaca, Electron Cash SLP) for signing.
            </MessageBox>
          )}
        </Section>
      )}

      {/* ── How It Works ── */}
      {managerAddress && (
        <Section>
          <SectionTitle>How the Registry Works</SectionTitle>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.7' }}>
            <p>
              The <strong>SafeDelayManager</strong> is an <strong>NFT-bound registry</strong>.
              Each wallet entry is encoded in the NFT commitment as:
            </p>
            <code style={{ display: 'block', fontFamily: 'monospace', margin: '8px 0', padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
              [ownerPKH (20 bytes)][lockEndBlock (8 bytes big-endian)]
            </code>
            <p>
              Child SafeDelay addresses are computed <strong>off-chain</strong>:<br />
              <code style={{ fontFamily: 'monospace' }}>
                hash256(ownerPKH_le ‖ lockEndBlock_le ‖ SafeDelayBytecode)
              </code>
            </p>
            <p style={{ marginTop: '8px' }}>
              The service provider PKH (set at manager deployment) receives the registration fee.
              Only the service provider can call <code style={{ fontFamily: 'monospace' }}>createDelay()</code>.
            </p>
          </div>
        </Section>
      )}
    </Container>
  );
}
