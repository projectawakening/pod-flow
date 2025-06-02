// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20;

import "@openzeppelin/contracts/utils/Strings.sol";

contract StringSignalHash2 {
    
  function calculateStringSignal2(bytes memory signalBytes) public view returns (uint256 signal) {
    assembly {
      let free_mem_ptr := mload(0x40)

      let success_flag := staticcall(
        gas(),                
        0x02, // SHA256 precompile
        add(signalBytes, 0x20), // Pointer to string data
        mload(signalBytes),     // Length of string data
        free_mem_ptr,         // Output buffer
        0x20                  // Expected output length (32 bytes for SHA256)
      )

      switch success_flag
      case 0 { // staticcall failed (success_flag is 0)
        signal := 0
      }
      case 1 { // staticcall succeeded (success_flag is 1)
        let hash_val := mload(free_mem_ptr) // Load the hash result
        let shifted_val := shr(8, hash_val) // Perform the 8-bit right shift
        signal := shifted_val // Assign the shifted hash to 'signal'
      }
      default { // Should not be reached if success_flag is always 0 or 1
        signal := 0
      }
    }
    // Solidity will implicitly return the value of 'signal'
  }

  // common hex string values, converted into string bytes
  function bytes32ToStringBytes2(bytes32 signalValue) public pure returns (bytes memory signalBytes) {    
    string memory signalString = Strings.toHexString(uint256(signalValue));
    signalBytes = bytes(signalString);
    return signalBytes;
  }

  function addressToStringBytes2(address signalValue) public pure returns (bytes memory signalBytes) {
    string memory signalString = Strings.toHexString(uint256(bytes32(bytes20(signalValue))));
    signalBytes = bytes(signalString);
    return signalBytes;
  }
}