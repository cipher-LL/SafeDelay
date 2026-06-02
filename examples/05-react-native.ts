/**
 * Example 5: React Native + WalletConnect Integration
 * 
 * A mobile-friendly implementation using WalletConnect v2 for transaction signing.
 * Use case: "Mobile app with hardware wallet security"
 * 
 * Prerequisites:
 * - React Native 0.72+
 * - @walletconnect/react-native-modal
 * - @web3modal/ethers5 (ethers.js v5 adapter)
 * 
 * Install dependencies:
 * npm install @walletconnect/react-native-modal @web3modal/ethers5 ethers@5.7.2
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Button, Alert } from 'react-native';
import WalletConnectProvider from '@walletconnect/react-native-modal';
import { ethers } from 'ethers';

// Configuration
const PROJECT_ID = 'YOUR_WALLETCONNECT_PROJECT_ID';
constchains = [ {
  chainId: 1,
  name: 'Bitcoin Cash Testnet',
  currency: 'BCH',
  explorerUrl: 'https://blockchair.com/bitcoin-cash',
  rpcUrl: 'https://api.blacktown.io/rpc',
  iconUrl: 'https://cryptologos.cc/logos/bitcoin-cash-bch-logo.png'
}];
const methods = ['cashscript_call', 'cashscript_deploy'];
const events = ['cashscript_event'];

// Contract configuration
const contractConfig = {
  // SafeDelay contract address (you'd deploy this first)
  contractAddress: 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  // Your public key hash from the contract
  ownerPKH: 'your_owner_public_key_hash_here',
  // Lock end block (filled in after deployment)
  lockEndBlock: 0,
  // Contract artifact (ABI equivalent)
  artifact: {
    // Simplified ABI for SafeDelay
    functions: [
      { name: 'deposit', inputs: [] },
      { name: 'withdraw', inputs: [{ name: 'recipient', type: 'address' }] },
      { name: 'cancel', inputs: [] },
      { name: 'getBalance', outputs: [{ type: 'uint64' }] }
    ]
  }
};

export default function SafeDelayMobile() {
  const [provider, setProvider] = useState(null);
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState('0');

  // Initialize WalletConnect
  const initProvider = async (wcProvider) => {
    const ethersProvider = new ethers.providers.Web3Provider(wcProvider);
    setProvider(ethersProvider);
    
    // Get connected account
    const accounts = await ethersProvider.listAccounts();
    if (accounts.length > 0) {
      setAccount(accounts[0]);
    }
  };

  // Check contract balance
  const checkBalance = async () => {
    if (!provider || !contractConfig.contractAddress) return;
    
    try {
      // Use CashScript's interface to query contract
      // In practice, you'd use a CashScript provider that works with WalletConnect
      const balance = await queryContractBalance(contractConfig.contractAddress);
      setBalance(ethers.utils.formatEther(balance));
    } catch (error) {
      console.error('Balance check failed:', error);
    }
  };

  // Deposit funds to contract
  const deposit = async () => {
    if (!provider || !account) {
      Alert.alert('Error', 'Please connect wallet first');
      return;
    }

    try {
      const tx = {
        to: contractConfig.contractAddress,
        value: ethers.utils.parseEther('0.01'), // 0.01 BCH
        data: '0x' // Constructor parameter (empty for deposit)
      };

      const signer = provider.getSigner();
      const txResponse = await signer.sendTransaction(tx);
      
      Alert.alert('Success', `Deposit sent: ${txResponse.hash}`);
      await checkBalance();
    } catch (error) {
      Alert.alert('Error', `Deposit failed: ${error.message}`);
    }
  };

  // Withdraw funds (only after lock expires)
  const withdraw = async () => {
    if (!provider || !account) {
      Alert.alert('Error', 'Please connect wallet first');
      return;
    }

    try {
      // For contract calls, you need to encode the function call
      // This requires a CashScript encoder that works with WalletConnect
      const withdrawData = encodeContractCall('withdraw', [account]);
      
      const tx = {
        to: contractConfig.contractAddress,
        value: 0,
        data: withdrawData
      };

      const signer = provider.getSigner();
      const txResponse = await signer.sendTransaction(tx);
      
      Alert.alert('Success', `Withdrawal sent: ${txResponse.hash}`);
      await checkBalance();
    } catch (error) {
      Alert.alert('Error', `Withdrawal failed: ${error.message}`);
    }
  };

  // Cancel contract (emergency - always available)
  const cancel = async () => {
    if (!provider || !account) {
      Alert.alert('Error', 'Please connect wallet first');
      return;
    }

    Alert.alert(
      'Confirm Cancel',
      'This will immediately withdraw all funds. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const cancelData = encodeContractCall('cancel', []);
              
              const tx = {
                to: contractConfig.contractAddress,
                value: 0,
                data: cancelData
              };

              const signer = provider.getSigner();
              const txResponse = await signer.sendTransaction(tx);
              
              Alert.alert('Success', `Contract cancelled: ${txResponse.hash}`);
              await checkBalance();
            } catch (error) {
              Alert.alert('Error', `Cancel failed: ${error.message}`);
            }
          }
        }
      ]
    );
  };

  // Mock function to encode contract calls
  // In production, use @cashcript/rn or similar library
  const encodeContractCall = (method, args) => {
    // This is a simplified placeholder
    // Real implementation would use CashScript's encoder
    const methodId = ethers.utils.id(method).slice(0, 10);
    const encoded = methodId + ethers.utils.defaultAbiCoder.encode(
      ['address'],
      args
    ).slice(2);
    return encoded;
  };

  // Mock function to query contract balance
  // In production, use proper CashScript provider
  const queryContractBalance = async (address) => {
    // This would query the full node directly
    // For now, return mock value
    return ethers.utils.parseEther('0');
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, marginBottom: 20 }}>
        SafeDelay Mobile
      </Text>

      <WalletConnectProvider
        projectId={PROJECT_ID}
        chains={chains}
        methods={methods}
        events={events}
        onInit={initProvider}
      >
        {account ? (
          <>
            <Text>Connected: {account.slice(0, 8)}...{account.slice(-6)}</Text>
            <Text>Balance: {balance} BCH</Text>
            
            <Button title="Check Balance" onPress={checkBalance} />
            <Button title="Deposit" onPress={deposit} />
            <Button title="Withdraw" onPress={withdraw} />
            <Button title="Cancel (Emergency)" onPress={cancel} />
          </>
        ) : (
          <Text>Connect your wallet to continue</Text>
        )}
      </WalletConnectProvider>
    </View>
  );
}

// === Alternative: Using WalletConnect Modal Directly ===
/*
import Web3Modal from '@web3modal/ethers5/native';

const web3ModalConfig = {
  projectId: PROJECT_ID,
  chains: chains,
  methods: methods,
  events: events,
  // Custom chain config for BCH
  chainsConfig: {
    1: {
      chainNamespace: 'eip155',
      chainId: '0x1', // BCH chain ID in EIP155 format
      rpcTarget: 'https://api.blacktown.io/rpc',
      ticker: 'BCH',
      tickerName: 'Bitcoin Cash'
    }
  }
};

// Then use:
// const session = await web3Modal.connect();
*/