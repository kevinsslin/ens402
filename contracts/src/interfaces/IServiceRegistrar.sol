// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {INativeRegistry, IVerifiableFactory} from "./INativeENS.sol";

/// @title ENS402 service registration API
/// @notice Commits and registers fixed-price x402 services in a native ENS registry.
/// @dev Application registration glue, not a replacement for native ENS EAC.
///      Prices are Base Sepolia USDC atomic units (6 decimals). Expiry is a Unix timestamp.
interface IServiceRegistrar {
    /// @notice Deployment, DNS name or commitment configuration is invalid.
    error InvalidConfiguration();
    /// @notice The label violates the registrar's lowercase ASCII label policy.
    error InvalidLabel();
    /// @notice Service fields or delegate separation violate registration policy.
    error InvalidRecord();
    /// @notice The bound commitment is missing, too young or too old.
    error CommitmentNotReady();
    /// @notice An unexpired commitment with this hash already exists.
    error CommitmentExists();
    /// @notice The registrar's fixed registration expiry has been reached.
    error RegistrationExpired();
    /// @notice A registration attempted to reenter the registrar.
    error ReentrantCall();

    /// @notice Initial service metadata and delegates, bound into the commitment.
    /// @dev Name owner is the registering caller. Isolated mode also makes it resolver Admin;
    ///      shared mode retains provider resolver governance without granting caller root rights.
    struct Service {
        /// @dev One lowercase ASCII label, 3 to 32 bytes, with no leading/trailing hyphen.
        string label;
        /// @dev HTTPS endpoint, 9 to 2048 bytes. Clients separately validate URL semantics.
        string endpoint;
        /// @dev Current deployment: must equal caller as initial name-owner confirmation; omitted from stored v3 terms.
        ///      Legacy deployment: explicit nonzero payment recipient. Never the Treasury writer by implication.
        address payTo;
        /// @dev Ops delegate: endpoint, description, avatar and call-schema writes. Must differ from Admin and Treasury.
        address endpointOperator;
        /// @dev Nonzero payment-record delegate. May also be Admin or payTo.
        address treasury;
        /// @dev Public UTF-8 description, 1 to 1024 bytes, not characters.
        string description;
        /// @dev Optional HTTPS avatar URL, at most 2048 bytes.
        string picture;
        /// @dev Nonzero fixed USDC amount per request in atomic units: 10000 = 0.01 USDC.
        uint256 price;
        /// @dev Explicit JSON method/input metadata for ens402.call, 1 to 16384 bytes; clients validate JSON.
        string callConfig;
    }

    /// @notice A fully initialized service was published in the native registry.
    /// @param node ENS namehash of the service.
    /// @param owner Initial name owner; resolver administration depends on isolated or shared mode.
    /// @param resolver Native PermissionedResolver instance, dedicated or shared by provider policy.
    /// @param tokenId Native registry token identifier.
    /// @param label Registered label below this registrar's parent name.
    event ServiceRegistered(
        bytes32 indexed node, address indexed owner, address indexed resolver, uint256 tokenId, string label
    );

    /// @notice A commitment was recorded; sender need not be its bound owner.
    /// @param commitment Hash returned by makeCommitment.
    /// @param sender Account submitting the commitment.
    event CommitmentMade(bytes32 indexed commitment, address indexed sender);

    /// @notice Minimum reveal delay in seconds, inclusive.
    /// @return Minimum age in seconds.
    function MIN_COMMITMENT_AGE() external view returns (uint256);
    /// @notice Maximum reveal age in seconds, inclusive.
    /// @return Maximum age in seconds.
    function MAX_COMMITMENT_AGE() external view returns (uint256);
    /// @notice Native registry where this registrar needs ROLE_REGISTRAR.
    /// @return Native registry interface.
    function registry() external view returns (INativeRegistry);
    /// @notice Pinned native factory used to create dedicated resolver proxies.
    /// @return Native factory interface.
    function factory() external view returns (IVerifiableFactory);
    /// @notice Pinned native resolver implementation.
    /// @return Resolver implementation address.
    function resolverImplementation() external view returns (address);
    /// @notice ENS namehash of the parent name.
    /// @return Parent namehash.
    function parentNode() external view returns (bytes32);
    /// @notice Whether the pinned resolver uses the current DNS-name setter ABI.
    /// @return True for the current DNS-name setter ABI.
    function currentResolver() external view returns (bool);
    /// @notice Fixed Unix expiry shared by registrations, with no registrar renewal function.
    /// @return Expiry timestamp in seconds.
    function registrationExpiry() external view returns (uint64);
    /// @notice DNS wire-encoded parent name with a terminating zero byte.
    /// @return Complete parent DNS wire name.
    function parentDNS() external view returns (bytes memory);
    /// @notice Timestamp for a commitment, or zero when absent or consumed.
    /// @param commitment Hash to inspect.
    /// @return timestamp Unix timestamp when the hash was committed.
    function commitments(bytes32 commitment) external view returns (uint256 timestamp);

    /// @notice Hash registration settings without submitting a transaction.
    /// @dev Binds the chain, registrar, owner, every Service field and secret.
    /// @param service Complete initial service configuration.
    /// @param owner Caller that will submit register and receive the name and resolver administration.
    /// @param secret Unpredictable salt retained privately until reveal.
    /// @return commitment Domain-separated registration commitment.
    function makeCommitment(Service calldata service, address owner, bytes32 secret)
        external
        view
        returns (bytes32 commitment);

    /// @notice Record a nonzero commitment or replace an expired one.
    /// @dev Reverts with CommitmentExists until its maximum age has elapsed.
    /// @param commitment Hash returned by makeCommitment.
    function commit(bytes32 commitment) external;

    /// @notice Reveal, initialize dedicated resolver permissions and publish a service atomically.
    /// @dev Caller becomes name owner and root text Admin. Ops receives four text-key grants;
    ///      Treasury receives the payment-key grant. Key grants span records in a resolver,
    ///      so each service has a dedicated instance. Registrar bootstrap rights are revoked.
    ///      Name transfer does not transfer resolver administration. Parent/registry powers
    ///      remain independent; this API does not promise protection against ancestor changes.
    ///      Reverts for invalid settings, invalid commitment timing, expired registration,
    ///      reentrancy, or any native factory/registry/resolver failure, with all changes rolled back.
    /// @param service Exact configuration committed for msg.sender.
    /// @param secret Salt used in the commitment.
    /// @return resolverAddress Dedicated native resolver holding the initialized records.
    /// @return tokenId Native registry identifier of the new name.
    function register(Service calldata service, bytes32 secret)
        external
        returns (address resolverAddress, uint256 tokenId);
}
