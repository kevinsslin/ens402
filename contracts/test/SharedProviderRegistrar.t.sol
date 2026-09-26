// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SharedProviderServiceRegistrar} from "../src/SharedProviderServiceRegistrar.sol";
import {ProviderServiceRegistrar} from "../src/ProviderServiceRegistrar.sol";
import {IServiceRegistrar} from "../src/interfaces/IServiceRegistrar.sol";
import {
    INativeRegistry,
    INativeResolver,
    ICurrentRegistry,
    ICurrentResolver,
    IVerifiableFactory,
    NativeGrant
} from "../src/interfaces/INativeENS.sol";
import {Vm} from "./NativeENS.t.sol";

interface ISharedTestAccess {
    function revokeRoles(uint256 resource, uint256 roles, address account) external returns (bool);
    function linkToRecord(bytes calldata name, uint256 recordId) external;
}

interface VmAnyRevert {
    function expectRevert() external;
}

contract SharedProviderRegistrarTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    IVerifiableFactory constant factory = IVerifiableFactory(0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C);
    address constant registryImpl = 0xA80338aAA8D23831cEa25E858D1774534aBb0263;
    address constant resolverImpl = 0x14F09Fd05d4585759e54844DC9B00147131Cf243;
    address constant publisher = address(0xA1);
    address constant ops = address(0xB1);
    address constant treasurySafe = address(0xC1);
    address constant outsider = address(0xD1);
    bytes32 constant secret = keccak256("shared-provider");
    bytes parentDNS = hex"05616c70686106656e733430320365746800";
    INativeRegistry registry;
    ICurrentResolver resolver;
    SharedProviderServiceRegistrar registrar;
    uint64 expiry;

    function setUp() public {
        vm.createSelectFork(vm.envOr("ENS_FORK_RPC_URL", "https://sepolia.gateway.tenderly.co"), 11783987);
        expiry = uint64(block.timestamp + 30 days);
        NativeGrant[] memory grants = new NativeGrant[](1);
        grants[0] = NativeGrant(address(this), 1 | (uint256(1) << 128));
        registry = INativeRegistry(
            factory.deployProxy(registryImpl, 951, abi.encodeCall(ICurrentRegistry.initialize, (grants)))
        );
        registry.grantRootRoles(1, publisher);
        grants[0] = NativeGrant(address(this), 16 | (uint256(16) << 128) | (1 << 28));
        resolver = ICurrentResolver(
            factory.deployProxy(
                resolverImpl, 952, abi.encodeCall(ICurrentResolver.initialize, (grants, new bytes[](0)))
            )
        );
        registrar = new SharedProviderServiceRegistrar(
            address(registry), address(factory), resolverImpl, parentDNS, expiry, address(resolver), ops, treasurySafe
        );
        registry.grantRootRoles(1, address(registrar));
        string[6] memory keys =
            ["agent-endpoint[x402]", "description", "avatar", "ens402.call", "ens402.payment", "ens402.status"];
        for (uint256 i; i < keys.length; ++i) {
            bytes memory setter = abi.encodeCall(ICurrentResolver.setText, (_dns("weather"), keys[i], ""));
            resolver.grantSetterRoles(setter, address(registrar));
            if (i < 4) resolver.grantSetterRoles(setter, ops);
            if (i == 4) resolver.grantSetterRoles(setter, treasurySafe);
        }
    }

    function _dns(string memory label) internal view returns (bytes memory) {
        return abi.encodePacked(uint8(bytes(label).length), label, parentDNS);
    }

    function _node(string memory label) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(registrar.parentNode(), keccak256(bytes(label))));
    }

    function _service(string memory label) internal pure returns (IServiceRegistrar.Service memory) {
        return IServiceRegistrar.Service(
            label, "https://weather.example/api", publisher, ops, treasurySafe, "Weather", "", 10000, '{"method":"GET"}'
        );
    }

    function _commit(string memory label, address account) internal returns (bytes32 commitment) {
        commitment = registrar.makeCommitment(_service(label), account, secret);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 60);
    }

    function _register(string memory label) internal {
        vm.prank(publisher);
        (address result,) = registrar.register(_service(label), secret);
        require(result == address(resolver), "not shared resolver");
    }

    function testDirectRegistrationWithoutCommitOrDelay() public {
        uint256 before = block.timestamp;
        vm.prank(publisher);
        registrar.register(_service("direct"), bytes32(0));
        require(registry.findOwner("direct") == publisher, "wrong owner");
        require(resolver.getRecordId(_node("direct")) != 0, "missing records");
        require(block.timestamp == before, "unexpected delay");
        require(registrar.registrationMode() == 2, "wrong mode");
    }

    function testDirectRegistrationRejectsOutsiderAndRevokedPublisher() public {
        vm.expectPartialRevert(ProviderServiceRegistrar.UnauthorizedPublisher.selector);
        vm.prank(outsider);
        registrar.register(_service("direct"), bytes32(0));
        registry.revokeRootRoles(1, publisher);
        vm.expectPartialRevert(ProviderServiceRegistrar.UnauthorizedPublisher.selector);
        vm.prank(publisher);
        registrar.register(_service("direct"), bytes32(0));
        require(resolver.getRecordId(_node("direct")) == 0, "unauthorized records");
    }

    function testSeparateBundlesWithProviderWideKeyDelegatesAndNoPublisherRoot() public {
        _register("weather");
        _register("prices");
        uint256 a = resolver.getRecordId(_node("weather"));
        uint256 b = resolver.getRecordId(_node("prices"));
        require(a != 0 && b != 0 && a != b, "bundles shared or missing");
        vm.prank(ops);
        resolver.setText(_dns("weather"), "description", "Forecast");
        vm.prank(ops);
        resolver.setText(_dns("prices"), "description", "Prices");
        vm.prank(treasurySafe);
        resolver.setText(_dns("weather"), "ens402.payment", "new payTo weather");
        vm.prank(treasurySafe);
        resolver.setText(_dns("prices"), "ens402.payment", "new payTo prices");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(treasurySafe);
        resolver.setText(_dns("prices"), "agent-endpoint[x402]", "https://evil.example");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(ops);
        resolver.setText(_dns("weather"), "ens402.payment", "steal");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(outsider);
        resolver.setText(_dns("weather"), "description", "outsider");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(publisher);
        resolver.setText(_dns("weather"), "description", "publisher escalation");
        INativeResolver access = INativeResolver(address(resolver));
        require(!access.hasRootRoles(16, publisher), "publisher root writer");
        require(!access.hasRootRoles(uint256(16) << 128, publisher), "publisher root admin");
        require(!access.hasRootRoles(16, address(registrar)), "registrar root writer");
        require(!access.hasRootRoles(uint256(16) << 128, address(registrar)), "registrar root admin");
    }

    function testUnauthorizedPublisherAndMismatchedDelegatesRejected() public {
        _commit("weather", outsider);
        vm.expectPartialRevert(ProviderServiceRegistrar.UnauthorizedPublisher.selector);
        vm.prank(outsider);
        registrar.register(_service("weather"), secret);
        IServiceRegistrar.Service memory service = _service("weather");
        service.endpointOperator = outsider;
        vm.expectPartialRevert(IServiceRegistrar.InvalidRecord.selector);
        vm.prank(publisher);
        registrar.register(service, secret);
    }

    function testActiveRegistryNameFailureRollsBackNewBundleAndCommitmentConsumption() public {
        registry.register("weather", publisher, address(0), address(0), 0, expiry);
        bytes32 commitment = _commit("weather", publisher);
        VmAnyRevert(address(vm)).expectRevert();
        vm.prank(publisher);
        registrar.register(_service("weather"), secret);
        require(resolver.getRecordId(_node("weather")) == 0, "failed publication left records");
        require(registrar.commitments(commitment) != 0, "failed publication consumed commitment");
    }

    function testExistingBundleRejectedBeforeAnyOverwrite() public {
        resolver.setText(_dns("weather"), "description", "Existing bundle");
        uint256 recordId = resolver.getRecordId(_node("weather"));
        _commit("weather", publisher);
        vm.expectPartialRevert(SharedProviderServiceRegistrar.ExistingRecordBundle.selector);
        vm.prank(publisher);
        registrar.register(_service("weather"), secret);
        require(resolver.getRecordId(_node("weather")) == recordId, "bundle replaced");
        require(registry.findOwner("weather") == address(0), "name published");
    }

    function testNativeDelegateRotationWorksWithoutRegistrarRedeployment() public {
        address nextOps = address(0xCAFE);
        string[4] memory keys = ["agent-endpoint[x402]", "description", "avatar", "ens402.call"];
        for (uint256 i; i < keys.length; ++i) {
            resolver.grantSetterRoles(abi.encodeCall(ICurrentResolver.setText, (_dns("weather"), keys[i], "")), nextOps);
            ISharedTestAccess(address(resolver)).revokeRoles(uint256(keccak256(bytes(keys[i]))), 16, ops);
        }
        _commit("weather", publisher);
        vm.expectPartialRevert(IServiceRegistrar.InvalidRecord.selector);
        vm.prank(publisher);
        registrar.register(_service("weather"), secret);
        IServiceRegistrar.Service memory service = _service("weather");
        service.endpointOperator = nextOps;
        registrar.commit(registrar.makeCommitment(service, publisher, secret));
        vm.warp(block.timestamp + 60);
        vm.prank(publisher);
        registrar.register(service, secret);
        require(registry.findOwner("weather") == publisher, "rotation blocked publication");
        vm.prank(nextOps);
        resolver.setText(_dns("weather"), "description", "Rotated Ops");
    }

    function testLinkedBundleCannotBeRegisteredOrOverwritten() public {
        resolver.setText(_dns("prices"), "description", "Original");
        uint256 original = resolver.getRecordId(_node("prices"));
        ISharedTestAccess(address(resolver)).linkToRecord(_dns("weather"), original);
        _commit("weather", publisher);
        vm.expectPartialRevert(SharedProviderServiceRegistrar.ExistingRecordBundle.selector);
        vm.prank(publisher);
        registrar.register(_service("weather"), secret);
        require(resolver.getRecordId(_node("weather")) == original, "linked bundle changed");
    }
}
