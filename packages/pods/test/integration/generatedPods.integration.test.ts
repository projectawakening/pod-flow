import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { deserializePod, verifyPodInternalSignature, checkPodSigner } from '../utils/podVerification';
import { JSONPOD } from '@pcd/pod';

// TODO: Implement or import a function to load the authority's public key
// This should correspond to the private key used in the generation scripts.
// For now, using a placeholder.
// import { loadPublicKey } from '../scripts/podUtils'; // Ideal
const AUTHORITY_PUB_KEY = process.env.EDDSA_POSEIDON_AUTHORITY_PUB_KEY || '+2WbgNagwyfnC06GKPqEipgJiUaPo9fAWI5KI8ErPKk'; // Placeholder - MUST MATCH SIGNING KEY

const POD_DATA_DIR = path.join(__dirname, '..', 'pod-data');

// Helper to safely get PODs from different file structures
function getPodsFromFile(filePath: string): JSONPOD[] {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    const pods: JSONPOD[] = [];

    if (Array.isArray(jsonData)) {
        // Handles killmail_pods.json (JSONPOD[]) and
        // smart_assembly_pods.json / solar_system_pods.json (StoredPOD[])
        jsonData.forEach(item => {
            if (item && item.pod && typeof item.pod === 'object') {
                // Likely StoredPOD format
                pods.push(item.pod as JSONPOD);
            } else if (item && item.entries && item.signature) {
                // Likely already JSONPOD format
                pods.push(item as JSONPOD);
            }
        });
    } else if (typeof jsonData === 'object' && jsonData !== null) {
        // Handles item_type_pods.json (map)
        Object.values(jsonData).forEach(pod => {
            if (pod && typeof pod === 'object' && (pod as JSONPOD).entries && (pod as JSONPOD).signature) {
                 pods.push(pod as JSONPOD);
            }
        });
    }
    return pods;
}


describe('Generated POD File Verification [Integration]', () => {
    let podFiles: string[] = [];

    beforeAll(() => {
        // Check if AUTHORITY_PUB_KEY is the placeholder
        if (AUTHORITY_PUB_KEY === '+2WbgNagwyfnC06GKPqEipgJiUaPo9fAWI5KI8ErPKk') {
             console.warn(`
---------------------------------------------------
WARNING: Using placeholder public key for integration tests.
Ensure EDDSA_POSEIDON_AUTHORITY_PUB_KEY environment variable is set 
with the actual public key corresponding to the signing private key 
for accurate verification.
---------------------------------------------------
`);
        }
        try {
            podFiles = fs.readdirSync(POD_DATA_DIR)
                .filter(file => file.endsWith('.json'));
            console.log(`Found POD files to test: ${podFiles.join(', ')}`);
            if (podFiles.length === 0) {
                 console.warn(`WARNING: No *.json files found in ${POD_DATA_DIR}. Integration tests will be skipped.`);
            }
        } catch (error) {
            console.error(`Error reading POD data directory ${POD_DATA_DIR}:`, error);
            // If directory doesn't exist, tests will fail/skip, which is okay.
        }
    });

    // Dynamically create tests for each file
    it.each(podFiles)('should contain valid and correctly signed PODs in %s', (filename) => {
        const filePath = path.join(POD_DATA_DIR, filename);
        let podsToTest: JSONPOD[] = [];
        let fileReadError = false;

        try {
            podsToTest = getPodsFromFile(filePath);
            expect(podsToTest.length).toBeGreaterThan(0); // Expect at least one POD if file exists
        } catch (error) {
            console.error(`Error reading or parsing ${filename}:`, error);
            fileReadError = true;
            // Use fail(message) explicitly if available in Vitest/Jest, otherwise assert false
            expect(fileReadError, `Test setup failed: Could not read/parse ${filename}`).toBe(false);
        }

        if (!fileReadError) {
            podsToTest.forEach((pod, index) => {
                // 1. Verify Internal Signature
                const isInternalSigValid = verifyPodInternalSignature(pod);
                expect(isInternalSigValid, `POD[${index}] in ${filename} should have a valid internal signature`).toBe(true);

                // 2. Check Signer Authority
                const isCorrectSigner = checkPodSigner(pod, AUTHORITY_PUB_KEY);
                expect(isCorrectSigner, `POD[${index}] in ${filename} should be signed by the correct authority`).toBe(true);
            });
        }
    });
}); 