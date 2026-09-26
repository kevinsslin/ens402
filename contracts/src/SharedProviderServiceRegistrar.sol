// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ENSRoles} from "./libraries/ENSRoles.sol";
import {ProviderServiceRegistrar} from "./ProviderServiceRegistrar.sol";
import {ICurrentResolver} from "./interfaces/INativeENS.sol";

/// @notice Effective native EAC resource permissions used for live delegate validation.
interface ISharedResolverAccess {
    /// @notice Whether an account has requested roles on a resource, including root overrides.
    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool);
}

/// @title ENS402 shared provider resolver registrar
/// @notice Publish separate service record bundles in one provider-controlled native resolver.
/// @dev Provider-wide key grants intentionally span all service bundles. Governance initializes
///      Ops endpoint/description/avatar/call-schema and Treasury payment setter grants separately. This registrar
///      needs persistent setter grants for those five keys and status, but no text-admin/link/upgrade
///      grants. It never gives service registrants root resolver authority. Existing or linked bundles
///      are rejected, including expired names: re-registration requires a separately designed lifecycle.
///      Native name pointer powers remain independent from resolver administration.
contract SharedProviderServiceRegistrar is ProviderServiceRegistrar {
    /// @notice This name already has a resolver bundle, so registration cannot initialize it safely.
    /// @param node Existing service namehash.
    error ExistingRecordBundle(bytes32 node);

    /// @notice Shared native PermissionedResolver for this provider.
    address public immutable sharedResolver;
    /// @notice Initial provider Ops hint; live native rights determine valid delegates.
    address public immutable providerOps;
    /// @notice Initial Treasury Safe hint, independent from payment recipient; native rights may rotate.
    address public immutable treasurySafe;

    /// @notice Bind one native provider registry, shared resolver and configured delegate identities.
    /// @dev Validates factory provenance/current implementation. Operators verify name/registry binding
    ///      and actual governance grants separately. Immutable delegate addresses are initial UI hints;
    ///      live native key permissions accept rotated delegates without registrar redeployment.
    /// @param registry_ Native provider registry used for publication authority.
    /// @param factory_ Pinned native proxy factory.
    /// @param implementation_ Pinned current native resolver implementation.
    /// @param parentDNS_ DNS wire-encoded provider name.
    /// @param expiry_ Fixed Unix expiry for registered service names.
    /// @param sharedResolver_ Existing native resolver owned by provider governance.
    /// @param providerOps_ Nonzero provider Ops identity.
    /// @param treasurySafe_ Nonzero Treasury Safe identity, different from Ops.
    constructor(
        address registry_,
        address factory_,
        address implementation_,
        bytes memory parentDNS_,
        uint64 expiry_,
        address sharedResolver_,
        address providerOps_,
        address treasurySafe_
    ) ProviderServiceRegistrar(registry_, factory_, implementation_, parentDNS_, expiry_) {
        if (
            !currentResolver || sharedResolver_.code.length == 0
                || factory.verifyContract(sharedResolver_) != implementation_ || providerOps_ == address(0)
                || treasurySafe_ == address(0) || providerOps_ == treasurySafe_
        ) revert InvalidConfiguration();
        sharedResolver = sharedResolver_;
        providerOps = providerOps_;
        treasurySafe = treasurySafe_;
    }

    /// @dev Reuse field validation without assuming that a publisher is a separate per-service Admin.
    function _validate(Service calldata service, address) internal view override {
        super._validate(service, address(0));
        ISharedResolverAccess access = ISharedResolverAccess(sharedResolver);
        if (
            !access.hasRoles(
                    uint256(keccak256("agent-endpoint[x402]")), ENSRoles.ROLE_SET_TEXT, service.endpointOperator
                )
                || !access.hasRoles(uint256(keccak256("description")), ENSRoles.ROLE_SET_TEXT, service.endpointOperator)
                || !access.hasRoles(uint256(keccak256("avatar")), ENSRoles.ROLE_SET_TEXT, service.endpointOperator)
                || !access.hasRoles(uint256(keccak256("ens402.call")), ENSRoles.ROLE_SET_TEXT, service.endpointOperator)
                || !access.hasRoles(uint256(keccak256("ens402.payment")), ENSRoles.ROLE_SET_TEXT, service.treasury)
        ) revert InvalidRecord();
    }

    /// @dev Only initialize a new bundle. Registry publication failure rolls back every record write.
    function _configureResolver(Service calldata service, bytes32, bytes32 node, bytes memory dns)
        internal
        override
        returns (address resolverAddress)
    {
        ICurrentResolver resolver = ICurrentResolver(sharedResolver);
        if (resolver.getRecordId(node) != 0) revert ExistingRecordBundle(node);
        resolver.setText(dns, "agent-endpoint[x402]", service.endpoint);
        resolver.setText(dns, "ens402.payment", _paymentRecord(service));
        resolver.setText(dns, "ens402.status", "active");
        resolver.setText(dns, "description", service.description);
        resolver.setText(dns, "avatar", service.picture);
        resolver.setText(dns, "ens402.call", service.callConfig);
        return sharedResolver;
    }
}
