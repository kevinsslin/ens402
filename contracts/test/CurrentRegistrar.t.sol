// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ServiceRegistrar} from "../src/ServiceRegistrar.sol";
import {
    INativeRegistry,
    INativeResolver,
    IVerifiableFactory,
    ICurrentResolver,
    ICurrentRegistry,
    IUniversalResolverV2,
    NativeGrant
} from "../src/interfaces/INativeENS.sol";
import {Vm} from "./NativeENS.t.sol";

interface INativeTransfer {
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}

contract CurrentRegistrarTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    IVerifiableFactory constant factory = IVerifiableFactory(0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C);
    address constant implementation = 0x14F09Fd05d4585759e54844DC9B00147131Cf243;
    address constant owner = address(0x1001);
    address constant ops = address(0x1002);
    address constant treasury = address(0x1003);
    INativeRegistry registry;
    ServiceRegistrar registrar;

    function setUp() public {
        vm.createSelectFork(vm.envOr("ENS_FORK_RPC_URL", "https://sepolia.gateway.tenderly.co"), 11783987);
        NativeGrant[] memory grants = new NativeGrant[](1);
        grants[0] = NativeGrant(address(this), 1 | (uint256(1) << 128));
        registry = INativeRegistry(
            factory.deployProxy(
                0xA80338aAA8D23831cEa25E858D1774534aBb0263, 901, abi.encodeCall(ICurrentRegistry.initialize, (grants))
            )
        );
        registrar = new ServiceRegistrar(
            address(registry),
            address(factory),
            implementation,
            hex"0a656e73343032666f726b00",
            uint64(block.timestamp + 30 days)
        );
        registry.grantRootRoles(1, address(registrar));
        vm.prank(0x84D3a426D4E12E955d1DF95db0B24fe26afE39D3);
        INativeRegistry(0x9703DBD26dAB89504490994138cF2c575251a9cE)
            .register("ens402fork", owner, address(registry), address(0), 1 << 20, uint64(block.timestamp + 30 days));
    }

    function testOpsCannotAlsoBeServiceAdmin() public {
        ServiceRegistrar.Service memory service =
            ServiceRegistrar.Service("weather", "https://weather.example/api", treasury, owner, treasury);
        registrar.commit(registrar.makeCommitment(service, owner, bytes32(uint256(2))));
        vm.warp(block.timestamp + 60);
        vm.expectPartialRevert(ServiceRegistrar.InvalidRecord.selector);
        vm.prank(owner);
        registrar.register(service, bytes32(uint256(2)));
    }

    function testCurrentNativeRegistrationAndSetterRoles() public {
        ServiceRegistrar.Service memory s =
            ServiceRegistrar.Service("weather", "https://weather.example/api", treasury, ops, treasury);
        registrar.commit(registrar.makeCommitment(s, owner, bytes32(uint256(1))));
        vm.warp(block.timestamp + 60);
        vm.prank(owner);
        (address resolver, uint256 tokenId) = registrar.register(s, bytes32(uint256(1)));
        require(registrar.currentResolver(), "wrong version");
        bytes memory dns = hex"07776561746865720a656e73343032666f726b00";
        (address found, bytes32 node, uint256 offset) =
            IUniversalResolverV2(0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3).findResolver(dns);
        require(found == resolver && offset == 0, "not resolved");
        require(
            ICurrentResolver(resolver).getRecordId(node) == 1 && ICurrentResolver(resolver).getRecordCount() == 1,
            "not dedicated"
        );
        vm.prank(ops);
        ICurrentResolver(resolver).setText(dns, "agent-endpoint[x402]", "https://weather.example/v2");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(ops);
        ICurrentResolver(resolver).setText(dns, "ens402.payment", "steal");
        require(
            !INativeResolver(resolver).hasRootRoles(16 | (uint256(16) << 128), address(registrar)),
            "bootstrap privilege retained"
        );
        vm.expectPartialRevert(bytes4(0xd1a3b355));
        vm.prank(ops);
        INativeResolver(resolver).grantRootRoles(16, ops);
        // Native name ownership and resolver administration have separate lifecycles.
        address nextOwner = address(0x1004);
        vm.prank(owner);
        INativeTransfer(address(registry)).safeTransferFrom(owner, nextOwner, tokenId, 1, "");
        require(registry.findOwner("weather") == nextOwner, "name transfer failed");
        require(INativeResolver(resolver).hasRootRoles(16, owner), "resolver authority changed unexpectedly");
        require(!INativeResolver(resolver).hasRootRoles(16, nextOwner), "implicit resolver authority transfer");
    }
}
