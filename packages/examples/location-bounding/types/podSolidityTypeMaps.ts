export const locationAttestationSolidityTypeMap: Record<string, string> = {
  objectId: "uint256",
  solarSystemId: "uint256",
  location_x_low: "uint256",
  location_x_high: "uint256",
  location_y_low: "uint256",
  location_y_high: "uint256",
  location_z_low: "uint256",
  location_z_high: "uint256",
  pod_data_type: "string",
  timestamp: "uint256",
};

export const distanceAttestationSolidityTypeMap: Record<string, string> = {
  objectId1: "uint256",
  objectId2: "uint256",
  object1Location: "bytes32",
  object2Location: "bytes32",
  distanceSquaredMeters: "uint256",
  timeThreshold: "uint256",
  pod_data_type: "string",
  timestamp: "uint256",
};

export const SOLIDITY_TYPE_MAPS_BY_POD_TYPE: Record<string, Record<string, string>> = {
  "evefrontier.distance_attestation": distanceAttestationSolidityTypeMap,
  "evefrontier.location_attestation": locationAttestationSolidityTypeMap,
  // Add other mappings here as new POD types are defined
}; 