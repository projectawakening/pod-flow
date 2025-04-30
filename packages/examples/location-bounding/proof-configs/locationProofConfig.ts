// NOTE: The import for GPC types needs to be fixed based on your project structure.
import { GPCProofConfig /*, GPCProofEntryBoundsCheckConfig, GPCProofEntryInequalityConfig */ } from "@pcd/gpc";

// Constants/Checks are now directly within the entry config

// Define POD integer range constants (as defined in @pcd/pod)
const POD_INT_MIN = -(1n << 63n);
const POD_INT_MAX = (1n << 63n) - 1n;

// Define the GPC Proof Configuration for Distance Verification
export const locationProofConfig : GPCProofConfig = {
  pods: {
    // 1. Object POD (The object being interacted with, e.g., an assembly)
    object: {
      // issuerPublicKeyHex: null, // Not supported in v0.4.0 GPCProofObjectConfig
      entries: {
        // --- Revealed Entries ---
        assemblyId: { isRevealed: true }, // Reveal to check against distance assertion
        timestamp: {
          isRevealed: false // Reveal for context - Time bounds check not supported in v0.4.0
          // maxTimeDeltaSeconds: 10 // Not supported in v0.4.0
        },
        // --- Constrained Entries ---
        pod_data_type: { 
          isRevealed: true // equalsConstant not supported in v0.4.0, reveal status may be irrelevant now
          // equalsConstant: "evefrontier.smart_assembly" // Not supported in v0.4.0
        }, 
        solarSystemId: { // Ensure object and ship are in the same system
          isRevealed: false, // Do not reveal the solar system ID
          equalsEntry: "ship.solarSystemId" as `${string}.${string}` // Constraint: object.solarSystemId === ship.solarSystemId (v0.4.0 style)
        },
        // --- Private Entries (Not revealed, not constrained beyond signature) ---
        location_x_high: { isRevealed: false },
        location_x_low: { isRevealed: false },
        location_y_high: { isRevealed: false },
        location_y_low: { isRevealed: false },
        location_z_high: { isRevealed: false },
        location_z_low: { isRevealed: false },
        // Add other assembly fields as needed, keeping them private unless required
      }
    },

    // 2. Ship POD (The entity interacting)
    ship: {
      // issuerPublicKeyHex: null, // Not supported in v0.4.0 GPCProofObjectConfig
      entries: {
        // --- Revealed Entries ---
        shipId: { isRevealed: true }, // Reveal to check against distance assertion
        interactionDistance: { 
          isRevealed: true, // Reveal to use in distance comparison (Target for inequality)
          inRange: { min: 0n, max: POD_INT_MAX } // Added bounds check
        }, 
        timestamp: {
          isRevealed: false // Reveal for context - Time bounds check not supported in v0.4.0
          // maxTimeDeltaSeconds: 10 // Not supported in v0.4.0
    },
        // --- Constrained Entries ---
        pod_data_type: { 
          isRevealed: true // equalsConstant not supported in v0.4.0, reveal status may be irrelevant now
          // equalsConstant: "evefrontier.ship_location" // Not supported in v0.4.0
        }, 
        solarSystemId: { // Referenced by object.solarSystemId constraint
          isRevealed: false // Do not reveal the system ID
        },
        // --- Private Entries ---
        location_x_high: { isRevealed: false },
        location_x_low: { isRevealed: false },
        location_y_high: { isRevealed: false },
        location_y_low: { isRevealed: false },
        location_z_high: { isRevealed: false },
        location_z_low: { isRevealed: false },
      }
    },

    // 3. Distance Assertion POD
    distance: {
      // issuerPublicKeyHex: null, // Not supported in v0.4.0 GPCProofObjectConfig
      entries: {
        // --- Revealed & Constrained Entries ---
        distanceSquaredMeters: {
          isRevealed: true,
          lessThanEq: "ship.interactionDistance" as `${string}.${string}`, // Assert: distanceSquaredMeters <= ship.interactionDistance (Corrected for v0.4.0)
          inRange: { min: 0n, max: POD_INT_MAX } // Added bounds check (non-negative and within int range)
        },
        objectId: {
          isRevealed: true,
          equalsEntry: "object.assemblyId" as `${string}.${string}` // Ensure this distance assertion is for the correct object (v0.4.0 style)
        },
        shipId: {
          isRevealed: true,
          equalsEntry: "ship.shipId" as `${string}.${string}` // Ensure this distance assertion is for the correct ship (v0.4.0 style)
        },
        timestamp: {
          isRevealed: false // Reveal the assertion timestamp - Time bounds check not supported in v0.4.0
          // maxTimeDeltaSeconds: 10 // Not supported in v0.4.0
        },
        // --- Constrained Entries ---
        // Assuming the distance POD has this type, adjust if necessary
        pod_data_type: { 
          isRevealed: true // equalsConstant not supported in v0.4.0, reveal status may be irrelevant now
          // equalsConstant: "evefrontier.distance_assertion" // v0.4.0 style
        }
      }
    }
  }
};
