// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ServiceRegistrar} from "./ServiceRegistrar.sol";
import {ENSRoles} from "./libraries/ENSRoles.sol";

/// @notice Read-only native EAC surface implemented by the selected ENS UserRegistry.
interface INativeRegistryAccess {
    /// @notice Check effective root roles in this registry, not a caller-supplied namespace.
    /// @param roles Native EAC role bitmap to require.
    /// @param account Account whose live authority is checked.
    /// @return authorized Whether the account holds the requested root roles.
    function hasRootRoles(uint256 roles, address account) external view returns (bool authorized);
}

/// @title ENS402 provider-controlled service registrar
/// @notice Publish services only for callers with native registration authority in this registry.
/// @dev The same native ROLE_REGISTRAR that permits direct registry registration authorizes
///      this convenience flow. No custom publisher list or claimed provider name is trusted.
///      Revocation takes effect at reveal, including for previously committed registrations.
///      The registrar itself also needs native ROLE_REGISTRAR to execute the final registration.
contract ProviderServiceRegistrar is ServiceRegistrar {
    /// @notice The caller lacks native root registration authority in the configured registry.
    /// @param caller Account attempting to publish a service.
    error UnauthorizedPublisher(address caller);

    /// @notice Bind publication to one immutable native provider registry.
    /// @dev Parent-name/registry binding must be verified during deployment as in the base registrar.
    /// @param registry_ Provider's native UserRegistry, also the authorization source.
    /// @param factory_ Pinned native verifiable proxy factory.
    /// @param implementation_ Pinned native PermissionedResolver implementation.
    /// @param parentDNS_ DNS wire-encoded provider name.
    /// @param expiry_ Fixed registration expiry as a Unix timestamp.
    constructor(address registry_, address factory_, address implementation_, bytes memory parentDNS_, uint64 expiry_)
        ServiceRegistrar(registry_, factory_, implementation_, parentDNS_, expiry_)
    {}

    /// @dev Consult the immutable selected registry on every reveal; commitments confer no authority.
    /// @param caller Account revealing a service registration.
    function _authorizeRegistration(address caller) internal view override {
        if (!INativeRegistryAccess(address(registry)).hasRootRoles(ENSRoles.ROLE_REGISTRAR, caller)) {
            revert UnauthorizedPublisher(caller);
        }
    }
}
