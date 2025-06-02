// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20;

import { System } from "@latticexyz/world/src/System.sol";

import { Groth16VerifierCore } from "../../../verifiers/Groth16VerifierCore.sol";

import { VerifyZKProofParams } from "./types.sol";
contract Groth16VerifierCoreSystem is Groth16VerifierCore, System {
    function verifyProof(VerifyZKProofParams calldata verifyZKProofParams) public view returns (bool) {
        return super.verifyProof(verifyZKProofParams.pA, verifyZKProofParams.pB, verifyZKProofParams.pC, verifyZKProofParams.pubSignals);
     }
 }
