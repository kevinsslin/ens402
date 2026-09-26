// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IVerifiableFactory} from "../interfaces/INativeENS.sol";

/// @notice Version pins only. Current and legacy resolver ABIs are not interchangeable.
/// @dev Current: 71a3b733. Legacy: 48b3e2d (fork compatibility only).
library ENSDeployment {
    error InvalidConfiguration();

    function validate(address registryAddress, address factoryAddress, address resolverImplementation)
        internal
        view
        returns (bool)
    {
        bytes32 hash = resolverImplementation.codehash;
        bool current = hash == 0x00de223fd76d537e07b24abe5537e3c852e934dbe4db22c02f94a143e4ceeea3;
        if (
            factoryAddress.codehash
                != (current
                        ? bytes32(0x7ccfd46da461cb7145497a383f2a6e6582be057b8bef3de694530b699632ecda)
                        : bytes32(0xaf680a81acf0d38ad5d0aa5fdf461171619788959147b8e193ba311214cedbec))
        ) revert InvalidConfiguration();
        if (!current && hash != 0x4dbadfa3bc41fcd525118b6cf8aab9f4f39de2eb2f770c76c9f7182eb6d10e78) {
            revert InvalidConfiguration();
        }
        if (
            IVerifiableFactory(factoryAddress).verifyContract(registryAddress)
                != (current
                        ? address(0xA80338aAA8D23831cEa25E858D1774534aBb0263)
                        : address(0x840Fa461059862Ea466A711E8C98c8dE732061C0))
        ) revert InvalidConfiguration();
        return current;
    }
}
