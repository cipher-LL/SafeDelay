import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useWallet } from '../context/WalletContext';
import { useNetwork } from '../context/NetworkContext';
import { deploySafeDelay, addressToPubkeyHash, fetchCurrentBlockHeight } from '../utils/deployContract';
import { useStoredContracts } from '../hooks/useSafeDelayContracts';
import { useFormNavigationWarning } from '../hooks/useFormNavigationWarning';
import HASHES from '../../artifacts/HASHES.json';
import { debug } from '../utils/debug';
import { showToast } from './Toast';
import FormSkeleton from './FormSkeleton';
import { decodePrivateKeyWif } from '@bitauth/libauth';

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

const ResultBox = styled.div`
  margin-top: 20px;
  padding: 16px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
`;

const ResultLabel = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
`;

const ResultValue = styled.div`
  font-family: monospace;
  font-size: 14px;
  word-break: break-all;
`;

const BytecodeErrorBox = styled.div`
  margin-top: 12px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 8px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const BytecodeErrorIcon = styled.span`
  font-size: 18px;
  line-height: 1.4;
`;

const BytecodeErrorText = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.5;
`;

const TextArea = styled.textarea`
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 14px;
  font-family: monospace;
  resize: vertical;
  min-height: 80px;

  &:focus {
    outline: none;
    border-color: #4f46e5;
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
`;

const WifToggle = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
  text-align: left;

  &:hover {
    color: #4f46e5;
  }
`;

const WifWarning = styled.div`
  padding: 12px 16px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: 8px;
  font-size: 13px;
  color: #f59e0b;
  line-height: 1.5;
`;

const HelperTextBox = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 4px;
`;

const WarningIcon = styled.span`
  font-size: 14px;
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

export default function SafeDelayForm() {
  const { wallet } = useWallet();
  const { network } = useNetwork();
  const { addContract } = useStoredContracts();
  const [lockDuration, setLockDuration] = useState('30'); // days
  const [durationUnit, setDurationUnit] = useState<'days' | 'weeks' | 'months'>(() => {
    const saved = localStorage.getItem('safeDelay_durationUnit');
    return (saved === 'days' || saved === 'weeks' || saved === 'months' ? saved : 'days');
  });

  useEffect(() => {
    localStorage.setItem('safeDelay_durationUnit', durationUnit);
  }, [durationUnit]);
  const [depositAmount, setDepositAmount] = useState('');
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bytecodeError, setBytecodeError] = useState<string | null>(null);
  const [currentBlockHeight, setCurrentBlockHeight] = useState<number | null>(null);
  const [networkStatus, setNetworkStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [estimatedUnlockBlock, setEstimatedUnlockBlock] = useState<number | null>(null);
  const [estimatedUnlockDate, setEstimatedUnlockDate] = useState<string | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [useWifKey, setUseWifKey] = useState(false);
  const [wifKey, setWifKey] = useState('');
  const [wifError, setWifError] = useState<string | null>(null);

  // Track when wallet/network are ready, OR when WIF key mode is active
  useEffect(() => {
    if (useWifKey && wifKey && !wifError) {
      setFormReady(true);
    } else if (useWifKey && (!wifKey || wifError)) {
      setFormReady(false);
    } else if (wallet.connected && networkStatus === 'connected') {
      setFormReady(true);
    } else if (!wallet.connected) {
      setFormReady(false);
    }
  }, [wallet.connected, networkStatus, useWifKey, wifKey, wifError]);

  // Show skeleton loader while wallet/network are initializing
  if (!formReady) {
    return <FormSkeleton compileServerStatus={networkStatus === 'checking' ? 'checking' : undefined} />;
  }

  // Compute estimated unlock date from block number
  const computeUnlockDate = (blockHeight: number) => {
    // ~10 minutes per block, 144 blocks per day
    const blocksPerDay = 144;
    const msPerBlock = 10 * 60 * 1000; // 10 minutes in ms
    const daysToUnlock = Math.ceil((blockHeight - (currentBlockHeight || 0)) / blocksPerDay);
    const unlockMs = Date.now() + (daysToUnlock * blocksPerDay * msPerBlock);
    const date = new Date(unlockMs);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Fetch current block height on mount and when duration changes
  useEffect(() => {
    async function fetchBlockHeight() {
      try {
        setNetworkStatus('checking');
        const h = await fetchCurrentBlockHeight(network as 'mainnet' | 'testnet' | 'chipnet');
        setCurrentBlockHeight(h);
        setNetworkStatus('connected');
        const blocks = getDurationInBlocks();
        const unlockBlock = h + blocks;
        setEstimatedUnlockBlock(unlockBlock);
        setEstimatedUnlockDate(computeUnlockDate(unlockBlock));
      } catch {
        setNetworkStatus('disconnected');
      }
    }
    fetchBlockHeight();
  }, [lockDuration, durationUnit, network]);

  // Track dirty state: form is "dirty" if user changed lock duration or deposit from defaults
  const initialLockDuration = useRef('30');
  const initialDepositAmount = useRef('');
  const isFormDirty = lockDuration !== initialLockDuration.current || depositAmount !== initialDepositAmount.current;
  useFormNavigationWarning(isFormDirty);

  const getDurationInBlocks = () => {
    const days = durationUnit === 'days' 
      ? parseInt(lockDuration) 
      : durationUnit === 'weeks' 
        ? parseInt(lockDuration) * 7 
        : parseInt(lockDuration) * 30;
    // ~10 minutes per block, ~144 blocks per day
    return days * 144;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate: either wallet is connected or WIF key is provided
    if (useWifKey) {
      if (!wifKey || wifError) {
        showToast('Please enter a valid WIF key', 'warning');
        return;
      }
    } else {
      if (!wallet.connected || !wallet.pubkeyHash) {
        showToast('Please connect your wallet first', 'warning');
        return;
      }
    }

    // Use queueMicrotask to ensure loading state is painted before the synchronous
    // bytecode digest blocks the event loop (issue #227)
    queueMicrotask(() => setLoading(true));
    setBytecodeError(null);
    try {
      // Verify embedded artifact bytecode against known-good hash before deployment
      const SafeDelayArtifact = (await import('../../artifacts/SafeDelay.artifact.json')).default;
      const bytecodeHex = SafeDelayArtifact.debug?.bytecode;
      if (bytecodeHex) {
        const buf = Buffer.from(bytecodeHex, 'hex');
        const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
        const actualHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0')).join('');
        const knownHash = HASHES.SafeDelay?.bytecodeHash;
        if (knownHash && actualHash !== knownHash) {
          const msg = 'Contract bytecode verification failed — embedded artifact does not match the expected deployed bytecode. Please ensure you are using the correct compiled artifact. See docs/troubleshooting.md for how to fix this.';
          setBytecodeError(msg);
          debug.error('[SafeDelayForm] Bytecode mismatch:', actualHash, '!=', knownHash);
          setLoading(false);
          return;
        }
      }
      // Calculate lock duration in blocks (~10 min/block, ~144 blocks/day)
      const blocks = getDurationInBlocks();

      let ownerPkh: string;

      if (useWifKey) {
        // Derive PKH from WIF key — use libauth to derive P2PKH address then extract PKH
        const decoded = decodePrivateKeyWif(wifKey);
        if (typeof decoded === 'string') throw new Error(`Invalid WIF key: ${decoded}`);
        const pubkey = decoded.privateKey;
        const { publicKeyToP2pkhCashAddress } = await import('@bitauth/libauth');
        const addrResult = publicKeyToP2pkhCashAddress({
          publicKey: Uint8Array.from([...pubkey]),
          prefix: network === 'mainnet' ? 'bitcoincash' : 'bchtest',
        });
        if (typeof addrResult === 'string') throw new Error(`Failed to derive P2PKH address: ${addrResult}`);
        const { cashAddressToLockingBytecode } = await import('@bitauth/libauth');
        const lbResult = cashAddressToLockingBytecode(addrResult.address);
        if (typeof lbResult === 'string') throw new Error(`Failed to decode address: ${lbResult}`);
        const bytecode: Uint8Array = lbResult.bytecode;
        ownerPkh = Array.from(bytecode.slice(3, 23)).map(b => b.toString(16).padStart(2, '0')).join('');
      } else {
        // Derive PKH from wallet address
        ownerPkh = await addressToPubkeyHash(wallet.address!);
      }

      // Deploy contract — deploySafeDelay internally fetches current block height
      // and computes actualLockEndBlock = currentBlock + blocks (absolute height)
      const result = await deploySafeDelay({
        ownerPubkeyHash: ownerPkh,
        lockEndBlock: blocks, // relative — deploySafeDelay converts to absolute
        network: network as 'mainnet' | 'testnet' | 'chipnet',
      });

      setContractAddress(result.contractAddress);

      // Save contract to localStorage for dashboard
      addContract({
        address: result.contractAddress,
        ownerPkh: ownerPkh,
        lockEndBlock: result.actualLockEndBlock, // absolute lock end block
        type: 'single',
        createdAt: Date.now(),
      });
    } catch (error) {
      debug.error('Error creating SafeDelay:', error);
      showToast('Failed to create SafeDelay: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormContainer>
      <Title>Create Time-Locked Wallet</Title>
      <NetworkStatusBadge $status={networkStatus}>
        {networkStatus === 'connected' && <>🟢 Connected to {network}</>}
        {networkStatus === 'checking' && <>🟡 Connecting...</>}
        {networkStatus === 'disconnected' && <>🔴 Disconnected</>}
      </NetworkStatusBadge>
      <Description>
        Lock your BCH for a specified period. Funds can only be withdrawn after the lock expires.
      </Description>
      
      <Form onSubmit={handleSubmit}>
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
          <HelpText>~{getDurationInBlocks()} blocks (approximately {lockDuration} {durationUnit}){currentBlockHeight != null && estimatedUnlockBlock != null ? ` · unlocks at block ~${estimatedUnlockBlock}` : ''}{currentBlockHeight != null && estimatedUnlockDate != null ? ` (est. ~${estimatedUnlockDate})` : ''}</HelpText>
        </FormGroup>

        <FormGroup>
          <Label>Initial Deposit (BCH)</Label>
          <Input
            type="number"
            step="0.00000001"
            min="0.00001"
            placeholder="0.0"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            disabled={loading}
          />
          <HelperTextBox>
            <WarningIcon>⚠️</WarningIcon>
            <span>Minimum deposit: 0.0001 BCH (1000 sats) — dust threshold for on-chain settlement</span>
          </HelperTextBox>
        </FormGroup>

        <WifToggle type="button" onClick={() => { setUseWifKey(!useWifKey); setWifKey(''); setWifError(null); }}>
            {useWifKey ? '▲ Hide WIF key options — use wallet instead' : '▼ Advanced: Use WIF key instead of browser wallet'}
          </WifToggle>

          {useWifKey && (
            <FormGroup>
              <Label>WIF Private Key</Label>
              <TextArea
                placeholder="Kx... (51 or 52 chars)"
                value={wifKey}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setWifKey(val);
                  if (val && val.length !== 51 && val.length !== 52) {
                    setWifError('WIF keys are 51 or 52 characters');
                  } else if (val) {
                    try {
                      decodePrivateKeyWif(val);
                      setWifError(null);
                    } catch (err) {
                      setWifError(err instanceof Error ? err.message : 'Invalid WIF key');
                    }
                  } else {
                    setWifError(null);
                  }
                }}
                disabled={loading}
              />
              {wifError && <HelpText style={{ color: '#ef4444' }}>{wifError}</HelpText>}
              <WifWarning>
                ⚠️ <strong>Security Notice:</strong> Your WIF key is processed entirely client-side and never transmitted to any server. Only use keys you control. Never paste keys from untrusted sources.
              </WifWarning>
            </FormGroup>
          )}

        <SubmitButton type="submit" disabled={loading || (!useWifKey && (!wallet.connected || !!bytecodeError)) || (useWifKey && (!wifKey || !!wifError))}>
          {loading ? 'Creating...' : useWifKey ? 'Create SafeDelay with WIF key' : 'Create SafeDelay'}
        </SubmitButton>

        {bytecodeError && (
          <BytecodeErrorBox>
            <BytecodeErrorIcon>⚠️</BytecodeErrorIcon>
            <BytecodeErrorText>{bytecodeError}</BytecodeErrorText>
          </BytecodeErrorBox>
        )}

        {!wallet.connected && (
          <HelpText style={{ color: '#f59e0b', textAlign: 'center' }}>
            Connect your wallet to create a SafeDelay
          </HelpText>
        )}
      </Form>

      {contractAddress && (
        <ResultBox>
          <ResultLabel>Contract Address</ResultLabel>
          <ResultValue>{contractAddress}</ResultValue>
          <ResultLabel style={{ marginTop: '12px' }}>Lock Duration</ResultLabel>
          <ResultValue>{getDurationInBlocks()} blocks (~{lockDuration} {durationUnit})</ResultValue>
          {estimatedUnlockBlock != null && (
            <>
              <ResultLabel style={{ marginTop: '12px' }}>Unlocks at Block</ResultLabel>
              <ResultValue>~{estimatedUnlockBlock.toLocaleString()}{estimatedUnlockDate != null ? ` (est. ${estimatedUnlockDate})` : ''}</ResultValue>
              {currentBlockHeight != null && estimatedUnlockBlock != null && (
                <>
                  <ResultLabel style={{ marginTop: '8px' }}>Time Remaining</ResultLabel>
                  <ResultValue>
                    {(() => {
                      const blocksLeft = estimatedUnlockBlock - currentBlockHeight;
                      if (blocksLeft <= 0) return 'Unlocked — ready to withdraw';
                      const hours = blocksLeft * 10 / 60;
                      if (hours < 1) return `~${Math.round(blocksLeft * 10)} minutes (${blocksLeft.toLocaleString()} blocks)`;
                      if (hours < 24) return `~${Math.round(hours)} hours (~${blocksLeft.toLocaleString()} blocks)`;
                      const days = Math.round(hours / 24);
                      return `~${days} day${days !== 1 ? 's' : ''} (~${blocksLeft.toLocaleString()} blocks)`;
                    })()}
                  </ResultValue>
                </>
              )}
            </>
          )}
        </ResultBox>
      )}
    </FormContainer>
  );
}
