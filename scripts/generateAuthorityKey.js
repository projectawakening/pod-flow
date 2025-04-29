const { randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const envFilePath = path.resolve(__dirname, '..', 'packages', 'contracts', '.env');
const privKeyVariableName = 'EDDSA_POSEIDON_AUTHORITY_PRIV_KEY';
const pubKeyVariableName = 'EDDSA_POSEIDON_AUTHORITY_PUB_KEY';

// --- Helper: Derive Public Key ---
// Moved crypto require inside to avoid loading if keys exist
function derivePubFromPriv(privateKeyHexWithPrefix) {
    try {
        const { derivePublicKey, packPublicKey } = require('@zk-kit/eddsa-poseidon');
        const { leBigIntToBuffer } = require('@zk-kit/utils');
        const privateKeyBuffer = Buffer.from(privateKeyHexWithPrefix.startsWith('0x') ? privateKeyHexWithPrefix.substring(2) : privateKeyHexWithPrefix, 'hex');
        const publicKeyCoords = derivePublicKey(privateKeyBuffer);
        const packedPublicKey = packPublicKey(publicKeyCoords);
        const publicKeyBuffer = leBigIntToBuffer(packedPublicKey, 32);
        return publicKeyBuffer.toString('base64').replace(/=+$/, '');
    } catch (err) {
        console.error(`Error deriving public key from ${privateKeyHexWithPrefix}:`, err.message);
        return null;
    }
}

// --- File Writing Helper ---
function writeEnvFile(content) {
    try {
        fs.writeFileSync(envFilePath, content, { encoding: 'utf8', mode: 0o600 });
        console.log(`Successfully updated ${envFilePath}.`);
        console.log("IMPORTANT: Ensure '.env' files are listed in your .gitignore!");
    } catch (err) {
        console.error(`Error writing to ${envFilePath}:`, err);
        console.error("Please ensure the directory structure exists (packages/contracts) and you have write permissions.");
        process.exit(1);
    }
}

// --- Main Logic ---
function generateAndStoreKeys() {
    console.log(`Checking for ${privKeyVariableName} and ${pubKeyVariableName} in ${envFilePath}...`);

    let envFileContent = '';
    if (fs.existsSync(envFilePath)) {
        envFileContent = fs.readFileSync(envFilePath, 'utf8');
    }

    const privKeyRegex = new RegExp(`^${privKeyVariableName}=(.*)`, 'm');
    const pubKeyRegex = new RegExp(`^${pubKeyVariableName}=(.*)`, 'm');

    const existingPrivKeyMatch = envFileContent.match(privKeyRegex);
    const existingPubKeyMatch = envFileContent.match(pubKeyRegex);

    const existingPrivKey = existingPrivKeyMatch && existingPrivKeyMatch[1]?.trim();
    const existingPubKey = existingPubKeyMatch && existingPubKeyMatch[1]?.trim();

    // Scenario 1: Private Key exists and is valid
    if (existingPrivKey) {
        console.log(`Found existing ${privKeyVariableName}. Deriving public key...`);
        const derivedPubKey = derivePubFromPriv(existingPrivKey);

        if (!derivedPubKey) {
            console.error("Failed to derive public key from existing private key. Cannot proceed.");
            process.exit(1);
        }

        if (existingPubKey && existingPubKey === derivedPubKey) {
            console.log(`Existing ${pubKeyVariableName} matches derived key. No changes needed.`);
            console.log(`  ${privKeyVariableName}=${existingPrivKey}`);
            console.log(`  ${pubKeyVariableName}=${existingPubKey}`);
            return; // All good
        } else {
            // Public key is missing, empty, or incorrect. Update/add it.
            if (existingPubKey) {
                console.log(`Existing ${pubKeyVariableName} is incorrect. Updating...`);
            } else {
                console.log(`${pubKeyVariableName} is missing or empty. Adding derived key...`);
            }
            
            const newPubKeyLine = `${pubKeyVariableName}=${derivedPubKey}`;
            let updatedEnvContent;
            
            // Filter out old/empty pub key line if it exists
            const lines = envFileContent.split('\n');
            const filteredLines = lines.filter(line => 
                !line.startsWith(pubKeyVariableName + '=') &&
                line.trim() !== '' 
            );

            // Add the new line (ensures it's added even if filteredLines is empty)
            updatedEnvContent = [...filteredLines, newPubKeyLine].join('\n');

            writeEnvFile(updatedEnvContent);
            console.log(`  Updated ${pubKeyVariableName}=${derivedPubKey}`);
            return;
        }
    }

    // Scenario 2: Private Key is missing or empty. Regenerate the pair.
    console.log(`${privKeyVariableName} is missing or empty. Generating new key pair...`);

    const privateKeyBuffer = randomBytes(32);
    const privateKeyHex = privateKeyBuffer.toString('hex');
    const privateKeyHexWithPrefix = `0x${privateKeyHex}`;
    const publicKeyBase64 = derivePubFromPriv(privateKeyHexWithPrefix);

    if (!publicKeyBase64) {
        console.error("Failed to derive public key during generation. Cannot update .env file.");
        process.exit(1);
    }

    console.log("\nGenerated New Key Pair:");
    console.log(`  ${privKeyVariableName}=${privateKeyHexWithPrefix}`);
    console.log(`  ${pubKeyVariableName}=${publicKeyBase64}`);
    console.log("\n----------------------------------------");

    const newPrivKeyLine = `${privKeyVariableName}=${privateKeyHexWithPrefix}`;
    const newPubKeyLine = `${pubKeyVariableName}=${publicKeyBase64}`;

    // Filter out any old/empty lines for both keys
    const lines = envFileContent.split('\n');
    const filteredLines = lines.filter(line => 
        !line.startsWith(privKeyVariableName + '=') && 
        !line.startsWith(pubKeyVariableName + '=') &&
        line.trim() !== ''
    );

    const updatedEnvContent = [...filteredLines, newPrivKeyLine, newPubKeyLine].join('\n');

    writeEnvFile(updatedEnvContent);
}

// Execute the function
generateAndStoreKeys(); 