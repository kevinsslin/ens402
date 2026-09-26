// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Role bitmaps for the pinned native ENS deployment. These are not app roles.
library ENSRoles {
    uint256 internal constant ROLE_REGISTRAR = 1;
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;
    uint256 internal constant ROLE_SET_TEXT_ADMIN = ROLE_SET_TEXT << 128;
    uint256 internal constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 internal constant ROLE_SET_RESOLVER_ADMIN = ROLE_SET_RESOLVER << 128;
}
