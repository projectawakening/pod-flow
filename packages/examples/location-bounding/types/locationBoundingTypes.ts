import type { SolarSystemLocation } from "../../../../src/types/gameData";

/**
 * Data structure representing a Distance Attestation POD.
 */
export interface DistanceAttestationData {
    objectId1: string;              // ID of the first object (e.g., ship)
    objectId2: string;              // ID of the second object (e.g., assembly)
    object1Location: string;        // contentId of object1 location attestation POD used in the distance calculation
    object2Location: string;        // contentId of object2 location attestation POD used in the distance calculation
    distanceSquaredMeters: bigint;  // Calculated distance squared
    timeThreshold: bigint;          // Guaranteed time threshold between distance and either object location attestation
    pod_data_type: string;          // 'evefrontier.distance_attestation'
    timestamp: bigint;              // Timestamp of the distance attestation POD
    keccak256_merkle_root: string;     // Keccak256 hash of the merkle root of the distance attestation POD
}

/**
 * Data structure representing a Location Attestation POD.
 */
export interface LocationAttestationData {
    objectId: string;              // on-chain ID of the object whose location is attested
    solarSystemId: number;         // solar system ID of the object's location
    location: SolarSystemLocation; // location coordinates used for distance calculation step
    pod_data_type: string;         // 'evefrontier.location_attestation'
    timestamp: bigint;             // timestamp of the location attestation POD
    keccak256_merkle_root: string;    // Keccak256 hash of the merkle root of the distance attestation POD
}