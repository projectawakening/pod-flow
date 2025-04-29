
pragma circom 2.1.8;

// Include using the relative path from the wrapper's location
include "../../node_modules/@pcd/gpcircuits/circuits/proto-pod-gpc.circom"; 

component main { public [ entryObjectIndex, entryNameHash, entryIsValueHashRevealed, virtualEntryIsValueHashRevealed, entryEqualToOtherEntryByIndex, entryIsEqualToOtherEntry, ownerExternalNullifier, ownerV3EntryIndex, ownerV3IsNullifierHashRevealed, ownerV4EntryIndex, ownerV4IsNullifierHashRevealed, numericValueEntryIndices, numericValueInRange, numericMinValues, numericMaxValues, entryInequalityValueIndex, entryInequalityOtherValueIndex, entryInequalityIsLessThan, tupleIndices, listComparisonValueIndex, listContainsComparisonValue, listValidValues, requireUniqueContentIDs, globalWatermark ] } = // Original public signals list
    ProtoPODGPC(1, 11, 5, 0, 0, 0, 0, 0, 0, 0, 0);
