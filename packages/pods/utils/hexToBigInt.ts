function hexToBigInt() {
  const hexString = process.argv[2];

  if (!hexString) {
    console.error("Usage: ts-node hexToBigInt.ts <hexString>");
    process.exit(1);
  }

  if (!hexString.startsWith("0x")) {
    console.error("Error: Input string must be a hexadecimal string starting with '0x'.");
    process.exit(1);
  }

  try {
    const bigIntValue = BigInt(hexString);
    console.log(bigIntValue.toString());
  } catch (e: any) {
    console.error(`Error converting hex string to BigInt: ${e.message}`);
    process.exit(1);
  }
}

hexToBigInt(); 