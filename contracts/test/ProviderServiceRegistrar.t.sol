// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ServiceRegistrar} from "../src/ServiceRegistrar.sol";
import {ProviderServiceRegistrar} from "../src/ProviderServiceRegistrar.sol";
import {IServiceRegistrar} from "../src/interfaces/IServiceRegistrar.sol";
import {INativeRegistry, ICurrentRegistry, IVerifiableFactory, NativeGrant} from "../src/interfaces/INativeENS.sol";
import {ENSRoles} from "../src/libraries/ENSRoles.sol";
import {Vm} from "./NativeENS.t.sol";

/// @notice Fork regression coverage for native provider publication authority at reveal time.
contract ProviderServiceRegistrarTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    IVerifiableFactory constant factory = IVerifiableFactory(0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C);
    address constant registryImpl = 0xA80338aAA8D23831cEa25E858D1774534aBb0263;
    address constant resolverImpl = 0x14F09Fd05d4585759e54844DC9B00147131Cf243;
    address constant providerAdmin = address(0xA1);
    address constant publisher = address(0xB1);
    address constant outsider = address(0xC1);
    bytes32 constant secret = keccak256("provider-publication");
    INativeRegistry registry;
    ProviderServiceRegistrar registrar;
    uint64 expiry;
    address paymentOwner;

    function _registry(uint256 salt, address admin) internal returns (INativeRegistry) {
        NativeGrant[] memory grants = new NativeGrant[](1);
        grants[0] = NativeGrant(admin, ENSRoles.ROLE_REGISTRAR | (ENSRoles.ROLE_REGISTRAR << 128));
        return
            INativeRegistry(
                factory.deployProxy(registryImpl, salt, abi.encodeCall(ICurrentRegistry.initialize, (grants)))
            );
    }

    function setUp() public {
        vm.createSelectFork(vm.envOr("ENS_FORK_RPC_URL", "https://sepolia.gateway.tenderly.co"), 11783987);
        expiry = uint64(block.timestamp + 30 days);
        registry = _registry(801, providerAdmin);
        registrar = new ProviderServiceRegistrar(
            address(registry), address(factory), resolverImpl, hex"05616c70686106656e733430320365746800", expiry
        );
        vm.prank(providerAdmin);
        registry.grantRootRoles(ENSRoles.ROLE_REGISTRAR, address(registrar));
    }

    function _service() internal view returns (IServiceRegistrar.Service memory) {
        return IServiceRegistrar.Service(
            "weather",
            "https://weather.example/api",
            paymentOwner,
            address(0xE1),
            address(0xF1),
            "Weather forecast",
            "",
            10000,
            '{"method":"GET"}'
        );
    }

    function _commit(IServiceRegistrar api, address owner) internal returns (bytes32 commitment) {
        paymentOwner = owner;
        commitment = api.makeCommitment(_service(), owner, secret);
        api.commit(commitment);
        vm.warp(block.timestamp + api.MIN_COMMITMENT_AGE());
    }

    function testValidCommitmentDoesNotAuthorizeArbitraryPublisher() public {
        bytes32 commitment = _commit(registrar, outsider);
        vm.expectPartialRevert(ProviderServiceRegistrar.UnauthorizedPublisher.selector);
        vm.prank(outsider);
        registrar.register(_service(), secret);
        require(registrar.commitments(commitment) != 0, "unauthorized reveal consumed commitment");
        require(registry.findOwner("weather") == address(0), "unauthorized publication");
    }

    function testNativeProviderAdminCanPublish() public {
        _commit(registrar, providerAdmin);
        vm.prank(providerAdmin);
        (address resolver,) = registrar.register(_service(), secret);
        require(resolver.code.length > 0, "missing resolver");
        require(registry.findOwner("weather") == providerAdmin, "wrong service owner");
    }

    function testRevocationAfterCommitStopsPublisher() public {
        vm.prank(providerAdmin);
        registry.grantRootRoles(ENSRoles.ROLE_REGISTRAR, publisher);
        bytes32 commitment = _commit(registrar, publisher);
        vm.prank(providerAdmin);
        registry.revokeRootRoles(ENSRoles.ROLE_REGISTRAR, publisher);
        vm.expectPartialRevert(ProviderServiceRegistrar.UnauthorizedPublisher.selector);
        vm.prank(publisher);
        registrar.register(_service(), secret);
        require(registrar.commitments(commitment) != 0, "revoked reveal consumed commitment");
        // Restored live native authority enables the same still-valid reveal.
        vm.prank(providerAdmin);
        registry.grantRootRoles(ENSRoles.ROLE_REGISTRAR, publisher);
        vm.prank(publisher);
        registrar.register(_service(), secret);
        require(registry.findOwner("weather") == publisher, "delegated publisher failed");
    }

    function testAuthorityInAnotherProviderRegistryDoesNotAuthorizePublication() public {
        INativeRegistry otherRegistry = _registry(802, outsider);
        require(address(otherRegistry) != address(registry), "shared registry");
        _commit(registrar, outsider);
        vm.expectPartialRevert(ProviderServiceRegistrar.UnauthorizedPublisher.selector);
        vm.prank(outsider);
        registrar.register(_service(), secret);
    }

    function testOpenBaseRegistrarRemainsPermissionless() public {
        ServiceRegistrar openRegistrar = new ServiceRegistrar(
            address(registry), address(factory), resolverImpl, hex"06656e733430320365746800", expiry
        );
        vm.prank(providerAdmin);
        registry.grantRootRoles(ENSRoles.ROLE_REGISTRAR, address(openRegistrar));
        _commit(openRegistrar, outsider);
        vm.prank(outsider);
        openRegistrar.register(_service(), secret);
        require(registry.findOwner("weather") == outsider, "base registration restricted");
    }
}
