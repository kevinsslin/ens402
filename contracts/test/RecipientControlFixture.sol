// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Test-only ERC-1271 wallet that accepts one exact control-message digest.
/// @dev This is not a Safe or production wallet. It never sends funds.
contract RecipientControlFixture {
    bytes32 public immutable acceptedDigest;

    /// @param digest EIP-191 hash of the exact accepted recipient-control message.
    constructor(bytes32 digest) {
        acceptedDigest = digest;
    }

    /// @notice Return ERC-1271 magic only for the fixture's exact digest and marker.
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        return digest == acceptedDigest
            && keccak256(signature)
                == keccak256(
                    hex"111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111b"
                )
            ? bytes4(0x1626ba7e)
            : bytes4(0xffffffff);
    }

    /// @notice Accept native ENS ERC-1155 ownership in the source-chain fixture.
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return 0xf23a6e61;
    }
}
