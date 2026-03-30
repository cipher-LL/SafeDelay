import { useState } from 'react';
import styled from 'styled-components';
import { useWallet } from '../context/WalletContext';
import { useNetwork } from '../context/NetworkContext';
import { deploySafeDelayMultiSig, addressToPubkeyHash } from '../utils/deployContract';

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

const ErrorText = styled.span`
  font-size: 12px;
  color: #ef4444;
`;

export default function SafeDelayMultiSigForm() {
  const { wallet } = useWallet();
  const { network } = useNetwork();
  const [threshold, setThreshold] = useState('2');
  const [lockDuration, setLockDuration] = useState('30');
  const [durationUnit, setDurationUnit] = useState<'days' | 'weeks' | 'months'>('days');
  const [owner1Address, setOwner1Address] = useState('');
  const [owner2Address, setOwner2Address] = useState('');
  const [owner3Address, setOwner3Address] = useState('');
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      alert('Please connect your wallet first');
      return;
    }

    setError(null);
    setContractAddress(null);
    setLoading(true);

    try {
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

      console.log('Creating SafeDelayMultiSig with:', {
        owner1Pkh,
        owner2Pkh: finalOwner2Pkh,
        owner3Pkh: finalOwner3Pkh,
        threshold: parseInt(threshold),
        lockEndBlock: getDurationInBlocks(),
        network,
      });

      const result = await deploySafeDelayMultiSig({
        owner1Pkh,
        owner2Pkh: finalOwner2Pkh,
        owner3Pkh: finalOwner3Pkh,
        threshold: parseInt(threshold),
        lockEndBlock: getDurationInBlocks(),
        network: network as 'mainnet' | 'testnet' | 'chipnet',
      });

      setContractAddress(result.contractAddress);
    } catch (err) {
      console.error('Error creating SafeDelayMultiSig:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormContainer>
      <Title>Create MultiSig Time-Lock</Title>
      <Description>
        Require 2-of-3 signatures to withdraw. Enhanced security for larger amounts.
      </Description>

      <Form onSubmit={handleSubmit}>
        <FormGroup>
          <Label>Threshold (required signatures)</Label>
          <Select value={threshold} onChange={(e) => setThreshold(e.target.value)}>
            <option value="2">2 of 3</option>
            <option value="3">3 of 3</option>
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
                onChange={(e) => setOwner1Address(e.target.value)}
              />
            </OwnerField>
            <OwnerField>
              <OwnerNumber>2</OwnerNumber>
              <Input
                placeholder="Owner 2 cashaddress (optional)"
                style={{ flex: 1 }}
                value={owner2Address}
                onChange={(e) => setOwner2Address(e.target.value)}
              />
            </OwnerField>
            <OwnerField>
              <OwnerNumber>3</OwnerNumber>
              <Input
                placeholder="Owner 3 cashaddress (optional)"
                style={{ flex: 1 }}
                value={owner3Address}
                onChange={(e) => setOwner3Address(e.target.value)}
              />
            </OwnerField>
          </OwnerList>
          <HelpText>Defaults to Owner 1 if not provided. Owner 1 is required.</HelpText>
        </FormGroup>

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
          <HelpText>~{getDurationInBlocks()} blocks</HelpText>
        </FormGroup>

        {error && <ErrorText>{error}</ErrorText>}

        <SubmitButton type="submit" disabled={loading || !wallet.connected}>
          {loading ? 'Creating...' : 'Create MultiSig'}
        </SubmitButton>
      </Form>

      {contractAddress && (
        <ContractAddressBox>
          <ContractAddressLabel>Contract Address:</ContractAddressLabel>
          <ContractAddress>{contractAddress}</ContractAddress>
          <HelpText style={{ marginTop: '8px' }}>
            Fund this address to activate the time-lock. Funds can be withdrawn after the lock period with {threshold} of 3 signatures.
          </HelpText>
        </ContractAddressBox>
      )}
    </FormContainer>
  );
}
