import { program } from 'commander';
import { zKey } from 'snarkjs';
import ejs from 'ejs';
import fs from 'fs-extra';
import path from 'path';
// import { fileURLToPath } from 'url'; // To handle __dirname in ES modules

// Define VerificationKey Interface based on snarkjs output structure
interface VerificationKey {
    protocol: string;
    curve: string;
    nPublic: number;
    vk_alpha_1: [string, string]; // G1 Point
    vk_beta_1?: [string, string]; // Optional G1 Point (Present in some keys)
    vk_beta_2: [[string, string], [string, string]]; // G2 Point
    vk_gamma_2: [[string, string], [string, string]]; // G2 Point
    vk_delta_1?: [string, string]; // Optional G1 Point (Present in some keys)
    vk_delta_2: [[string, string], [string, string]]; // G2 Point
    IC: [string, string][]; // Array of G1 Points (vk_input_constants)
}


// --- Constants ---
// BN128 Curve constants (as used in snarkjs templates)
const R_VALUE_BN128 = "21888242871839275222246405745257275088548364400416034343698204186575808495617";
const Q_VALUE_BN128 = "21888242871839275222246405745257275088696311157297823662689037894645226208583";

// --- Helper Functions ---

/**
 * Gets the directory name of the current module in ES modules.
 * @returns {string} The directory path.
 */
function getDirname(): string {
    // __dirname is a global variable in CommonJS environments providing the directory path
    return __dirname;
}

const SCRIPT_DIR = getDirname();
const TEMPLATES_DIR = path.join(SCRIPT_DIR, '..', 'templates'); // Assumes templates are in ../templates relative to src

/**
 * Generates the Solidity constant definitions string for a chunk of IC points.
 * @param chunkICs - Array of IC points [x, y] for the current chunk.
 * @param icStartIndex - The 1-based index of the first IC point in this chunk within the original full IC array.
 * @returns {string} - Solidity code snippet defining the constants.
 */
function generateIcConstantsString(chunkICs: [string, string][], icStartIndex: number): string {
    let constantsString = '';
    const indent = '    '; // 4 spaces for indentation
    chunkICs.forEach((ic, index) => {
        const icIndex = icStartIndex + index;
        // Ensure consistent indentation for both x and y constants
        constantsString += `${indent}uint256 constant IC${icIndex}x = ${ic[0]};\n`;
        constantsString += `${indent}uint256 constant IC${icIndex}y = ${ic[1]};\n`;
    });
    return constantsString;
}

/**
 * Generates the unrolled assembly loop code string for an ICLib chunk.
 * @param chunkICs - Array of IC points [x, y] for the current chunk.
 * @param icStartIndex - The 1-based index of the first IC point in this chunk within the original full IC array.
 * @returns {string} - Solidity assembly code snippet for the unrolled loop.
 */
function generateUnrolledLoopCode(chunkICs: [string, string][], icStartIndex: number): string {
    let loopCode = '';
    chunkICs.forEach((_, index) => {
        const icIndex = icStartIndex + index; // Index in the original IC array (starts from 1)
        const signalIndex = icIndex - 1;      // Corresponding index in pubSignals array (starts from 0)

        loopCode += `
        // Iteration ${index}: Accumulate pubSignals[${signalIndex}] * IC${icIndex}
        {
            assembly {
                // pubSignals is memory pointer + 32 bytes (length field) + signalIndex * 32 bytes (offset)
                let s := mload(add(add(pubSignals, 32), mul(${signalIndex}, 32)))

                // Prepare calldata arguments for G1UtilsLib.delegatecall_g1_mulAccC(pRx, pRy, x, y, s)
                mstore(add(calldataPtr, 4), mload(vkXAccumulator))     // arg0: pRx = current vkXAccumulator[0]
                mstore(add(calldataPtr, 36), mload(add(vkXAccumulator, 32)))    // arg1: pRy = current vkXAccumulator[1]
                mstore(add(calldataPtr, 68), IC${icIndex}x)  // arg2: x = IC${icIndex}x
                mstore(add(calldataPtr, 100), IC${icIndex}y) // arg3: y = IC${icIndex}y
                mstore(add(calldataPtr, 132), s)    // arg4: s = loaded signal value

                // Perform DELEGATECALL to G1UtilsLib.
                // delegatecall(gas, to, inputOffset, inputSize, outputOffset, outputSize)
                let success := delegatecall(gas(), g1UtilsLibAddress, calldataPtr, 164, returnDataPtr, 64)

                // Check for delegatecall success and sufficient return data.
                if iszero(success) {
                    returndatacopy(0, 0, returndatasize()) // Copy failure data from G1UtilsLib
                    revert(0, returndatasize())          // Revert with the failure data
                }
                if lt(returndatasize(), 64) { revert(0, 0) } // Should return 2 uint256s

                // Decode return values (new accumulator coordinates) and update vkXAccumulator in caller's memory.
                 mstore(vkXAccumulator, mload(returnDataPtr))             // Update vkXAccumulator[0]
                 mstore(add(vkXAccumulator, 32), mload(add(returnDataPtr, 32))) // Update vkXAccumulator[1]
            }
        }\n`;
    });
    return loopCode;
}

// --- Main Script Logic ---

async function run() {
    program
        .requiredOption('--zkey <path>', 'Path to the input .zkey file')
        .requiredOption('--output <path>', 'Path to the output directory for generated contracts')
        .option('--chunk-size <number>', 'Number of IC points per IC library', '150')
        .option('--circuit-name <name>', '(Optional) Explicit circuit name (derived from zkey filename if omitted)')
        .parse(process.argv);

    const options = program.opts();
    const zkeyPath = options.zkey;
    const outputBaseDir = options.output;
    const chunkSize = parseInt(options.chunkSize, 10);
    const explicitCircuitName = options.circuitName;

    if (isNaN(chunkSize) || chunkSize <= 0) {
        console.error("Error: --chunk-size must be a positive integer.");
        process.exit(1);
    }

    console.log("Starting Split Verifier Generation...");
    console.log(` ZKey Input:      ${zkeyPath}`);
    console.log(` Output Directory: ${outputBaseDir}`);
    console.log(` IC Lib Chunk Size: ${chunkSize}`);

    // 1. Read Verification Key JSON using snarkjs
    let verificationKey: VerificationKey;
    try {
        if (!fs.existsSync(zkeyPath)) {
            throw new Error(`Verification key file not found: ${zkeyPath}`);
        }
        // Use snarkjs to export the VK
        verificationKey = await zKey.exportVerificationKey(zkeyPath);
        console.log(" Successfully loaded verification key using snarkjs.");
    } catch (err: any) {
        console.error(`Error loading verification key from ${zkeyPath}:`, err.message);
        if (err.message.includes('Invalid inputs')) {
            console.error("  -> This might indicate the zkey file is corrupted or not a valid zkey.");
        }
        process.exit(1);
    }

    // 2. Derive Circuit Name & Sanitize (using zkey path for base name)
    let baseName = path.basename(zkeyPath, path.extname(zkeyPath)); // Use zkey path for name derivation
    baseName = baseName.replace(/^proto-pod-gpc_/, '').replace(/-pkey$/, ''); // Remove prefixes/suffixes
    const canonicalCircuitName = explicitCircuitName || baseName; // Use sanitized baseName if no explicit name
    const canonicalCircuitNameUnderscores = canonicalCircuitName.replace(/[^a-zA-Z0-9_]/g, '_'); // Sanitize final name for use in paths/identifiers

    // 3. Log VK Info & Validate IC Array / nPublic
    if (!verificationKey.IC || verificationKey.IC.length === 0) {
        console.error("Error: Verification key IC array is empty.");
        process.exit(1);
    }
    if (verificationKey.nPublic !== verificationKey.IC.length - 1) {
        console.error(`Error: Verification key nPublic (${verificationKey.nPublic}) does not match the length of IC array minus 1 (${verificationKey.IC.length - 1}).`);
        process.exit(1);
    }

    // 4. Prepare Template Data and Output Directory
    const totalInputs = verificationKey.nPublic; // Number of IC points beyond IC[0] (IC[1]...IC[nPublic])
    const numIcLibs = Math.ceil(totalInputs / chunkSize);
    const outputDir = path.join(outputBaseDir, canonicalCircuitNameUnderscores);
    console.log(`   Target Output Directory Path: ${outputDir}`); // DEBUG LOG

    console.log(` Total Public Inputs (excluding '1'): ${totalInputs}`);
    console.log(` Number of IC Libraries to generate: ${numIcLibs}`);

    try {
        await fs.ensureDir(outputDir);
        console.log(` Created output directory: ${outputDir}`);
    } catch (err: any) {
        console.error(`Error creating output directory ${outputDir}:`, err.message);
        process.exit(1);
    }

    // 5. Load EJS Templates
    let g1UtilsTemplate: string;
    let icLibTemplate: string;
    let verifierTemplate: string;
    try {
        g1UtilsTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'g1_utils_lib.sol.ejs'), 'utf-8');
        icLibTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'ic_lib.sol.ejs'), 'utf-8');
        verifierTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'groth16_verifier.sol.ejs'), 'utf-8');
         console.log("Successfully loaded contract templates.");
    } catch (err: any) {
        console.error("Error reading template files:", err.message);
        process.exit(1);
    }

    const templateDataCommon = {
        canonicalCircuitNameUnderscores: canonicalCircuitNameUnderscores,
    };

    // 6. Generate G1UtilsLib.sol
     console.log(`[1/${2 + numIcLibs}] Generating Groth16G1UtilsLib...`);
    try {
        // G1 template no longer needs circuit-specific name data
        const g1Rendered = ejs.render(g1UtilsTemplate, {}); // Pass empty object or only truly generic data if needed
        const g1OutputPath = path.join(outputDir, `Groth16G1UtilsLib.sol`); // Use fixed name
        await fs.writeFile(g1OutputPath, g1Rendered);
        console.log(`   -> ${g1OutputPath}`);
    } catch (err: any) {
        console.error("Error generating Groth16G1UtilsLib:", err.message);
        process.exit(1);
    }

    // 7. Generate ICLib_N.sol Files
    const allICs = verificationKey.IC; // IC[0], IC[1], ... IC[nPublic-1]
    for (let i = 0; i < numIcLibs; i++) {
        const chunkIndex = i;
        const chunkStartIcIndex = 1 + chunkIndex * chunkSize; // 1-based index in original IC array (IC[1] is first possible)
        // Slice end index needs to be relative to allICs array (0-based index for slice)
        const chunkEndIcIndexExclusive = Math.min(chunkStartIcIndex + chunkSize, allICs.length); // Exclusive end index for slice
        const chunkICs = allICs.slice(chunkStartIcIndex, chunkEndIcIndexExclusive); // Get the IC points for this chunk (e.g., IC[1]..IC[13])

        // Calculate the highest 0-based signal index required by this chunk
        // The highest IC index processed is chunkEndIcIndexExclusive - 1
        // The corresponding signal index is (chunkEndIcIndexExclusive - 1) - 1 = chunkEndIcIndexExclusive - 2
        const maxSignalIndexNeeded = chunkEndIcIndexExclusive - 2;
        // The require check needs to ensure pubSignals.length is at least maxSignalIndexNeeded + 1
        const requireSignalCountCheck = maxSignalIndexNeeded + 1;

        if (chunkICs.length === 0) {
            console.warn(`Skipping empty chunk index ${chunkIndex}. This might indicate an issue.`);
            continue;
        }

         console.log(`[${2 + i}/${2 + numIcLibs}] Generating IC Library ${chunkIndex} (IC[${chunkStartIcIndex}]..IC[${chunkEndIcIndexExclusive - 1}])...`);

        try {
            const icConstantsChunk = generateIcConstantsString(chunkICs, chunkStartIcIndex);
            const unrolledLoopCode = generateUnrolledLoopCode(chunkICs, chunkStartIcIndex);

            const icLibData = {
                ...templateDataCommon,
                chunkIndex: chunkIndex,
                icConstantsChunk: icConstantsChunk,
                unrolledLoopCode: unrolledLoopCode,
                requireSignalCountCheck: requireSignalCountCheck,
                // Pass indices for comments/docs in template
                icStartIndex : chunkStartIcIndex,
                icEndIndex: chunkEndIcIndexExclusive -1,
                // Pass chunk ICs directly if template needs more info
                 chunkICs: chunkICs,
                 // Pass individual IC points if template needs them? (Less ideal)
                 // ... could populate ic1x, ic1y etc. dynamically if needed by template
            };

            const icLibRendered = ejs.render(icLibTemplate, icLibData);
            const icLibOutputPath = path.join(outputDir, `ICLib_${i}_${canonicalCircuitNameUnderscores}.sol`);
            await fs.writeFile(icLibOutputPath, icLibRendered);
            console.log(`   -> ${icLibOutputPath}`);

        } catch (err: any) {
            console.error(`Error generating ICLib ${chunkIndex}:`, err.message);
             console.error("Template Data:", { chunkIndex, icStartIndex: chunkStartIcIndex, icEndIndex: chunkEndIcIndexExclusive -1 }); // Log data for debugging
             process.exit(1);
        }
    }

    // 8. Generate Groth16Verifier.sol
     console.log(`[${2 + numIcLibs}/${2 + numIcLibs}] Generating Groth16Verifier...`);
     try {
        const verifierData = {
            ...templateDataCommon,
            canonicalCircuitName: canonicalCircuitName, // Add non-underscored name for VERIFIER_ID
            // Field constants assumed bn128
            rValue: R_VALUE_BN128,
            qValue: Q_VALUE_BN128,
            // Core VK points
            vk_alpha_1: verificationKey.vk_alpha_1,
            vk_beta_2: verificationKey.vk_beta_2,
            vk_gamma_2: verificationKey.vk_gamma_2,
            vk_delta_2: verificationKey.vk_delta_2,
            IC: allICs, // Pass full IC array for IC[0] access
            // Configuration
            numIcLibs: numIcLibs,
            totalPublicSignals: totalInputs, // The number of *actual* inputs (nPublic)
            chunkSize: chunkSize // Pass chunk size if template needs it
        };

        const verifierRendered = ejs.render(verifierTemplate, verifierData);
        const verifierOutputPath = path.join(outputDir, `Groth16Verifier_${canonicalCircuitNameUnderscores}.sol`);
        await fs.writeFile(verifierOutputPath, verifierRendered);
        console.log(`   -> ${verifierOutputPath}`);

     } catch (err: any) {
        console.error("Error generating Groth16Verifier:", err.message);
        process.exit(1);
     }

     console.log("\nSplit Verifier Generation Complete!");
     console.log(` -> Files generated in: ${outputDir}`);

    // Explicitly exit the process cleanly
    process.exit(0);

}

// --- Execute Script ---
run().catch(err => {
    console.error("\nUnhandled error during script execution:", err);
    // Explicitly exit with error code
    process.exit(1);
});
