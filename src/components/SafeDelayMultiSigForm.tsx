import { useState } from 'react';
import styled from 'styled-components';
import { useWallet } from '../context/WalletContext';

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

export default function SafeDelayMultiSigForm() {
  const { wallet } = useWallet();
  const [threshold, setThreshold] = useState('2');
  const [lockDuration, setLockDuration] = useState('30');
  const [durationUnit, setDurationUnit] = useState<'days' | 'weeks' | 'months'>('days');
  const [depositAmount, setDepositAmount] = useState('');
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

    setLoading(true);
    try {
      console.log('Creating SafeDelayMultiSig with:', {
        threshold: parseInt(threshold),
        lockEndBlock: getDurationInBlocks(),
        depositAmount,
      });
      // TODO: Implement actual multi-sig contract deployment
    } catch (error) {
      console.error('Error creating SafeDelayMultiSig:', error);
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
              <Input placeholder="Owner 1 cashaddress (required)" style={{ flex: 1 }} />
            </OwnerField>
            <OwnerField>
              <OwnerNumber>2</OwnerNumber>
              <Input placeholder="Owner 2 cashaddress" style={{ flex: 1 }} />
            </OwnerField>
            <OwnerField>
              <OwnerNumber>3</OwnerNumber>
              <Input placeholder="Owner 3 cashaddress" style={{ flex: 1 }} />
            </OwnerField>
          </OwnerList>
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
        </FormGroup>

        <SubmitButton type="submit" disabled={loading || !wallet.connected}>
          {loading ? 'Creating...' : 'Create MultiSig'}
        </SubmitButton>
      </Form>
    </FormContainer>
  );
}
