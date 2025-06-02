import fs from 'fs/promises';
import path from 'path';
import * as snarkjs from 'snarkjs';
import { PROTO_POD_GPC_FAMILY_NAME } from '@pcd/gpcircuits'; // Assuming this is the correct family name

// Simple logger for snarkjs (can be made conditional based on verbosity)
const logger = console;

// --- Helper Function to find and read template ---
async function getGroth16VerifierTemplate(): Promise<string> {
    try {
        // Find the main snarkjs entry point file path using require.resolve
        const snarkjsEntryPoint = require.resolve('snarkjs');
        // Navigate up from the entry point to the likely package root
        // This might need adjustment depending on snarkjs package structure
        // Example: If entry point is .../node_modules/snarkjs/build/snarkjs.cjs
        const snarkjsPackageDir = path.dirname(path.dirname(snarkjsEntryPoint)); // Go up two levels from build/snarkjs.cjs

        // Construct the path to the template file within the package
        const templatePath = path.join(
            snarkjsPackageDir,
            'templates',
            'verifier_groth16.sol.ejs'
        );

        console.log(`  Attempting to read template from resolved path: ${templatePath}`);
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        console.log(`  Successfully read Groth16 verifier template.`);
        return templateContent;
    } catch (error: any) {
        console.error(`  ERROR: Could not resolve or read Groth16 template file: ${error.message}`);
        console.error(`  Make sure 'snarkjs' is installed correctly in the workspace root node_modules.`);
        throw new Error("Failed to locate and read Groth16 verifier template via require.resolve.");
    }
}

// --- Main Function ---
async function exportVerifier(canonicalCircuitName: string, relativeOutputDir: string) {
    console.log(`
=== Exporting Solidity Verifier for Circuit: ${canonicalCircuitName} ===`);

    if (!canonicalCircuitName || !relativeOutputDir) {
        throw new Error("Missing required arguments: canonicalCircuitName and relativeOutputDir");
    }

    const gpcPackageDir = path.resolve(__dirname, '..'); // Assumes script is in packages/gpc/scripts
    const artifactsDir = path.join(gpcPackageDir, 'artifacts');
    const absoluteOutputDir = path.resolve(__dirname, relativeOutputDir);

    // Construct paths
    const circuitFamilyName = PROTO_POD_GPC_FAMILY_NAME;
    const zkeyFileName = `${circuitFamilyName}_${canonicalCircuitName}-pkey.zkey`;
    // Format circuit name for Solidity filename (replace hyphens with underscores)
    const circuitNameUnderscores = canonicalCircuitName.replace(/-/g, '_');
    const solVerifierFileName = `Groth16Verifier_${circuitNameUnderscores}.sol`; // Apply new format
    const zkeyPath = path.join(artifactsDir, zkeyFileName);
    const solVerifierPath = path.join(absoluteOutputDir, solVerifierFileName);

    console.log(`  Input ZKey Path: ${zkeyPath}`);
    console.log(`  Output Verifier Path: ${solVerifierPath}`); // Log new path

    // 1. Check if ZKey exists
    try {
        await fs.access(zkeyPath);
        console.log(`  Found ZKey file.`);
    } catch (error) {
        console.error(`  ERROR: Input ZKey file not found at ${zkeyPath}`);
        throw error; // Re-throw to stop execution
    }

    // 2. Check if Verifier already exists
    try {
        await fs.access(solVerifierPath);
        console.log(`  Verifier contract ${solVerifierFileName} already exists in ${absoluteOutputDir}. Skipping export.`);
        return; // Exit gracefully
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log(`  Verifier contract does not exist yet. Proceeding with export...`);
            // File doesn't exist, continue
        } else {
            // Other error accessing path
            console.error(`  ERROR: Could not check for existing verifier at ${solVerifierPath}: ${error.message}`);
            throw error;
        }
    }

    // 3. Export Verifier using snarkjs
    try {
        // <<< Read the EJS template content >>>
        const groth16Template = await getGroth16VerifierTemplate();

        // <<< Create the templates object >>>
        const templates = { groth16: groth16Template };

        console.log(`  Calling snarkjs.zKey.exportSolidityVerifier...`);
        const solidityCode = await snarkjs.zKey.exportSolidityVerifier(zkeyPath, templates, logger);

        if (!solidityCode || typeof solidityCode !== 'string' || solidityCode.length === 0) {
             throw new Error("snarkjs.zKey.exportSolidityVerifier did not return valid Solidity code.");
        }

        // Ensure output directory exists
        await fs.mkdir(absoluteOutputDir, { recursive: true });

        // Write the contract
        await fs.writeFile(solVerifierPath, solidityCode, 'utf-8');
        console.log(`  Successfully exported verifier contract to ${solVerifierPath}`);

    } catch (error: any) {
        console.error(`  ERROR during snarkjs export or file writing: ${error.message}`);
        console.error(error.stack); // Print stack trace for debugging
        throw error;
    } finally {
        // Terminate snarkjs workers if possible
        if (typeof (snarkjs as any)?.thread?.terminateAll === 'function') {
            await (snarkjs as any).thread.terminateAll();
        }
    }
}

// --- Script Execution ---
const args = process.argv.slice(2);
const circuitNameArg = args[0];
const outputDirArg = args[1];

if (!circuitNameArg || !outputDirArg) {
  console.error("\nUsage: ts-node scripts/export-solidity-verifier.ts <canonicalCircuitName> <relativeOutputDir>");
  console.error("  Example: ts-node scripts/export-solidity-verifier.ts 5o-53e-...-0ov4 ../contracts/verifiers");
  process.exit(1);
}

exportVerifier(circuitNameArg, outputDirArg)
    .then(() => {
        console.log("--- SCRIPT FINISHED SUCCESSFULLY ---");
        process.exit(0); // <<< Add explicit exit on success
    })
    .catch(error => {
        console.error("\n--- SCRIPT FAILED ---");
        // Error already logged within the function
        process.exit(1);
    }); 