import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { generateGroth16ProofCalldata, Groth16Proof, PublicSignals } from './proofUtils.js'; // Adjust path as needed

// Replicate __dirname and __filename for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    // --- Configuration ---
    // Adjust these paths to where your actual proof files are
    const proofFilePath = path.join(__dirname, '../../gpc/proofs/fullDistanceProofConfig_1o-8e-5md-0nv-0ei-0x0l-0x0t-0ov3-0ov4_proof.json'); 
    const publicSignalsFilePath = path.join(__dirname, '../../gpc/proofs/fullDistanceProofConfig_1o-8e-5md-0nv-0ei-0x0l-0x0t-0ov3-0ov4_public.json');

    // --- Load Proof Data ---
    let proof: Groth16Proof;
    let publicSignals: PublicSignals;

    try {
        console.log(`Loading proof from: ${proofFilePath}`);
        const proofFileContent = fs.readFileSync(proofFilePath, 'utf-8');
        proof = JSON.parse(proofFileContent);

        console.log(`Loading public signals from: ${publicSignalsFilePath}`);
        const publicSignalsFileContent = fs.readFileSync(publicSignalsFilePath, 'utf-8');
        publicSignals = JSON.parse(publicSignalsFileContent);
    } catch (error: any) {
        console.error(`Error loading proof files: ${error.message}`);
        process.exit(1);
    }

    // --- Generate Calldata ---
    let calldataString: string;
    try {
        calldataString = await generateGroth16ProofCalldata(proof, publicSignals);
    } catch (error: any) {
        console.error(`Error generating calldata: ${error.message}`);
        process.exit(1);
    }

    // --- Parse and Format for Solidity ---
    // The calldata string from snarkjs is comma-separated.
    // Example: "pA_x,pA_y,pB_x1,pB_x2,pB_y1,pB_y2,pC_x,pC_y,input1,input2,..."
    // We need to remove the quotes snarkjs adds around each element.
    const parts = calldataString.replace(/"/g, '').split(',');

    if (parts.length < 8) { // Must have at least pA, pB, pC
        console.error("Generated calldata string is too short or malformed.");
        process.exit(1);
    }

    const pA = [parts[0], parts[1]];
    const pB = [[parts[2], parts[3]], [parts[4], parts[5]]];
    const pC = [parts[6], parts[7]];
    const signals = parts.slice(8); // The rest are public signals

    // --- Output for Solidity Test ---
    console.log("\n--- Solidity VerifyZKProofParams Data ---");
    console.log(`
// Copy and paste this into your test file:

VerifyZKProofParams memory verifyZKProofParams = VerifyZKProofParams({  
  pA: [
    ${pA[0]},
    ${pA[1]}
  ],
  pB: [
    [
      ${pB[0][0]},
      ${pB[0][1]}
    ],
    [
      ${pB[1][0]},
      ${pB[1][1]}
    ]
  ],
  pC: [
    ${pC[0]},
    ${pC[1]}
  ],
  pubSignals: [
    ${signals.join(',\n    ')}
  ]
});
    `);

    // Also, ensure your PUBLIC_SIGNAL_DATA in the test matches 'signals'
    console.log("\n--- Solidity PUBLIC_SIGNAL_DATA Array ---");
    console.log(`
// Ensure this matches your PUBLIC_SIGNAL_DATA constant in the test:
uint256[${signals.length}] memory PUBLIC_SIGNAL_DATA = [
    ${signals.join(',\n    ')}
];
    `);
}

main().catch(error => {
    console.error("Script failed:", error);
    process.exit(1);
});