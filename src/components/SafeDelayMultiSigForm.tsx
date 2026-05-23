import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { QRCodeSVG } from 'qrcode.react';
import { useWallet } from '../context/WalletContext';
import { useNetwork } from '../context/NetworkContext';
import { deploySafeDelayMultiSig, addressToPubkeyHash, fetchCurrentBlockHeight } from '../utils/deployContract';
import { useStoredContracts } from '../hooks/useSafeDelayContracts';
import { useFormNavigationWarning } from '../hooks/useFormNavigationWarning';
import HASHES from '../../artifacts/HASHES.json';
import { debug } from '../utils/debug';
import { showToast } from './Toast';
import FormSkeleton from './FormSkeleton';
import { decodeCashAddress } from '@bitauth/libauth';

const FormContainer = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const Title = styled.h2`
  font-size: 24px;
  margin-bottom: 8px;
`;

const Description = styled.p`
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 24px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
`;

const Input = styled.input`
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 16px;

  &:focus {
    outline: none;
    border-color: #4f46e5;
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
`;

const Select = styled.select`
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 16px;

  &:focus {
    outline: none;
    border-color: #4f46e5;
  }

  option {
    background: #1a1a2e;
  }
`;

const HelpText = styled.span`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
`;

const OwnerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
`;

const OwnerField = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const OwnerNumber = styled.span`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #4f46e5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
`;

const SubmitButton = styled.button`
  padding: 14px 24px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white;
  font-size: 16px;
  font-weight: 600;
  transition: all 0.2s;
  margin-top: 10px;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(79, 70, 229, 0.4);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ContractAddressBox = styled.div`
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(79, 70, 229, 0.4);
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
`;

const ContractAddressLabel = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
`;

const ContractAddress = styled.div`
  font-family: monospace;
  font-size: 14px;
  word-break: break-all;
  color: #a855f7;
`;

const BytecodeErrorBox = styled.div`
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
  color: #ef4444;
  margin-bottom: 4px;
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: #ef4444;
`;

const CopyButton = styled.button`
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(79, 70, 229, 0.2);
  color: #a5b4fc;

  &:hover {
    background: rgba(79, 70, 229, 0.4);
  }
`;

const NetworkStatusBadge = styled.div<{ $status: 'checking' | 'connected' | 'disconnected' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  ${({ $status }) => {
    if ($status === 'connected') return `
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
    `;
    if ($status === 'checking') return `
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.3);
    `;
    return `
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
    `;
  }}
`;

export default function SafeDelayMultiSigForm() {
  const { wallet } = useWallet();
  const { network } = useNetwork();
  const { addContract } = useStoredContracts();
  const [threshold, setThreshold] = useState('2');
  const [lockDuration, setLockDuration] = useState('30');
  const [durationUnit, setDurationUnit] = useState<'days' | 'weeks' | 'months'>(() => {
    const saved = localStorage.getItem('safeDelay_durationUnit');
    return (saved === 'days' || saved === 'weeks' || saved === 'months' ? saved : 'days');
  });

  useEffect(() => {
    localStorage.setItem('safeDelay_durationUnit', durationUnit);
  }, [durationUnit]);

  // Fetch current block height on mount and when network changes
  useEffect(() => {
    let cancelled = false;
    async function fetchHeight() {
      try {
        setNetworkStatus('checking');
        const h = await fetchCurrentBlockHeight(network as 'mainnet' | 'testnet' | 'chipnet');
        if (!cancelled) {
          setCurrentBlockHeight(h);
          setNetworkStatus('connected');
        }
      } catch {
        if (!cancelled) setNetworkStatus('disconnected');
      }
    }
    fetchHeight();
    return () => { cancelled = true; };
  }, [network]);

  const [owner1Address, setOwner1Address] = useState('');
  const [owner2Address, setOwner2Address] = useState('');
  const [owner3Address, setOwner3Address] = useState('');
  const [owner1AddressError, setOwner1AddressError] = useState<string | null>(null);
  const [owner2AddressError, setOwner2AddressError] = useState<string | null>(null);
  const [owner3AddressError, setOwner3AddressError] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [savedLockEndBlock, setSavedLockEndBlock] = useState<number | null>(null);
  const [currentBlockHeight, setCurrentBlockHeight] = useState<number | null>(null);
  const [networkStatus, setNetworkStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [bytecodeError, setBytecodeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [formReady, setFormReady] = useState(false);

  // Track when wallet and network are both ready — show skeleton until both confirm
  useEffect(() => {
    if (wallet.connected && networkStatus === 'connected') {
      setFormReady(true);
    } else if (!wallet.connected) {
      setFormReady(false);
    }
  }, [wallet.connected, networkStatus]);

  // Show skeleton loader while wallet/network are initializing
  if (!formReady) {
    return <FormSkeleton compileServerStatus={networkStatus === 'checking' ? 'checking' : undefined} />;
  }

  // Fetch current block height on mount and when network changes
  useEffect(() => {
    let cancelled = false;
    async function fetchHeight() {
      try {
        setNetworkStatus('checking');
        const h = await fetchCurrentBlockHeight(network as 'mainnet' | 'testnet' | 'chipnet');
        if (!cancelled) {
          setCurrentBlockHeight(h);
          setNetworkStatus('connected');
        }
      } catch {
        if (!cancelled) setNetworkStatus('disconnected');
      }
    }
    fetchHeight();
    return () => { cancelled = true; };
  }, [network]);

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch {}
  };

  // Validate a BCH cashaddress and return an error message or null
  const validateAddress = (address: string): string | null => {
    if (!address.trim()) return null; // empty is fine — field is optional
    const result = decodeCashAddress(address.trim());
    if (typeof result === 'string') return 'Invalid BCH address';
    return null;
  };

  const handleOwner1Change = (value: string) => {
    setOwner1Address(value);
    setOwner1AddressError(validateAddress(value));
  };
  const handleOwner2Change = (value: string) => {
    setOwner2Address(value);
    setOwner2AddressError(validateAddress(value));
  };
  const handleOwner3Change = (value: string) => {
    setOwner3Address(value);
    setOwner3AddressError(validateAddress(value));
  };

  // Derived: can submit only if owner1 valid (or empty, which will be caught at submit)
  const canSubmit = (() => {
    if (!owner1Address.trim()) return false;
    if (owner1AddressError) return false;
    if (owner2AddressError) return false;
    if (owner3AddressError) return false;
    return true;
  })();

  // Track dirty state: form is dirty if user changed any field from defaults
  const initialThreshold = useRef('2');
  const initialLockDuration = useRef('30');
  const initialOwner2 = useRef('');
  const initialOwner3 = useRef('');
  const isFormDirty =
    threshold !== initialThreshold.current ||
    lockDuration !== initialLockDuration.current ||
    owner2Address !== initialOwner2.current ||
    owner3Address !== initialOwner3.current;
  useFormNavigationWarning(isFormDirty);

  // Count how many unique owners are provided (owner1 is always required)
  const uniqueOwnerCount = (() => {
    const owners = [owner1Address.trim()];
    if (owner2Address.trim()) owners.push(owner2Address.trim());
    if (owner3Address.trim()) owners.push(owner3Address.trim());
    const unique = [...new Set(owners)];
    return unique.length;
  })();

  // Threshold options should be disabled if they exceed available unique owners
  const canUseThreshold2 = uniqueOwnerCount >= 2;
  const canUseThreshold3 = uniqueOwnerCount >= 3;

  const getDurationInBlocks = () => {
    const days = durationUnit === 'days'
      ? parseInt(lockDuration)
      : durationUnit === 'weeks'
        ? parseInt(lockDuration) * 7
        : parseInt(lockDuration) * 30;
    return days * 144;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.connected) {
      showToast('Please connect your wallet first', 'warning');
      return;
    }

    setError(null);
    setContractAddress(null);
    setBytecodeError(null);
    // Use queueMicrotask to ensure loading state is painted before the synchronous
    // bytecode digest blocks the event loop (issue #227)
    queueMicrotask(() => setLoading(true));

    try {
      // Verify embedded artifact bytecode against known-good hash before deployment
      const SafeDelayMultiSigArtifact = (await import('../../artifacts/SafeDelayMultiSig.artifact.json')).default;
      const bytecodeHex = SafeDelayMultiSigArtifact.debug?.bytecode;
      if (bytecodeHex) {
        const buf = Buffer.from(bytecodeHex, 'hex');
        const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
        const actualHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0')).join('');
        const knownHash = HASHES.SafeDelayMultiSig?.bytecodeHash;
        if (knownHash && actualHash !== knownHash) {
          const msg = `Bytecode mismatch — got ${actualHash.slice(0, 16)}..., expected ${knownHash.slice(0, 16)}... Check your artifact file and network settings.`;
          setBytecodeError(msg);
          debug.error('[SafeDelayMultiSigForm] Bytecode mismatch:', actualHash, '!=', knownHash);
          setLoading(false);
          return;
        }
      }

      // Validate at least owner 1 is set
      if (!owner1Address.trim()) {
        throw new Error('Owner 1 address is required');
      }

      // Convert addresses to pubkey hashes
      let owner1Pkh: string;
      let owner2Pkh: string | undefined;
      let owner3Pkh: string | undefined;

      try {
        owner1Pkh = await addressToPubkeyHash(owner1Address.trim());
      } catch {
        throw new Error(`Invalid Owner 1 address: ${owner1Address}`);
      }

      if (owner2Address.trim()) {
        try {
          owner2Pkh = await addressToPubkeyHash(owner2Address.trim());
        } catch {
          throw new Error(`Invalid Owner 2 address: ${owner2Address}`);
        }
      }

      if (owner3Address.trim()) {
        try {
          owner3Pkh = await addressToPubkeyHash(owner3Address.trim());
        } catch {
          throw new Error(`Invalid Owner 3 address: ${owner3Address}`);
        }
      }

      // Default owner 2 and 3 to owner 1 if not provided
      const finalOwner2Pkh = owner2Pkh || owner1Pkh;
      const finalOwner3Pkh = owner3Pkh || owner1Pkh;

      // Count unique owners to validate threshold
      const uniqueOwners = [owner1Pkh];
      if (owner2Pkh && owner2Pkh !== owner1Pkh) uniqueOwners.push(owner2Pkh);
      if (owner3Pkh && owner3Pkh !== owner1Pkh && owner3Pkh !== owner2Pkh) uniqueOwners.push(owner3Pkh);
      const uniqueOwnerCount = uniqueOwners.length;
      const requestedThreshold = parseInt(threshold);

      if (requestedThreshold > uniqueOwnerCount) {
        throw new Error(
          `Threshold (${requestedThreshold}) exceeds number of unique owners (${uniqueOwnerCount}). ` +
          `Either add more owners or lower the threshold. ` +
          `Note: If Owner 2/3 are left empty, they default to Owner 1 — this creates duplicate owners.`
        );
      }

      

      const result = await deploySafeDelayMultiSig({
        owner1Pkh,
        owner2Pkh: finalOwner2Pkh,
        owner3Pkh: finalOwner3Pkh,
        threshold: parseInt(threshold),
        lockEndBlock: getDurationInBlocks(),
        network: network as 'mainnet' | 'testnet' | 'chipnet',
      });

      setContractAddress(result.contractAddress);
      setSavedLockEndBlock(result.actualLockEndBlock);

      // Save contract to localStorage for dashboard
      addContract({
        address: result.contractAddress,
        ownerPkh: owner1Pkh,
        lockEndBlock: result.actualLockEndBlock, // absolute lock end block
        type: 'multisig',
        owners: [owner1Pkh, finalOwner2Pkh, finalOwner3Pkh],
        createdAt: Date.now(),
      });
    } catch (err) {
      debug.error('Error creating SafeDelayMultiSig:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormContainer>
      {!formReady ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ height: 28, background: 'rgba(255,255,255,0.06)', borderRadius: 6, width: 240 }} />
            <div style={{ height: 24, width: 100, background: 'rgba(255,255,255,0.06)', borderRadius: 12 }} />
          </div>
          <div style={{ height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 4, width: '50%', marginBottom: '2rem' }} />
          {/* Threshold */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 4, width: 160, marginBottom: 8 }} />
            <div style={{ height: 42, background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          {/* Owner fields */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 4, width: 100, marginBottom: 8 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: 'rgba(0,0,0,0.15)', borderRadius: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 40, background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
              ))}
            </div>
          </div>
          {/* Lock duration */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 4, width: 140, marginBottom: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ height: 42, background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
              <div style={{ height: 42, background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
          </div>
          {/* Button */}
          <div style={{ height: 44, background: 'rgba(255,255,255,0.06)', borderRadius: 8, width: 160, marginTop: '1.5rem' }} />
        </>
      ) : (
      <>
      <Title>Create MultiSig Time-Lock</Title>
      <NetworkStatusBadge $status={networkStatus}>
        {networkStatus === 'connected' && <>🟢 Connected to {network}</>}
        {networkStatus === 'checking' && <>🟡 Connecting...</>}
        {networkStatus === 'disconnected' && <>🔴 Disconnected</>}
      </NetworkStatusBadge>
      <Description>
        Require 2-of-3 signatures to withdraw. Enhanced security for larger amounts.
      </Description>

      <Form onSubmit={handleSubmit}>
        <FormGroup>
          <Label>Threshold (required signatures)</Label>
          <Select value={threshold} onChange={(e) => setThreshold(e.target.value)}>
            <option value="2" disabled={!canUseThreshold2}>2 of 3 {!canUseThreshold2 && '— add Owner 2'}</option>
            <option value="3" disabled={!canUseThreshold3}>3 of 3 {!canUseThreshold3 && '— add Owner 2 & 3'}</option>
          </Select>
          <HelpText>How many owners must sign to withdraw funds</HelpText>
        </FormGroup>

        <FormGroup>
          <Label>Owner Addresses</Label>
          <OwnerList>
            <OwnerField>
              <OwnerNumber>1</OwnerNumber>
              <Input
                placeholder="Owner 1 cashaddress (required)"
                style={{ flex: 1 }}
                value={owner1Address}
                onChange={(e) => handleOwner1Change(e.target.value)}
                disabled={loading}
              />
            </OwnerField>
            {owner1AddressError && <ErrorText style={{ marginLeft: '32px', marginTop: '-4px' }}>{owner1AddressError}</ErrorText>}
            <OwnerField>
              <OwnerNumber>2</OwnerNumber>
              <Input
                placeholder="Owner 2 cashaddress (optional)"
                style={{ flex: 1 }}
                value={owner2Address}
                onChange={(e) => handleOwner2Change(e.target.value)}
                disabled={loading}
              />
            </OwnerField>
            {owner2AddressError && <ErrorText style={{ marginLeft: '32px', marginTop: '-4px' }}>{owner2AddressError}</ErrorText>}
            <OwnerField>
              <OwnerNumber>3</OwnerNumber>
              <Input
                placeholder="Owner 3 cashaddress (optional)"
                style={{ flex: 1 }}
                value={owner3Address}
                onChange={(e) => handleOwner3Change(e.target.value)}
                disabled={loading}
              />
            </OwnerField>
            {owner3AddressError && <ErrorText style={{ marginLeft: '32px', marginTop: '-4px' }}>{owner3AddressError}</ErrorText>}
          </OwnerList>
          <HelpText>
            Owner 1 is required. Owner 2 & 3 are optional but{' '}
            <strong>required for 3-of-3</strong>. If left empty, they default to Owner 1
            (creating duplicate owners, which reduces security).
            {' '}{!canUseThreshold3 && '⚠️ Need 2 unique owners for 2-of-3 threshold.'}
          </HelpText>
        </FormGroup>

        <FormGroup>
          <Label>Lock Duration</Label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Input
              type="number"
              min="1"
              value={lockDuration}
              onChange={(e) => setLockDuration(e.target.value)}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <Select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as 'days' | 'weeks' | 'months')}
              disabled={loading}
              style={{ width: '120px' }}
            >
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </Select>
          </div>
          <HelpText>~{getDurationInBlocks()} blocks</HelpText>
        </FormGroup>

        {bytecodeError && <BytecodeErrorBox>{bytecodeError}</BytecodeErrorBox>}
        {error && <ErrorText>{error}</ErrorText>}

        <SubmitButton type="submit" disabled={loading || !wallet.connected || !!bytecodeError || !canSubmit}>
          {loading ? 'Creating...' : 'Create MultiSig'}
        </SubmitButton>
      </Form>
      </>
      )}
      {contractAddress && (
        <ContractAddressBox>
          <ContractAddressLabel>Contract Address</ContractAddressLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <ContractAddress>{contractAddress}</ContractAddress>
            <CopyButton onClick={() => handleCopyAddress(contractAddress!)}>
              {copiedAddress === contractAddress ? '✓ Copied!' : '📋 Copy'}
            </CopyButton>
            <button
              onClick={() => setShowQrCode(!showQrCode)}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                background: showQrCode ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)',
                color: showQrCode ? '#10b981' : 'rgba(255,255,255,0.7)',
                transition: 'all 0.2s',
              }}
            >
              {showQrCode ? '✕ Hide QR' : '📱 QR Code'}
            </button>
          </div>

          {showQrCode && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: '#fff', borderRadius: '8px', padding: '8px', flexShrink: 0 }}>
                <QRCodeSVG
                  value={contractAddress!.replace(/^bitcoincash:/, '')}
                  size={80}
                  level="M"
                />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: '0.35rem' }}>Fund this SafeDelay</div>
                <div>Send BCH to this address to fund your multi-sig wallet. Scan the QR or copy the address above.</div>
              </div>
            </div>
          )}

          <HelpText style={{ marginTop: '8px' }}>
            Fund this address to activate the time-lock. Funds can be withdrawn after the lock period with {threshold} of 3 signatures.
          </HelpText>
          {savedLockEndBlock != null && (
            <>
              <ContractAddressLabel style={{ marginTop: '12px' }}>Lock Duration</ContractAddressLabel>
              <HelpText>{getDurationInBlocks()} blocks (~{lockDuration} {durationUnit})</HelpText>
              <ContractAddressLabel style={{ marginTop: '8px' }}>Unlocks at Block</ContractAddressLabel>
              <HelpText>~{savedLockEndBlock.toLocaleString()}{currentBlockHeight != null ? ` (est. ${new Date(Date.now() + ((savedLockEndBlock - currentBlockHeight) * 10 * 60)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })})` : ''}</HelpText>
              {currentBlockHeight != null && (
                <>
                  <ContractAddressLabel style={{ marginTop: '8px' }}>Time Remaining</ContractAddressLabel>
                  <HelpText>
                    {(() => {
                      const blocksLeft = savedLockEndBlock - currentBlockHeight;
                      if (blocksLeft <= 0) return 'Unlocked — ready to withdraw';
                      const hours = blocksLeft * 10 / 60;
                      if (hours < 1) return `~${Math.round(blocksLeft * 10)} minutes (${blocksLeft.toLocaleString()} blocks)`;
                      if (hours < 24) return `~${Math.round(hours)} hours (~${blocksLeft.toLocaleString()} blocks)`;
                      const days = Math.round(hours / 24);
                      return `~${days} day${days !== 1 ? 's' : ''} (~${blocksLeft.toLocaleString()} blocks)`;
                    })()}
                  </HelpText>
                </>
              )}
            </>
          )}
        </ContractAddressBox>
      )}
    </FormContainer>
  );
}
