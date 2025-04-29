export interface KillmailVictimOrKiller {
  address: string;
  name: string;
}

export interface Killmail {
  victim: KillmailVictimOrKiller;
  killer: KillmailVictimOrKiller;
  solar_system_id: number; // Note: killmails.json might still use snake_case
  loss_type: string;
  timestamp: number;
}

export interface SolarSystemLocation {
  x: number;
  y: number;
  z: number;
}

// Added: Interface for detailed assembly data from /smartassemblies/{id}
export interface DetailedSmartAssembly {
  id: string;
  itemId: number;
  typeId: number;
  ownerId: string;
  ownerName: string;
  chainId: number;
  name: string;
  description?: string; // Make optional if can be missing
  isOnline: boolean;
  stateId: number;
  state: string;
  solarSystemId: number;
  location: SolarSystemLocation; // Assembly's own location
  fuel?: { // Make optional? Assume it might be missing for some types
    fuelAmount: string; // Keep as string for large numbers
    fuelConsumptionPerMin: number;
    fuelMaxCapacity: string; // Keep as string
    fuelUnitVolume: string; // Keep as string
  };
  assemblyType: string;
  // Rename timestamp field
  timestamp: number;
}

// Modified SolarSystem interface
export interface SolarSystem {
  solarSystemId: number;
  solarSystemName: string;
  location: SolarSystemLocation;
  smartAssemblies: string[]; 
  // Timestamp for when the system state (and assembly list) was checked
  timestamp: number;
}

// Added: Map type for the new assembly details file
export type AssemblyDetailMap = {
  [assemblyId: string]: DetailedSmartAssembly;
};

// Renamed from GameTypeAttribute
export interface ItemTypeAttribute { 
  trait_type: string;
  value: number | string | null;
}

// Renamed from GameType
export interface ItemType { 
  name: string;
  description: string;
  smartItemId: string;
  // Use the renamed attribute type
  attributes: ItemTypeAttribute[]; 
}

// Renamed from GameTypeMap
export type ItemTypeMap = { 
  [typeId: string]: ItemType; // Use the renamed type
}; 