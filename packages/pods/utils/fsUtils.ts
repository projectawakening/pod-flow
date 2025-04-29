import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import * as dotenv from 'dotenv';
import fs from 'fs';
// No longer need zk-kit imports here

export async function readJsonFile<T>(filePath: string, defaultVal: T): Promise<T> {
  try {
    const data = await readFile(filePath, 'utf-8');
    if (!data.trim()) {
      console.warn(`Warning: ${filePath} is empty or contains only whitespace. Returning default value.`);
      return defaultVal;
    }
    return JSON.parse(data) as T;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`Warning: ${filePath} not found. Returning default value.`);
      return defaultVal;
    } else if (error instanceof SyntaxError) {
      console.error(`Error parsing JSON from ${filePath}: ${error.message}`);
      console.warn(`Malformed JSON in ${filePath}. Returning default value.`);
      return defaultVal;
    }
    console.error(`Error reading file ${filePath}:`, error);
    throw error; // Re-throw other errors
  }
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    // Write file
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Successfully wrote data to ${filePath}`);
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    throw error;
  }
}

export function loadPrivateKey(): string {
  const contractsEnvPath = path.resolve(__dirname, '../../../packages/contracts/.env');
  const keyVariableName = 'EDDSA_POSEIDON_AUTHORITY_PRIV_KEY';

  if (fs.existsSync(contractsEnvPath)) {
    dotenv.config({ path: contractsEnvPath });
    console.log(`Loaded environment variables from: ${contractsEnvPath}`);
  } else {
    console.warn(`Warning: ${contractsEnvPath} not found. Required environment variables might be missing.`);
  }

  const privateKey = process.env[keyVariableName];

  if (!privateKey) {
    console.error(`Error: ${keyVariableName} is not set in the environment or ${contractsEnvPath}.`);
    console.error("Please run 'pnpm generate-authority-key' first.");
    process.exit(1);
  }

  // Remove 0x prefix if present, as @pcd/pod expects raw hex
  return privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
}

/**
 * Loads the authority's EdDSA public key from environment variables.
 * Assumes the key is stored as EDDSA_POSEIDON_AUTHORITY_PUB_KEY
 * and is a packed hexadecimal string representation.
 *
 * @returns {string} The EdDSA public key as a packed hexadecimal string.
 */
export function loadPublicKey(): string {
    // Load environment variables from .env file located at the root
    // Use the same path resolution as loadPrivateKey for consistency
    const envPath = path.resolve(__dirname, '../../../packages/contracts/.env'); 
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    } else {
        // Fallback to root .env if contracts/.env doesn't exist
        const rootEnvPath = path.resolve(__dirname, '..', '..', '.env'); 
        if (fs.existsSync(rootEnvPath)) {
            dotenv.config({ path: rootEnvPath });
        } else {
             console.warn(`Warning: Neither ${envPath} nor ${rootEnvPath} found. EDDSA_POSEIDON_AUTHORITY_PUB_KEY might be missing.`);
        }
    }

    const packedPublicKeyHex = process.env.EDDSA_POSEIDON_AUTHORITY_PUB_KEY;

    if (!packedPublicKeyHex) {
        throw new Error(
            'Missing EDDSA_POSEIDON_AUTHORITY_PUB_KEY in environment variables. ' +
            'Please ensure it is set in the relevant .env file.'
        );
    }

    // Return the string value directly
    return packedPublicKeyHex;
} 