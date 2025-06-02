// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20;
import { System } from "@latticexyz/world/src/System.sol";
import { MerkleProof as OpenZeppelinMerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { VerifyParams, MultiProofVerifyParams } from "./types.sol";

contract MerkleProofSystem is System {
  function verify(VerifyParams memory verifyParams) public pure returns (bool) {
    return OpenZeppelinMerkleProof.verify(verifyParams.proof, verifyParams.root, verifyParams.leaf);
  }

  function multiProofVerify(
    MultiProofVerifyParams memory multiProofVerifyParams
  )
    public pure returns (bool) 
  {
    return OpenZeppelinMerkleProof.multiProofVerify(multiProofVerifyParams.proof, multiProofVerifyParams.proofFlags, multiProofVerifyParams.root, multiProofVerifyParams.leaves);
  }



}