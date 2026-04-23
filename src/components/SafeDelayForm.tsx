import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useWallet } from '../context/WalletContext';
import { useNetwork } from '../context/NetworkContext';
import { deploySafeDelay, addressToPubkeyHash, fetchCurrentBlockHeight } from '../utils/deployContract';
import { useStoredContracts } from '../hooks/useSafeDelayContracts';
import { useFormNavigationWarning } from '../hooks/useFormNavigationWarning';
import HASHES from '../../artifacts/HASHES.json';
import { debug } from '../utils/debug';

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
  const [estimatedUnlockBlock, setEstimatedUnlockBlock] = useState<number | null>(null);

  // Fetch current block height on mount and when duration changes
  useEffect(() => {
    async function fetchBlockHeight() {
      try {
        const h = await fetchCurrentBlockHeight(network as 'mainnet' | 'testnet' | 'chipnet');
        setCurrentBlockHeight(h);
        const blocks = getDurationInBlocks();
        setEstimatedUnlockBlock(h + blocks);
      } catch {
        // silently ignore — preview is best-effort
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
    if (!wallet.connected || !wallet.pubkeyHash) {
      alert('Please connect your wallet first');
      return;
    }

    setLoading(true);
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
      // Calculate lock end block relative to current block height
      const blocks = getDurationInBlocks();
      
      // For now, we calculate an estimated lock end block
      // In production, fetch current block height from network
      const estimatedLockEnd = blocks; // Relative blocks from now
      
      

      // Convert wallet address to pubkey hash for the contract
      const ownerPkh = await addressToPubkeyHash(wallet.address!);

      // Deploy contract
      const result = await deploySafeDelay({
        ownerPubkeyHash: ownerPkh,
        lockEndBlock: estimatedLockEnd,
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
      alert('Failed to create SafeDelay: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormContainer>
      <Title>Create Time-Locked Wallet</Title>
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
              style={{ flex: 1 }}
            />
            <Select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as 'days' | 'weeks' | 'months')}
              style={{ width: '120px' }}
            >
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </Select>
          </div>
          <HelpText>~{getDurationInBlocks()} blocks (approximately {lockDuration} {durationUnit}){currentBlockHeight != null && estimatedUnlockBlock != null ? ` · unlocks at block ~${estimatedUnlockBlock}` : ''}</HelpText>
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
          />
          <HelpText>Leave empty to create contract without initial deposit</HelpText>
        </FormGroup>

        <SubmitButton type="submit" disabled={loading || !wallet.connected || !!bytecodeError}>
          {loading ? 'Creating...' : 'Create SafeDelay'}
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
        </ResultBox>
      )}
    </FormContainer>
  );
}
