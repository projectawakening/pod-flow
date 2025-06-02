// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20;

import { System } from "@latticexyz/world/src/System.sol";

import { Ship } from "../codegen/index.sol";

contract ShipSystem is System {

  function setInteractionDistance(uint256 smartObjectId, uint256 interactionDistance) public {
    Ship.setInteractionDistance(smartObjectId, interactionDistance);
  }
}