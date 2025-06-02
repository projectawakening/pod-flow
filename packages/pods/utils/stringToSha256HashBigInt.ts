import { podBytesHash } from "@pcd/pod";

function stringToPoseidonHash() {
  const inputString = process.argv[2];

  if (!inputString) {
    console.error("Usage: ts-node stringToPoseidonHash.ts <inputString>");
    process.exit(1);
  }

  try {
    // podBytesHash takes a string or Uint8Array. For a string, it converts to UTF-8 bytes then Poseidon hashes.
    const hashedValue = podBytesHash(inputString);
    console.log(hashedValue.toString());
  } catch (e: any) {
    console.error(`Error hashing string: ${e.message}`);
    process.exit(1);
  }
}

stringToPoseidonHash(); 