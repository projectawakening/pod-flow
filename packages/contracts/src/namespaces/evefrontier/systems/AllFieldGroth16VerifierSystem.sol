// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20;

import { System } from "@latticexyz/world/src/System.sol";

import { Groth16Verifier } from "../../../verifiers/AllFieldGroth16Verifier.sol";

import { FullVerifyZKProofParams } from "./types.sol";
contract AllFieldGroth16VerifierSystem is Groth16Verifier, System {
    function verifyProof(FullVerifyZKProofParams calldata verifyZKProofParams) public view returns (bool) {
        return super.verifyProof(verifyZKProofParams.pA, verifyZKProofParams.pB, verifyZKProofParams.pC, verifyZKProofParams.pubSignals);
     }
 }