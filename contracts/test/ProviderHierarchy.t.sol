// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    INativeRegistry,
    INativeResolver,
    ICurrentRegistry,
    ICurrentResolver,
    IVerifiableFactory,
    IUniversalResolverV2,
    NativeGrant
} from "../src/interfaces/INativeENS.sol";
import {Vm} from "./NativeENS.t.sol";

/// @notice Exercises provider namespace isolation against the pinned Sepolia implementation.
contract ProviderHierarchyTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    IVerifiableFactory constant factory = IVerifiableFactory(0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C);
    address constant registryImpl = 0xA80338aAA8D23831cEa25E858D1774534aBb0263;
    address constant resolverImpl = 0x14F09Fd05d4585759e54844DC9B00147131Cf243;
    address constant providerA = address(0xA1);
    address constant providerB = address(0xB1);
    address constant serviceAdmin = address(0xC1);
    INativeRegistry platform;
    INativeRegistry a;
    INativeRegistry b;
    uint64 expiry;

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return 0xf23a6e61;
    }

    function _registry(uint256 salt, address admin) internal returns (INativeRegistry) {
        NativeGrant[] memory grants = new NativeGrant[](1);
        grants[0] = NativeGrant(admin, 1 | (uint256(1) << 128));
        return
            INativeRegistry(
                factory.deployProxy(registryImpl, salt, abi.encodeCall(ICurrentRegistry.initialize, (grants)))
            );
    }

    function setUp() public {
        vm.createSelectFork(vm.envOr("ENS_FORK_RPC_URL", "https://sepolia.gateway.tenderly.co"), 11783987);
        expiry = uint64(block.timestamp + 30 days);
        platform = _registry(701, address(this));
        a = _registry(702, providerA);
        b = _registry(703, providerB);
        uint256 nameRoles =
            (1 << 16) | (1 << 20) | (1 << 24) | ((uint256(1 << 16) | (1 << 20) | (1 << 24) | (1 << 28)) << 128);
        platform.register("alpha", providerA, address(a), address(0), nameRoles, expiry);
        platform.register("beta", providerB, address(b), address(0), nameRoles, expiry);
        vm.prank(0x84D3a426D4E12E955d1DF95db0B24fe26afE39D3);
        INativeRegistry(0x9703DBD26dAB89504490994138cF2c575251a9cE)
            .register("ens402fork", address(this), address(platform), address(0), 1 << 20, expiry);
    }

    function testProviderCanRegisterOnlyInOwnRegistry() public {
        vm.prank(providerA);
        a.register("weather", serviceAdmin, address(0), address(0), 1 << 24, expiry);
        require(a.findOwner("weather") == serviceAdmin, "service owner");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(providerA);
        b.register("weather", serviceAdmin, address(0), address(0), 1 << 24, expiry);
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(address(this));
        a.register("override", serviceAdmin, address(0), address(0), 1 << 24, expiry);
    }

    function testProviderNamePointerRightsDoNotReachSiblingOrService() public {
        vm.prank(providerA);
        platform.setSubregistry(uint256(keccak256("alpha")), address(a));
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(providerA);
        platform.setSubregistry(uint256(keccak256("beta")), address(a));
        vm.prank(providerA);
        a.register("weather", serviceAdmin, address(0), address(0), 1 << 24, expiry);
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(providerA);
        a.setResolver(uint256(keccak256("weather")), address(0xBAD));
    }

    function testThreeLevelResolutionAndNoImplicitAncestorTextRights() public {
        NativeGrant[] memory grants = new NativeGrant[](1);
        grants[0] = NativeGrant(serviceAdmin, 16 | (uint256(16) << 128));
        address resolver = factory.deployProxy(
            resolverImpl, 704, abi.encodeCall(ICurrentResolver.initialize, (grants, new bytes[](0)))
        );
        bytes memory dns = hex"077765617468657205616c7068610a656e73343032666f726b00";
        vm.prank(serviceAdmin);
        ICurrentResolver(resolver).setText(dns, "description", "Weather service");
        vm.prank(providerA);
        a.register("weather", serviceAdmin, address(0), resolver, 1 << 24, expiry);
        (address found,, uint256 offset) =
            IUniversalResolverV2(0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3).findResolver(dns);
        require(found == resolver && offset == 0, "exact three-level resolution");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(providerA);
        ICurrentResolver(resolver).setText(dns, "description", "provider override");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        ICurrentResolver(resolver).setText(dns, "description", "platform override");
        require(!INativeResolver(resolver).hasRootRoles(16, providerA), "implicit resolver grant");
    }
}
