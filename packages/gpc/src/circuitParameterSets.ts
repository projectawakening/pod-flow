/**
 * @file Defines the sets of parameters for GPC circuits that we intend to
 *       compile locally using Circom. Each object in the array represents
 *       the requirements for a specific circuit variant.
 */

// Define the structure for circuit parameters 
// Use names matching ProtoPODGPCCircuitParams from @pcd/gpcircuits
export interface SupportedGPCCircuitParams {
    maxObjects: number; // Renamed from nObjects
    maxEntries: number; // Renamed from nEntries
    merkleMaxDepth: number;
    maxNumericValues: number; // Renamed from nNumericValues
    maxEntryInequalities: number; // Renamed from nEntryInequalities
    maxLists: number; // Renamed from nLists
    maxListElements: number; // Renamed from maxListSize
    // Map tupleArities from requirements to maxTuples and tupleArity
    maxTuples: number; 
    tupleArity: number; 
    includeOwnerV3: boolean;
    includeOwnerV4: boolean;
    circuitId?: string; // Optional: e.g., "dist_proof_base"
}

// Array of supported parameter sets
export const supportedParameterSets: SupportedGPCCircuitParams[] = [
    {
        "maxObjects": 3,
        "maxEntries": 26,
        "merkleMaxDepth": 6,
        "maxNumericValues": 2,
        "maxEntryInequalities": 1,
        "maxLists": 0,
        "maxListElements": 0,
        "maxTuples": 0,
        "tupleArity": 0,
        "includeOwnerV3": false,
        "includeOwnerV4": false,
        "circuitId": "3o-26e-6md-2nv-1ei-0x0l-0x0t-0ov3-0ov4"
    },
    {
        "maxObjects": 4,
        "maxEntries": 51,
        "merkleMaxDepth": 5,
        "maxNumericValues": 1,
        "maxEntryInequalities": 0,
        "maxLists": 1,
        "maxListElements": 3,
        "maxTuples": 0,
        "tupleArity": 0,
        "includeOwnerV3": false,
        "includeOwnerV4": false,
        "circuitId": "4o-51e-5md-1nv-0ei-1x3l-0x0t-0ov3-0ov4"
    }
]; 