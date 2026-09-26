// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    INativeResolver,
    INativeRegistry,
    IVerifiableFactory,
    ICurrentResolver,
    NativeGrant
} from "./interfaces/INativeENS.sol";
import {IServiceRegistrar} from "./interfaces/IServiceRegistrar.sol";
import {ENSDeployment} from "./libraries/ENSDeployment.sol";
import {ENSRoles} from "./libraries/ENSRoles.sol";

/// @title ENS402 native service registrar
/// @notice Free testnet service registration. Native ENS enforces record permissions.
/// @dev Grant this contract only ROLE_REGISTRAR on a dedicated native subregistry.
///      The parent registry's administrators retain their native override powers.
///      Current deployments publish holder-derived schema v3; the compatibility payTo input
///      must equal the caller. Legacy deployments publish explicit-recipient schema v2.
///      This contract does not prove payment-chain control or settle tokens; clients verify that.
contract ServiceRegistrar is IServiceRegistrar {
    /// @inheritdoc IServiceRegistrar
    uint256 public constant override MIN_COMMITMENT_AGE = 60;
    /// @inheritdoc IServiceRegistrar
    uint256 public constant override MAX_COMMITMENT_AGE = 1 days;
    /// @inheritdoc IServiceRegistrar
    INativeRegistry public immutable override registry;
    /// @inheritdoc IServiceRegistrar
    IVerifiableFactory public immutable override factory;
    /// @inheritdoc IServiceRegistrar
    address public immutable override resolverImplementation;
    /// @inheritdoc IServiceRegistrar
    bytes32 public immutable override parentNode;
    /// @inheritdoc IServiceRegistrar
    bool public immutable override currentResolver;
    /// @inheritdoc IServiceRegistrar
    uint64 public immutable override registrationExpiry;
    /// @inheritdoc IServiceRegistrar
    bytes public override parentDNS;
    /// @inheritdoc IServiceRegistrar
    mapping(bytes32 => uint256) public override commitments;
    bool private registrationEntered;

    /// @notice Configure an immutable Sepolia registration entry point.
    /// @dev Validates pinned native deployment implementations. Does not grant registry permissions.
    /// @param registry_ Native registry where services will be registered.
    /// @param factory_ Pinned native verifiable proxy factory.
    /// @param implementation_ Pinned native PermissionedResolver implementation.
    /// @param parentDNS_ DNS wire-encoded parent name; operators must verify its registry binding.
    /// @param expiry_ Fixed Unix expiry, in the future and at most 365 days from deployment.
    constructor(address registry_, address factory_, address implementation_, bytes memory parentDNS_, uint64 expiry_) {
        if (
            block.chainid != 11155111 || registry_.code.length == 0 || factory_.code.length == 0
                || implementation_.code.length == 0 || expiry_ <= block.timestamp
                || expiry_ > block.timestamp + 365 days
        ) revert InvalidConfiguration();
        registry = INativeRegistry(registry_);
        factory = IVerifiableFactory(factory_);
        resolverImplementation = implementation_;
        currentResolver = ENSDeployment.validate(registry_, factory_, implementation_);
        parentNode = _namehash(parentDNS_, 0);
        parentDNS = parentDNS_;
        registrationExpiry = expiry_;
    }

    /// @inheritdoc IServiceRegistrar
    function makeCommitment(Service calldata service, address owner, bytes32 secret)
        public
        view
        override
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), owner, service, secret));
    }

    /// @inheritdoc IServiceRegistrar
    function commit(bytes32 commitment) external override {
        if (commitment == bytes32(0)) revert InvalidConfiguration();
        if (commitments[commitment] != 0 && block.timestamp <= commitments[commitment] + MAX_COMMITMENT_AGE) {
            revert CommitmentExists();
        }
        commitments[commitment] = block.timestamp;
        emit CommitmentMade(commitment, msg.sender);
    }

    /// @inheritdoc IServiceRegistrar
    function register(Service calldata service, bytes32 secret)
        external
        override
        returns (address resolverAddress, uint256 tokenId)
    {
        if (registrationEntered) revert ReentrantCall();
        _authorizeRegistration(msg.sender);
        registrationEntered = true;
        if (block.timestamp >= registrationExpiry) revert RegistrationExpired();
        _validate(service, msg.sender);
        if (currentResolver && service.payTo != msg.sender) revert InvalidRecord();
        bytes32 commitment = makeCommitment(service, msg.sender, secret);
        _consumeCommitment(commitment);
        bytes32 node = keccak256(abi.encodePacked(parentNode, keccak256(bytes(service.label))));
        bytes memory dns = abi.encodePacked(uint8(bytes(service.label).length), service.label, parentDNS);
        resolverAddress = _configureResolver(service, commitment, node, dns);
        // Publish last. Failure reverts resolver creation, records and commitment consumption together.
        tokenId = registry.register(
            service.label,
            msg.sender,
            address(0),
            resolverAddress,
            ENSRoles.ROLE_SET_RESOLVER | ENSRoles.ROLE_SET_RESOLVER_ADMIN | ENSRoles.ROLE_CAN_TRANSFER_ADMIN,
            registrationExpiry
        );
        emit ServiceRegistered(node, msg.sender, resolverAddress, tokenId, service.label);
        registrationEntered = false;
    }

    /// @dev Open registrars require a prior commitment. Permissioned variants may omit this delay.
    function _consumeCommitment(bytes32 commitment) internal virtual {
        uint256 committedAt = commitments[commitment];
        if (
            committedAt == 0 || block.timestamp < committedAt + MIN_COMMITMENT_AGE
                || block.timestamp > committedAt + MAX_COMMITMENT_AGE
        ) revert CommitmentNotReady();
        delete commitments[commitment];
    }

    /// @dev Open registration by default. Provider-specific subclasses may check native authority.
    /// @param caller Account revealing the commitment and receiving service ownership.
    function _authorizeRegistration(address caller) internal view virtual {}

    /// @dev Create one native resolver per service and relinquish temporary bootstrap authority.
    function _configureResolver(Service calldata service, bytes32 commitment, bytes32 node, bytes memory dns)
        internal
        virtual
        returns (address resolverAddress)
    {
        uint256 temporaryRoles = ENSRoles.ROLE_SET_TEXT | ENSRoles.ROLE_SET_TEXT_ADMIN;
        bytes memory initialization;
        if (currentResolver) {
            NativeGrant[] memory grants = new NativeGrant[](1);
            grants[0] = NativeGrant(address(this), temporaryRoles);
            initialization = abi.encodeCall(ICurrentResolver.initialize, (grants, new bytes[](0)));
        } else {
            initialization = abi.encodeCall(INativeResolver.initialize, (address(this), temporaryRoles, new bytes[](0)));
        }
        resolverAddress = factory.deployProxy(resolverImplementation, uint256(commitment), initialization);
        string memory payment = _paymentRecord(service);
        if (currentResolver) {
            ICurrentResolver resolver = ICurrentResolver(resolverAddress);
            resolver.setText(dns, "agent-endpoint[x402]", service.endpoint);
            resolver.setText(dns, "ens402.payment", payment);
            resolver.setText(dns, "ens402.status", "active");
            resolver.setText(dns, "description", service.description);
            resolver.setText(dns, "avatar", service.picture);
            resolver.setText(dns, "ens402.call", service.callConfig);
            resolver.grantSetterRoles(
                abi.encodeCall(ICurrentResolver.setText, (dns, "ens402.call", "")), service.endpointOperator
            );
            resolver.grantSetterRoles(
                abi.encodeCall(ICurrentResolver.setText, (dns, "description", "")), service.endpointOperator
            );
            resolver.grantSetterRoles(
                abi.encodeCall(ICurrentResolver.setText, (dns, "avatar", "")), service.endpointOperator
            );
            resolver.grantSetterRoles(
                abi.encodeCall(ICurrentResolver.setText, (dns, "agent-endpoint[x402]", "")), service.endpointOperator
            );
            resolver.grantSetterRoles(
                abi.encodeCall(ICurrentResolver.setText, (dns, "ens402.payment", "")), service.treasury
            );
        } else {
            INativeResolver resolver = INativeResolver(resolverAddress);
            resolver.setText(node, "agent-endpoint[x402]", service.endpoint);
            resolver.setText(node, "ens402.payment", payment);
            resolver.setText(node, "ens402.status", "active");
            resolver.setText(node, "description", service.description);
            resolver.setText(node, "avatar", service.picture);
            resolver.setText(node, "ens402.call", service.callConfig);
            resolver.authorizeTextRoles(dns, "ens402.call", service.endpointOperator, true);
            resolver.authorizeTextRoles(dns, "description", service.endpointOperator, true);
            resolver.authorizeTextRoles(dns, "avatar", service.endpointOperator, true);
            resolver.authorizeTextRoles(dns, "agent-endpoint[x402]", service.endpointOperator, true);
            resolver.authorizeTextRoles(dns, "ens402.payment", service.treasury, true);
        }
        INativeResolver(resolverAddress).grantRootRoles(temporaryRoles, msg.sender);
        INativeResolver(resolverAddress).revokeRootRoles(temporaryRoles, address(this));
    }

    /// @dev Serialize fixed-price payment terms in Base Sepolia USDC atomic units (6 decimals).
    ///      Current v3 omits payTo; consumers derive it from live name ownership and verify
    ///      destination control. Legacy v2 preserves its explicit-recipient compatibility path.
    /// @param service Validated registration fields bound by the commitment.
    /// @return Serialized ENS402 application payment record, not an official ENS standard.
    function _paymentRecord(Service calldata service) internal view returns (string memory) {
        if (currentResolver) {
            return string.concat(
                '{"version":3,"recipient":"name-owner","scheme":"exact","network":"eip155:84532","asset":"0x036cbd53842c5426634e7929541ec2318f3dcf7e","pricing":{"model":"fixed","amount":"',
                _uintString(service.price),
                '","unit":"request"}}'
            );
        }
        return string.concat(
            '{"version":2,"scheme":"exact","network":"eip155:84532","asset":"0x036cbd53842c5426634e7929541ec2318f3dcf7e","payTo":"',
            _address(service.payTo),
            '","pricing":{"model":"fixed","amount":"',
            _uintString(service.price),
            '","unit":"request"}}'
        );
    }

    /// @dev Validate byte bounds and delegate separation; URL reachability is a client concern.
    function _validate(Service calldata service, address admin) internal view virtual {
        bytes memory label = bytes(service.label);
        if (label.length < 3 || label.length > 32 || label[0] == "-" || label[label.length - 1] == "-") {
            revert InvalidLabel();
        }
        for (uint256 i; i < label.length; ++i) {
            bytes1 c = label[i];
            if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-")) revert InvalidLabel();
        }
        bytes memory endpoint = bytes(service.endpoint);
        if (
            endpoint.length < 9 || endpoint.length > 2048 || bytes8(endpoint) != bytes8("https://")
                || bytes(service.callConfig).length == 0 || bytes(service.callConfig).length > 16384
                || service.payTo == address(0) || service.endpointOperator == address(0)
                || service.treasury == address(0) || service.endpointOperator == service.treasury
                || service.endpointOperator == admin || service.price == 0 || bytes(service.description).length == 0
                || bytes(service.description).length > 1024 || bytes(service.picture).length > 2048
                || (bytes(service.picture).length > 0
                    && (bytes(service.picture).length < 9 || bytes8(bytes(service.picture)) != bytes8("https://")))
        ) revert InvalidRecord();
        // URL syntax, DNS, HTTP and payment semantics are independently checked by consuming clients.
    }

    /// @dev Hash a bounded DNS wire name, rejecting compression and trailing bytes.
    function _namehash(bytes memory dns, uint256 offset) private pure returns (bytes32) {
        if (dns.length < 2 || dns.length > 255 || offset >= dns.length) revert InvalidConfiguration();
        uint256 length = uint8(dns[offset]);
        if (length == 0) {
            if (offset != dns.length - 1) revert InvalidConfiguration();
            return bytes32(0);
        }
        if (length > 63 || offset + 1 + length >= dns.length) revert InvalidConfiguration();
        bytes32 label;
        assembly ("memory-safe") { label := keccak256(add(add(dns, 33), offset), length) }
        return keccak256(abi.encodePacked(_namehash(dns, offset + length + 1), label));
    }

    /// @dev Encode an atomic amount without floating point or decimal scaling.
    function _uintString(uint256 value) private pure returns (string memory) {
        uint256 digits;
        uint256 remaining = value;
        do {
            ++digits;
            remaining /= 10;
        } while (remaining != 0);
        bytes memory output = new bytes(digits);
        do {
            output[--digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        } while (digits != 0);
        return string(output);
    }

    /// @dev Encode a lowercase, 0x-prefixed address for the payment JSON record.
    function _address(address account) private pure returns (string memory) {
        bytes16 alphabet = "0123456789abcdef";
        bytes memory output = new bytes(42);
        output[0] = "0";
        output[1] = "x";
        uint160 value = uint160(account);
        for (uint256 i; i < 40; ++i) {
            output[41 - i] = alphabet[(value >> (4 * i)) & 15];
        }
        return string(output);
    }
}
