import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('SafeDelayMultiSig', () => {
  let artifact;

  beforeAll(async () => {
    // Load the compiled artifact - relative to test file
    const artifactPath = __dirname + '/../artifacts/SafeDelayMultiSig.artifact.json';
    artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  });

  test('contract compiles successfully', () => {
    expect(artifact).toBeDefined();
    expect(artifact.bytecode).toBeDefined();
    expect(artifact.contractName).toBe('SafeDelayMultiSig');
  });

  test('contract has correct constructor parameters', () => {
    expect(artifact.constructorInputs).toHaveLength(5);
    const paramNames = artifact.constructorInputs.map(p => p.name);
    expect(paramNames).toContain('owner1');
    expect(paramNames).toContain('owner2');
    expect(paramNames).toContain('owner3');
    expect(paramNames).toContain('requiredSigs');
    expect(paramNames).toContain('lockEndBlock');
  });

  test('contract has correct functions in ABI', () => {
    const functions = artifact.abi.map(f => f.name);
    expect(functions).toContain('deposit');
    expect(functions).toContain('withdraw');
    expect(functions).toContain('cancel');
    expect(functions).toContain('extend');
  });

  test('withdraw function exists with correct signature', () => {
    const withdrawFn = artifact.abi.find(f => f.name === 'withdraw');
    expect(withdrawFn).toBeDefined();
    expect(withdrawFn.inputs).toHaveLength(8);
  });

  test('cancel function exists with correct signature', () => {
    const cancelFn = artifact.abi.find(f => f.name === 'cancel');
    expect(cancelFn).toBeDefined();
    expect(cancelFn.inputs).toHaveLength(7);
  });

  test('extend function exists with correct signature', () => {
    const extendFn = artifact.abi.find(f => f.name === 'extend');
    expect(extendFn).toBeDefined();
    expect(extendFn.inputs).toHaveLength(8);
  });
});
