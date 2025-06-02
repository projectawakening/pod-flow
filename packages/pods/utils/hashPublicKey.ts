import { podEdDSAPublicKeyHash } from "@pcd/pod";

function hashPublicKey() {
  const publicKeyString = process.argv[2];

  if (!publicKeyString) {
    console.error("Usage: ts-node hashPublicKey.ts <signerPublicKeyString>");
    process.exit(1);
  }

  try {
    const hashedPublicKey = podEdDSAPublicKeyHash(publicKeyString);
    console.log(hashedPublicKey.toString());
  } catch (e: any) {
    console.error(`Error hashing public key: ${e.message}`);
    process.exit(1);
  }
}

hashPublicKey(); 