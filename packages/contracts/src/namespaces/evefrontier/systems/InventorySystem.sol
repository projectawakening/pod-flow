// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20;

import { System } from "@latticexyz/world/src/System.sol";

import { InventoryItem, Inventory } from "../codegen/index.sol";

import { InventoryItemParams } from "./types.sol";

contract InventorySystem is System {

  /**
   * @notice Deposit items to the inventory
   * @param smartObjectId The associated smart object id
   * @param items The items to deposit to inventory
   */
  function depositInventory(
    uint256 smartObjectId,
    InventoryItemParams[] calldata items
  ) public { 
    for (uint256 i = 0; i < items.length; i++) {
      if (!InventoryItem.getExists(smartObjectId, items[i].smartObjectId)) {
        uint256 itemIndex = Inventory.lengthItems(smartObjectId);
        Inventory.pushItems(smartObjectId, items[i].smartObjectId);
        InventoryItem.set(smartObjectId, items[i].smartObjectId, true, items[i].quantity, itemIndex);
      } else {
        InventoryItem.setQuantity(smartObjectId, items[i].smartObjectId, InventoryItem.getQuantity(smartObjectId, items[i].smartObjectId) + items[i].quantity);
      }
    }
  }

  /**
   * @notice Withdraw items from the inventory
   * @param smartObjectId The associated smart object id
   * @param items The items to withdraw from the inventory
   */
  function withdrawInventory(
    uint256 smartObjectId,
    InventoryItemParams[] calldata items
  ) public {
    for (uint256 i = 0; i < items.length; i++) {
      if (InventoryItem.getExists(smartObjectId, items[i].smartObjectId) && InventoryItem.getQuantity(smartObjectId, items[i].smartObjectId) >= items[i].quantity) {
        InventoryItem.setQuantity(smartObjectId, items[i].smartObjectId, InventoryItem.getQuantity(smartObjectId, items[i].smartObjectId) - items[i].quantity);
        if (InventoryItem.getQuantity(smartObjectId, items[i].smartObjectId) == 0) {
          uint256 lastItemID = Inventory.getItem(smartObjectId, Inventory.lengthItems(smartObjectId) - 1);
          if(lastItemID != items[i].smartObjectId) {
            uint256 itemIndex = InventoryItem.getIndex(smartObjectId, items[i].smartObjectId);
            Inventory.updateItems(smartObjectId, itemIndex, lastItemID);
            InventoryItem.setIndex(smartObjectId, lastItemID, itemIndex);
          }
          Inventory.popItems(smartObjectId);
          InventoryItem.deleteRecord(smartObjectId, items[i].smartObjectId);
        }
      }
    }
  }
}