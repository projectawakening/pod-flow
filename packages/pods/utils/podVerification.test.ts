// packages/pods/utils/podVerification.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import {
  serializePod,
  deserializePod,
  verifyPodInternalSignature,
  checkPodSigner,
  getPodDataValue
} from './podVerification';
import { JSONPOD, POD, PODEntries, PODValue } from '@pcd/pod';

// --- Test Setup & Fixtures ---

// IMPORTANT: Replace with actual keys used for testing.
// DO NOT commit real private keys.
// Consider using environment variables or a secure loading mechanism.
const TEST_PRIV_KEY = '05f6aedabf87387d69a5f2bed9f8eb0072b91727a10a55385afbcf252e03048f';
const TEST_PUB_KEY = '+2WbgNagwyfnC06GKPqEipgJiUaPo9fAWI5KI8ErPKk';
const WRONG_PUB_KEY = 'Mc2IbgO1ihBqpoPgE4WacZcORWNfNJko5v9rg4o2AiM';

let validJsonPod: JSONPOD;
let serializedValidPod: string;

beforeAll(() => {
  // Generate a valid POD fixture once
  const sampleEntries: PODEntries = {
    name: { type: "string", value: "Test POD" },
    value: { type: "int", value: 42n },
    flag: { type: "boolean", value: true },
    nested: { type: "string", value: JSON.stringify({ a: 1 })}
  };

  try {
    // Assuming POD.sign is synchronous - adjust if it's async
    const podInstance = POD.sign(sampleEntries, TEST_PRIV_KEY);
    validJsonPod = podInstance.toJSON();
    serializedValidPod = JSON.stringify(validJsonPod);

    // Basic check that generated fixture looks okay
    if (validJsonPod.signerPublicKey !== TEST_PUB_KEY) {
      console.warn("Warning: Generated POD public key does not match TEST_PUB_KEY. Check key pair.");
      // You might want to throw an error here if keys *must* match
    }

  } catch (e) {
    console.error("FATAL: Test setup failed - Could not sign sample POD.", e);
    // Make tests fail gracefully if setup fails
    validJsonPod = { entries: {}, signature: "error", signerPublicKey: 'error' };
    serializedValidPod = '{}';
  }
});

// --- Tests ---

describe('podVerification Utilities', () => {

  describe('serializePod / deserializePod', () => {
    it('should serialize and deserialize correctly', () => {
      const serialized = serializePod(validJsonPod);
      const deserialized = deserializePod(serialized);
      expect(deserialized).toEqual(validJsonPod);
    });

    it('deserializePod should throw on invalid JSON', () => {
      expect(() => deserializePod('{')).toThrow();
    });

    it('deserializePod should throw on missing structure', () => {
      expect(() => deserializePod('{}')).toThrow(/structure/);
      expect(() => deserializePod(JSON.stringify({ entries: {} }))).toThrow(/structure/);
      expect(() => deserializePod(JSON.stringify({ entries: {}, signature: {} }))).toThrow(/structure/);
    });
  });

  describe('verifyPodInternalSignature', () => {
    it('should return true for a valid POD', () => {
      expect(verifyPodInternalSignature(validJsonPod)).toBe(true);
    });

    it('should return false for tampered entries', () => {
      const tampered = deserializePod(serializePod(validJsonPod)); // Deep clone
      tampered.entries.value = { int: (99n).toString() };
      expect(verifyPodInternalSignature(tampered)).toBe(false);
    });

    it('should return false for tampered signature', () => {
      const tampered = deserializePod(serializePod(validJsonPod));
      // Provide a signature string that is FORMATTED correctly (128 hex chars)
      // but is cryptographically incorrect.
      tampered.signature = '0'.repeat(128);
      expect(verifyPodInternalSignature(tampered)).toBe(false);
    });
     it('should return false for tampered public key', () => {
       const tampered = deserializePod(serializePod(validJsonPod));
       tampered.signerPublicKey = WRONG_PUB_KEY;
       // The internal signature relies on the embedded key, so changing the key
       // without changing the signature should make it fail.
       expect(verifyPodInternalSignature(tampered)).toBe(false);
     });
  });

  describe('checkPodSigner', () => {
    it('should return true for the correct authority key', () => {
      expect(checkPodSigner(validJsonPod, TEST_PUB_KEY)).toBe(true);
    });

    it('should return false for an incorrect authority key', () => {
      expect(checkPodSigner(validJsonPod, WRONG_PUB_KEY)).toBe(false);
    });
  });

  describe('getPodDataValue', () => {
    it('should return the correct PODValue for existing entries', () => {
      const nameVal = getPodDataValue(validJsonPod, 'name');
      expect(nameVal).toEqual({ type: "string", value: "Test POD" });

      const valueVal = getPodDataValue(validJsonPod, 'value');
      expect(valueVal).toEqual({ type: "int", value: 42n });

      const flagVal = getPodDataValue(validJsonPod, 'flag');
      expect(flagVal).toEqual({ type: "boolean", value: true });
    });

    it('should return undefined for non-existent entries', () => {
      expect(getPodDataValue(validJsonPod, 'missingKey')).toBeUndefined();
    });
  });
}); 