/**
 * Reconstructs a large BigInt from its two 64-bit limbs.
 * Assumes the number was split using base B = 2^63.
 *
 * @param high The high limb (most significant part).
 * @param low The low limb (least significant part).
 * @returns The reconstructed BigInt value.
 */
export function limbsToBigInt(high: bigint, low: bigint): bigint {
    const B = 1n << 63n; // Base used for splitting
    const reconstructedValue = high * B + low;
    return reconstructedValue;
}

/**
 * Splits a large BigInt into two 64-bit limbs (high and low).
 * Assumes the split should use base B = 2^63.
 *
 * @param value The BigInt value to split.
 * @returns An object containing the high and low limbs: { high: bigint, low: bigint }.
 */
export function bigIntToLimbs(value: bigint): { high: bigint; low: bigint } {
    const B = 1n << 63n; // Base used for splitting
    const high = value / B;
    const low = value % B;
    // Note: No overflow check here, assumes consumer (e.g., POD generator)
    // might handle validation if needed, or that inputs are within ~126 bits.
    return { high, low };
} 

/**
 * Converts a floating-point number to a BigInt by scaling it by a factor,
 * effectively preserving a fixed number of decimal places as integers.
 * Uses Math.round() during scaling to handle potential floating point inaccuracies.
 *
 * @param value The floating-point number to convert.
 * @param factor The scaling factor (e.g., 100000n for 5 decimal places).
 * @returns The scaled BigInt representation.
 */
export function floatToFixedInt(value: number, factor: bigint): bigint {
    if (typeof value !== 'number' || typeof factor !== 'bigint') {
        throw new Error('Invalid input types for floatToFixedInt');
    }
    // Multiply as numbers, then round, then convert to BigInt
    const scaledValue = Math.round(value * Number(factor));
    return BigInt(scaledValue);
}

/**
 * Converts a BigInt (representing a fixed-point number) back to a floating-point number
 * by dividing by the original scaling factor.
 *
 * @param value The scaled BigInt value.
 * @param factor The scaling factor used previously (e.g., 100000n for 5 decimal places).
 * @returns The original floating-point number (approximately).
 */
export function fixedIntToFloat(value: bigint, factor: bigint): number {
     if (typeof value !== 'bigint' || typeof factor !== 'bigint' || factor === 0n) {
         throw new Error('Invalid input types or zero factor for fixedIntToFloat');
     }
    // Convert to numbers for floating-point division
    return Number(value) / Number(factor);
} 