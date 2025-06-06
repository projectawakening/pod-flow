// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

/* Autogenerated file. Do not edit manually. */

import { VerifyParams, MultiProofVerifyParams } from "../../namespaces/evefrontier/systems/types.sol";

/**
 * @title IMerkleProofSystem
 * @author MUD (https://mud.dev) by Lattice (https://lattice.xyz)
 * @dev This interface is automatically generated from the corresponding system contract. Do not edit manually.
 */
interface IMerkleProofSystem {
  function evefrontier__verify(VerifyParams memory verifyParams) external pure returns (bool);

  function evefrontier__multiProofVerify(
    MultiProofVerifyParams memory multiProofVerifyParams
  ) external pure returns (bool);
}
