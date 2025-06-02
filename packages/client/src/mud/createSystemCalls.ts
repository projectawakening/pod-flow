/*
 * Create the system calls that the client can use to ask
 * for changes in the World state (using the System contracts).
 */

import { Hex } from "viem";
import { SetupNetworkResult } from "./setupNetwork.js";

// Based on packages/contracts/src/namespaces/evefrontier/systems/types.sol
export interface InventoryItemParams {
  smartObjectId: bigint; // uint256
  quantity: bigint;      // uint256
}

export interface VerifyZKProofParams {
  pA: [bigint, bigint];         // uint256[2]
  pB: [[bigint, bigint], [bigint, bigint]]; // uint256[2][2]
  pC: [bigint, bigint];         // uint256[2]
  pubSignals: bigint[];       // uint256[17] - adjust array size if different in JS
}

export interface MultiProofVerifyParams {
  proof: Hex[];       // bytes32[]
  proofFlags: boolean[]; // bool[]
  root: Hex;          // bytes32
  leaves: Hex[];      // bytes32[]
  leafFieldMap: Hex[];// bytes32[]
}

export interface DistanceAttestationParams {
  object1Id: bigint;             // uint256
  object2Id: bigint;             // uint256
  distanceSquaredMeters: bigint; // uint256
  timestamp: bigint;             // uint256
  timeThreshold: bigint;         // uint256
}

export type SystemCalls = ReturnType<typeof createSystemCalls>;

export function createSystemCalls(
  /*
   * The parameter list informs TypeScript that:
   *
   * - The first parameter is expected to be a
   *   SetupNetworkResult, as defined in setupNetwork.ts
   *
   *   Out of this parameter, we only care about two fields:
   *   - worldContract (which comes from getContract, see
   *     https://github.com/latticexyz/mud/blob/main/templates/react/packages/client/src/mud/setupNetwork.ts#L63-L69).
   *
   *   - waitForTransaction (which comes from syncToRecs, see
   *     https://github.com/latticexyz/mud/blob/main/templates/react/packages/client/src/mud/setupNetwork.ts#L77-L83).
   *
   * - From the second parameter, which is a ClientComponent,
   *   we only care about Counter. This parameter comes to use
   *   through createClientComponents.ts, but it originates in
   *   syncToRecs
   *   (https://github.com/latticexyz/mud/blob/main/templates/react/packages/client/src/mud/setupNetwork.ts#L77-L83).
   */
  { tables, useStore, worldContract, waitForTransaction }: SetupNetworkResult,
) {
  const setInteractionDistance = async (smartObjectId: bigint, interactionDistance: bigint) => {
    const tx = await worldContract.write.evefrontier__setInteractionDistance([smartObjectId, interactionDistance]);
    await waitForTransaction(tx);
  };

  const depositInventory = async (smartObjectId: bigint, items: InventoryItemParams[]) => {
    const tx = await worldContract.write.evefrontier__depositInventory([smartObjectId, items]);
    await waitForTransaction(tx);
  };

  const transferToInventory = async (
    smartObjectId: bigint,
    toObjectId: bigint,
    items: InventoryItemParams[],
    verifyZKProofParams: VerifyZKProofParams,
    multiProofVerifyParams: MultiProofVerifyParams,
    distanceAttestationParams: DistanceAttestationParams
  ) => {
    const tx = await worldContract.write.evefrontier__transferToInventory([
      smartObjectId,
      toObjectId,
      items,
      verifyZKProofParams,
      multiProofVerifyParams,
      distanceAttestationParams
    ]);
    await waitForTransaction(tx);
  };

  const withdrawInventory = async (smartObjectId: bigint, items: InventoryItemParams[]) => {
    const tx = await worldContract.write.evefrontier__withdrawInventory([smartObjectId, items]);
    await waitForTransaction(tx);
  };

  return {
    setInteractionDistance,
    depositInventory,
    transferToInventory,
    withdrawInventory,
  };
}
