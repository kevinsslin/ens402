// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../src/NativeENS.sol";

interface Vm {
    function createSelectFork(string calldata url, uint256 blockNumber) external returns (uint256);
    function envOr(string calldata key, string calldata fallbackValue) external returns (string memory);
    function prank(address who) external;
    function expectPartialRevert(bytes4 selector) external;
    function warp(uint256 timestamp) external;
}

/// Every mutation runs on a disposable Sepolia fork. No signing keys or live sends.
contract NativeENSTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    IVerifiableFactory constant factory = IVerifiableFactory(0x118Bc31A50d559F7015a8Da26d54B3b030CdB70F);
    IUniversalResolverV2 constant universal = IUniversalResolverV2(0x85eDf8B6b7D4211e2b07AA687506B746357B92cf);
    address constant resolverImpl = 0x7E4B2d59938930168024201752EE5503df402303;
    address constant registryImpl = 0x840Fa461059862Ea466A711E8C98c8dE732061C0;
    INativeRegistry constant root = INativeRegistry(0x11b5BfbE9078D826b1eDBDd1cFC12f5828D9F50C);
    address constant rootAdmin = 0x84D3a426D4E12E955d1DF95db0B24fe26afE39D3;
    address constant operator = address(0x1001);
    address constant treasury = address(0x2002);
    uint256 constant SET_TEXT = 16;
    uint256 constant SET_RESOLVER = 1 << 24;
    INativeResolver resolver;
    INativeRegistry registry;
    bytes dns = hex"067365617263680a656e73343032666f726b00"; // search.ens402fork
    bytes32 node;
    uint256 tokenId;
    uint64 expiry;

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return 0xf23a6e61;
    }

    function setUp() public {
        vm.createSelectFork(vm.envOr("ENS_FORK_RPC_URL", "https://sepolia.gateway.tenderly.co"), 11778629);
        require(
            resolverImpl.codehash == 0x4dbadfa3bc41fcd525118b6cf8aab9f4f39de2eb2f770c76c9f7182eb6d10e78,
            "resolver implementation drift"
        );
        uint256 resolverRoles = SET_TEXT | (SET_TEXT << 128) | (1 << 28) | (1 << 156);
        resolver = INativeResolver(
            factory.deployProxy(
                resolverImpl,
                402,
                abi.encodeCall(INativeResolver.initialize, (address(this), resolverRoles, new bytes[](0)))
            )
        );
        registry = INativeRegistry(
            factory.deployProxy(
                registryImpl,
                403,
                abi.encodeCall(INativeRegistry.initialize, (address(this), uint256(1) | (uint256(1) << 128)))
            )
        );
        expiry = uint64(block.timestamp + 30 days);
        vm.prank(rootAdmin);
        root.register(
            "ens402fork", address(this), address(registry), address(resolver), SET_RESOLVER | (1 << 20), expiry
        );
        tokenId = registry.register("search", address(this), address(0), address(resolver), SET_RESOLVER, expiry);
        node = keccak256(
            abi.encodePacked(keccak256(abi.encodePacked(bytes32(0), keccak256("ens402fork"))), keccak256("search"))
        );
        resolver.setText(node, "agent-endpoint[x402]", "https://merchant.example/search/v1");
        resolver.setText(node, "ens402.status", "active");
        resolver.setText(
            node,
            "ens402.payment",
            "{\"version\":1,\"scheme\":\"exact\",\"network\":\"eip155:84532\",\"asset\":\"0x036CbD53842c5426634e7929541eC2318f3dCF7e\",\"payTo\":\"0x2222222222222222222222222222222222222222\"}"
        );
        resolver.authorizeTextRoles(dns, "agent-endpoint[x402]", operator, true);
        resolver.authorizeTextRoles(dns, "ens402.payment", treasury, true);
    }

    function testRegisteredNameResolvesThroughNativeTree() public view {
        (address found, bytes32 foundNode, uint256 offset) = universal.findResolver(dns);
        require(found == address(resolver) && foundNode == node && offset == 0, "wrong exact resolver");
        require(universal.findOwner(dns) == address(this), "wrong owner");
        (bytes memory result, address resolvedBy) =
            universal.resolve(dns, abi.encodeCall(INativeResolver.text, (node, "agent-endpoint[x402]")));
        require(resolvedBy == address(resolver), "wrong resolving contract");
        require(
            keccak256(bytes(abi.decode(result, (string)))) == keccak256("https://merchant.example/search/v1"),
            "wrong endpoint"
        );
        require(factory.verifyContract(address(resolver)) == resolverImpl, "wrong implementation");
    }

    function testOperatorCanMoveEndpoint() public {
        vm.prank(operator);
        resolver.setText(node, "agent-endpoint[x402]", "https://merchant.example/search/v2");
        require(
            keccak256(bytes(resolver.text(node, "agent-endpoint[x402]")))
                == keccak256("https://merchant.example/search/v2"),
            "write failed"
        );
    }

    function testOperatorCannotEditPaymentOrStatus() public {
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(operator);
        resolver.setText(node, "ens402.payment", "hijack");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(operator);
        resolver.setText(node, "ens402.status", "suspended");
    }

    function testOperatorCannotEscalate() public {
        vm.expectPartialRevert(bytes4(0xd1a3b355));
        vm.prank(operator);
        resolver.authorizeTextRoles(dns, "ens402.payment", operator, true);
        vm.expectPartialRevert(bytes4(0xd1a3b355));
        vm.prank(operator);
        resolver.grantRootRoles(SET_TEXT, operator);
    }

    function testSiblingIsolated() public {
        bytes32 sibling = keccak256(
            abi.encodePacked(keccak256(abi.encodePacked(bytes32(0), keccak256("ens402fork"))), keccak256("prices"))
        );
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(operator);
        resolver.setText(sibling, "agent-endpoint[x402]", "hijack");
    }

    function testTreasuryRotationDoesNotGrantEndpointPermission() public {
        vm.prank(treasury);
        resolver.setText(node, "ens402.payment", "new treasury config");
        require(
            keccak256(bytes(resolver.text(node, "ens402.payment"))) == keccak256("new treasury config"),
            "treasury failed"
        );
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(treasury);
        resolver.setText(node, "agent-endpoint[x402]", "hijack");
    }

    function testRevocationLeavesRecordButStopsWrites() public {
        resolver.authorizeTextRoles(dns, "agent-endpoint[x402]", operator, false);
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(operator);
        resolver.setText(node, "agent-endpoint[x402]", "hijack");
        require(bytes(resolver.text(node, "agent-endpoint[x402]")).length > 0, "revocation cleared record");
    }

    function testRootPermissionOverridesNarrowRevocation() public {
        resolver.authorizeTextRoles(dns, "agent-endpoint[x402]", operator, false);
        resolver.grantRootRoles(SET_TEXT, operator);
        vm.prank(operator);
        resolver.setText(node, "ens402.payment", "root override");
        resolver.revokeRootRoles(SET_TEXT, operator);
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(operator);
        resolver.setText(node, "ens402.payment", "hijack");
    }

    function testRegistryPointerIsASeparatePermission() public {
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(operator);
        registry.setResolver(tokenId, operator);
        registry.setResolver(uint256(keccak256("search")), address(0));
        (address found,, uint256 offset) = universal.findResolver(dns);
        require(found == address(resolver) && offset > 0, "expected ancestor fallback");
    }

    function testBootstrapResolverDoesNotAssignAliasOrUpgradeAuthority() public {
        INativeResolver limited = INativeResolver(
            factory.deployProxy(
                resolverImpl,
                404,
                abi.encodeCall(
                    INativeResolver.initialize, (address(this), SET_TEXT | (SET_TEXT << 128), new bytes[](0))
                )
            )
        );
        limited.setText(node, "ens402.status", "active");
        limited.authorizeTextRoles(dns, "agent-endpoint[x402]", operator, true);
        vm.expectPartialRevert(bytes4(0x4b27a133));
        limited.setAlias(dns, hex"056f746865720a656e73343032666f726b00");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        limited.upgradeToAndCall(resolverImpl, "");
    }

    function testExpiredAncestorStopsExactResolution() public {
        vm.warp(uint256(expiry) + 1);
        (address found,,) = universal.findResolver(dns);
        require(found == address(0), "expired tree still resolves");
    }
}
