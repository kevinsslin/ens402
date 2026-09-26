// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Interfaces for the pinned ENSv2 Sepolia deployment. ENS contracts enforce roles.
interface INativeResolver {
    function initialize(address rootAccount, uint256 roleBitmap, bytes[] calldata data) external;
    function authorizeTextRoles(bytes calldata name, string calldata key, address operator, bool grant)
        external
        returns (bool);
    function setText(bytes32 node, string calldata key, string calldata value) external;
    function text(bytes32 node, string calldata key) external view returns (string memory);
    function grantRootRoles(uint256 roles, address account) external returns (bool);
    function revokeRootRoles(uint256 roles, address account) external returns (bool);
    function hasRootRoles(uint256 roles, address account) external view returns (bool);
    function setAlias(bytes calldata fromName, bytes calldata toName) external;
    function upgradeToAndCall(address implementation, bytes calldata data) external;
}

interface INativeRegistry {
    function initialize(address rootAccount, uint256 roleBitmap) external;
    function register(
        string calldata label,
        address owner,
        address subregistry,
        address resolver,
        uint256 roles,
        uint64 expiry
    ) external returns (uint256);
    function setResolver(uint256 tokenId, address resolver) external;
    function setSubregistry(uint256 tokenId, address registry) external;
    function findOwner(string calldata label) external view returns (address);
    function grantRootRoles(uint256 roles, address account) external returns (bool);
    function revokeRootRoles(uint256 roles, address account) external returns (bool);
}

interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes calldata data) external returns (address);
    function verifyContract(address proxy) external view returns (address);
}

interface IUniversalResolverV2 {
    function findResolver(bytes calldata name) external view returns (address, bytes32, uint256);
    function findOwner(bytes calldata name) external view returns (address);
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory, address);
}

struct NativeGrant {
    address account;
    uint256 roleBitmap;
}

interface ICurrentResolver {
    function initialize(NativeGrant[] calldata grants, bytes[] calldata calls) external;
    function setText(bytes calldata name, string calldata key, string calldata value) external;
    function grantSetterRoles(bytes calldata setter, address account) external returns (bool);
    function getRecordId(bytes32 node) external view returns (uint256);
    function getRecordCount() external view returns (uint256);
    function grantRootRoles(uint256 roles, address account) external returns (bool);
    function revokeRootRoles(uint256 roles, address account) external returns (bool);
}

interface ICurrentRegistry {
    function initialize(NativeGrant[] calldata grants) external;
}
