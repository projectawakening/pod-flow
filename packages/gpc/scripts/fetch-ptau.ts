import fs from 'fs'; // Use promises API where possible, but need streams
import fsPromises from 'fs/promises';
import path from 'path';
import https from 'https';
import url from 'url';

// --- Configuration Reading ---
function getPtauConfig(): { size: number; dir: string } {
    try {
        const configPath = path.resolve(__dirname, '..', 'circomkit.json');
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        const ptauSize = config.ptau;
        const ptauDir = path.resolve(__dirname, '..', config.dirPtau || './ptau'); // Default to ./ptau if not specified

        if (typeof ptauSize !== 'number' || ptauSize <= 0) {
            throw new Error("Invalid or missing 'ptau' size in circomkit.json");
        }
        console.log(`Read ptau size ${ptauSize} and directory ${config.dirPtau} from circomkit.json`);
        return { size: ptauSize, dir: ptauDir };
    } catch (error: any) {
        console.error(`Error reading ptau config from circomkit.json: ${error.message}`);
        throw error; // Re-throw
    }
}

// --- Dynamic Configuration ---
const { size: PTAU_SIZE, dir: PTAU_DIR } = getPtauConfig();
const TARGET_FILENAME = `powersOfTau28_hez_final_${PTAU_SIZE}.ptau`;
const TARGET_FILE_PATH = path.join(PTAU_DIR, TARGET_FILENAME);
// <<< Construct URL dynamically (assuming this source supports different sizes) >>>
const PTAU_DOWNLOAD_URL = `https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_${PTAU_SIZE}.ptau`;

// --- Main Fetch Logic ---

async function fetchPtauFile() {
    console.log(`--- Checking for Powers of Tau file (${TARGET_FILENAME}) ---`);

    // 1. Check if file already exists
    try {
        await fsPromises.access(TARGET_FILE_PATH);
        console.log(`File already exists at: ${TARGET_FILE_PATH}`);
        console.log("Skipping download.");
        return; // Exit early if file exists
    } catch (error) {
        // File doesn't exist, proceed with download
        console.log("File not found locally.");
    }

    // 2. Ensure ptau directory exists
    console.log(`Ensuring ptau directory exists: ${PTAU_DIR}`);
    try {
        await fsPromises.mkdir(PTAU_DIR, { recursive: true });
    } catch (error: any) {
        console.error(`Error creating ptau directory: ${error.message}`);
        process.exit(1);
    }

    // 3. Download the file
    console.log(`Starting download from: ${PTAU_DOWNLOAD_URL}`);
    console.log(`Saving to: ${TARGET_FILE_PATH}`);
    console.log("(This may take some time depending on network speed...)");

    const fileStream = fs.createWriteStream(TARGET_FILE_PATH);
    let receivedBytes = 0;
    let totalBytes = 0;
    let lastLoggedMb = 0;

    const request = https.get(PTAU_DOWNLOAD_URL, (response) => {
        if (response.statusCode !== 200) {
            console.error(`Error: Download failed with status code ${response.statusCode}`);
            fs.unlink(TARGET_FILE_PATH, () => {}); // Attempt to delete partial file
            process.exit(1);
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        if (totalBytes > 0) {
            console.log(`File size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
        }

        response.pipe(fileStream);

        response.on('data', (chunk) => {
            receivedBytes += chunk.length;
            const currentMb = Math.floor(receivedBytes / (1024 * 1024));
            // Log progress roughly every 10MB
            if (currentMb > lastLoggedMb && currentMb % 10 === 0) {
                 console.log(`Downloaded: ${currentMb} MB / ${(totalBytes / (1024 * 1024)).toFixed(0)} MB`);
                 lastLoggedMb = currentMb;
            }
        });

        fileStream.on('finish', () => {
            fileStream.close();
            console.log(`\nDownload complete! File saved to ${TARGET_FILE_PATH}`);
            console.log(`Received ${receivedBytes} bytes.`);
            if (totalBytes > 0 && receivedBytes !== totalBytes) {
                console.warn("Warning: Received bytes do not match expected content length.");
            }
        });
    });

    request.on('error', (err) => {
        console.error(`Error during download request: ${err.message}`);
        fs.unlink(TARGET_FILE_PATH, () => {}); // Attempt to delete partial file
        process.exit(1);
    });

    fileStream.on('error', (err) => {
        console.error(`Error writing file: ${err.message}`);
        process.exit(1);
    });
}

// --- Script Execution ---
fetchPtauFile().catch(error => {
    console.error("An unexpected error occurred:", error);
    process.exit(1);
}); 