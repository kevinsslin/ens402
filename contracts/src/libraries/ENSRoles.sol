// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Role bitmaps for the pinned native ENS deployment. These are not app roles.
library ENSRoles {
    uint256 internal constant REGISTRAR = 1;
    uint256 internal constant SET_TEXT = 1 << 4;
    uint256 internal constant SET_RESOLVER = 1 << 24;
    uint256 internal constant TEXT_ADMIN = SET_TEXT << 128;
    uint256 internal constant CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 internal constant RESOLVER_ADMIN = SET_RESOLVER << 128;
}
