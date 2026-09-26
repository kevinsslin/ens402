// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    INativeResolver,
    INativeRegistry,
    IVerifiableFactory,
    ICurrentResolver,
    NativeGrant
} from "./interfaces/INativeENS.sol";
import {ENSDeployment} from "./libraries/ENSDeployment.sol";
import {ENSRoles} from "./libraries/ENSRoles.sol";

/// @notice Free testnet service registration. Native ENS enforces record permissions.
/// @dev Grant this contract only ROLE_REGISTRAR on a dedicated native subregistry.
///      The parent registry's administrators retain their native override powers.
contract ServiceRegistrar {
    error InvalidConfiguration();
    error InvalidLabel();
    error InvalidRecord();
    error CommitmentNotReady();
    error CommitmentExists();
    error RegistrationExpired();
    error ReentrantCall();

    uint256 public constant MIN_COMMITMENT_AGE = 60;
    uint256 public constant MAX_COMMITMENT_AGE = 1 days;
    INativeRegistry public immutable registry;
    IVerifiableFactory public immutable factory;
    address public immutable resolverImplementation;
    bytes32 public immutable parentNode;
    bool public immutable currentResolver;
    uint64 public immutable registrationExpiry;
    bytes public parentDNS;
    mapping(bytes32 => uint256) public commitments;
    bool private entered;

    struct Service {
        string label;
        string endpoint;
        address payTo;
        address endpointOperator;
        address treasury;
        string description;
        string picture;
        uint256 price;
    }
    event ServiceRegistered(
        bytes32 indexed node, address indexed owner, address indexed resolver, uint256 tokenId, string label
    );
    event CommitmentMade(bytes32 indexed commitment, address indexed sender);

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

    /// @dev Binds all settings, chain, registrar and owner. A copied reveal cannot steal the name.
    function makeCommitment(Service calldata service, address owner, bytes32 secret) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), owner, service, secret));
    }

    function commit(bytes32 commitment) external {
        if (commitment == bytes32(0)) revert InvalidConfiguration();
        if (commitments[commitment] != 0 && block.timestamp <= commitments[commitment] + MAX_COMMITMENT_AGE) {
            revert CommitmentExists();
        }
        commitments[commitment] = block.timestamp;
        emit CommitmentMade(commitment, msg.sender);
    }

    function register(Service calldata service, bytes32 secret)
        external
        returns (address resolverAddress, uint256 tokenId)
    {
        if (entered) revert ReentrantCall();
        entered = true;
        if (block.timestamp >= registrationExpiry) revert RegistrationExpired();
        _validate(service, msg.sender);
        bytes32 commitment = makeCommitment(service, msg.sender, secret);
        uint256 committedAt = commitments[commitment];
        if (
            committedAt == 0 || block.timestamp < committedAt + MIN_COMMITMENT_AGE
                || block.timestamp > committedAt + MAX_COMMITMENT_AGE
        ) revert CommitmentNotReady();
        delete commitments[commitment];
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
        entered = false;
    }

    function _configureResolver(Service calldata service, bytes32 commitment, bytes32 node, bytes memory dns)
        private
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
        string memory payment = string.concat(
            '{"version":2,"scheme":"exact","network":"eip155:84532","asset":"0x036cbd53842c5426634e7929541ec2318f3dcf7e","payTo":"',
            _address(service.payTo),
            '","pricing":{"model":"fixed","amount":"',
            _uintString(service.price),
            '","unit":"request"}}'
        );
        if (currentResolver) {
            ICurrentResolver resolver = ICurrentResolver(resolverAddress);
            resolver.setText(dns, "agent-endpoint[x402]", service.endpoint);
            resolver.setText(dns, "ens402.payment", payment);
            resolver.setText(dns, "ens402.status", "active");
            resolver.setText(dns, "description", service.description);
            resolver.setText(dns, "avatar", service.picture);
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
            resolver.authorizeTextRoles(dns, "description", service.endpointOperator, true);
            resolver.authorizeTextRoles(dns, "avatar", service.endpointOperator, true);
            resolver.authorizeTextRoles(dns, "agent-endpoint[x402]", service.endpointOperator, true);
            resolver.authorizeTextRoles(dns, "ens402.payment", service.treasury, true);
        }
        INativeResolver(resolverAddress).grantRootRoles(temporaryRoles, msg.sender);
        INativeResolver(resolverAddress).revokeRootRoles(temporaryRoles, address(this));
    }

    function _validate(Service calldata service, address admin) private pure {
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
                || service.payTo == address(0) || service.endpointOperator == address(0)
                || service.treasury == address(0) || service.endpointOperator == service.treasury
                || service.endpointOperator == admin || service.price == 0 || bytes(service.description).length == 0
                || bytes(service.description).length > 1024 || bytes(service.picture).length > 2048
                || (bytes(service.picture).length > 0
                    && (bytes(service.picture).length < 9 || bytes8(bytes(service.picture)) != bytes8("https://")))
        ) revert InvalidRecord();
        // URL syntax, DNS, HTTP and payment semantics are independently checked by consuming clients.
    }

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
