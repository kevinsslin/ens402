// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {NativeENSTest} from "./NativeENS.t.sol";
import {IServiceRegistrar} from "../src/interfaces/IServiceRegistrar.sol";
import {ServiceRegistrar} from "../src/ServiceRegistrar.sol";
import {INativeResolver} from "../src/interfaces/INativeENS.sol";
import {ENSRoles} from "../src/libraries/ENSRoles.sol";

contract ServiceRegistrarTest is NativeENSTest {
    ServiceRegistrar registrar;
    address constant merchant = address(0x3003);

    function _deploy() internal {
        registrar = new ServiceRegistrar(
            address(registry), address(factory), resolverImpl, hex"0a656e73343032666f726b00", expiry
        );
        registry.grantRootRoles(ENSRoles.ROLE_REGISTRAR, address(registrar));
    }

    function _service(string memory label) internal pure returns (IServiceRegistrar.Service memory) {
        return IServiceRegistrar.Service(
            label,
            "https://weather.example/forecast",
            address(0x4004),
            operator,
            treasury,
            "Weather forecast",
            "",
            10000,
            '{"method":"GET"}'
        );
    }

    function _register(string memory label) internal returns (INativeResolver result) {
        IServiceRegistrar.Service memory s = _service(label);
        registrar.commit(registrar.makeCommitment(s, merchant, bytes32(uint256(1))));
        vm.warp(block.timestamp + 60);
        vm.prank(merchant);
        (address deployed,) = registrar.register(s, bytes32(uint256(1)));
        return INativeResolver(deployed);
    }

    function testAtomicRegistrationWithNativePermissionsAndNoRetainedRegistrarControl() public {
        _deploy();
        INativeResolver child = _register("weather");
        bytes memory name = hex"07776561746865720a656e73343032666f726b00";
        (address found, bytes32 hash, uint256 offset) = universal.findResolver(name);
        require(found == address(child) && offset == 0, "not published");
        require(universal.findOwner(name) == merchant, "wrong owner");
        require(!child.hasRootRoles(ENSRoles.ROLE_SET_TEXT, address(registrar)), "registrar retained writer");
        require(!child.hasRootRoles(ENSRoles.ROLE_SET_TEXT_ADMIN, address(registrar)), "registrar retained admin");
        require(child.hasRootRoles(ENSRoles.ROLE_SET_TEXT_ADMIN, merchant), "owner lacks admin");
        vm.prank(operator);
        child.setText(hash, "agent-endpoint[x402]", "https://weather.example/v2");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(operator);
        child.setText(hash, "ens402.payment", "steal");
        vm.prank(treasury);
        child.setText(hash, "ens402.payment", "treasury update");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(address(registrar));
        child.setText(hash, "ens402.status", "suspended");
    }

    function testCommitmentBindsOwnerAndEveryRecord() public {
        _deploy();
        IServiceRegistrar.Service memory s = _service("weather");
        bytes32 secret = bytes32(uint256(3));
        registrar.commit(registrar.makeCommitment(s, merchant, secret));
        vm.warp(block.timestamp + 60);
        vm.expectPartialRevert(IServiceRegistrar.CommitmentNotReady.selector);
        registrar.register(s, secret);
        s.payTo = operator;
        vm.expectPartialRevert(IServiceRegistrar.CommitmentNotReady.selector);
        vm.prank(merchant);
        registrar.register(s, secret);
    }

    function testCommitmentDelayExpiryAndReplay() public {
        _deploy();
        IServiceRegistrar.Service memory s = _service("weather");
        bytes32 secret = bytes32(uint256(3));
        registrar.commit(registrar.makeCommitment(s, merchant, secret));
        vm.expectPartialRevert(IServiceRegistrar.CommitmentNotReady.selector);
        vm.prank(merchant);
        registrar.register(s, secret);
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectPartialRevert(IServiceRegistrar.CommitmentNotReady.selector);
        vm.prank(merchant);
        registrar.register(s, secret);
        _register("prices");
        vm.expectPartialRevert(IServiceRegistrar.CommitmentNotReady.selector);
        vm.prank(merchant);
        registrar.register(_service("prices"), bytes32(uint256(1)));
    }

    function testDifferentNamesGetIsolatedResolvers() public {
        _deploy();
        INativeResolver a = _register("weather");
        INativeResolver b = _register("prices");
        require(address(a) != address(b), "shared resolver");
    }

    function testNativeRegistrarRevocationStopsRegistrationAtomically() public {
        _deploy();
        IServiceRegistrar.Service memory s = _service("weather");
        bytes32 secret = bytes32(uint256(1));
        bytes32 commitment = registrar.makeCommitment(s, merchant, secret);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 60);
        registry.revokeRootRoles(ENSRoles.ROLE_REGISTRAR, address(registrar));
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(merchant);
        registrar.register(s, secret);
        require(registrar.commitments(commitment) > 0, "failed registration consumed commitment");
        require(registry.findOwner("weather") == address(0), "partial registration");
    }

    function testInterfaceRevealAtMaximumAgeAndCommitmentConsumption() public {
        _deploy();
        IServiceRegistrar api = IServiceRegistrar(address(registrar));
        IServiceRegistrar.Service memory service = _service("boundary");
        bytes32 secret = keccak256("interface-boundary");
        bytes32 commitment = api.makeCommitment(service, merchant, secret);
        api.commit(commitment);
        uint256 committedAt = api.commitments(commitment);
        vm.warp(committedAt + api.MAX_COMMITMENT_AGE());
        vm.expectPartialRevert(IServiceRegistrar.CommitmentExists.selector);
        api.commit(commitment);
        vm.prank(merchant);
        (address resolverAddress,) = api.register(service, secret);
        require(resolverAddress.code.length > 0, "resolver not created through interface");
        require(api.commitments(commitment) == 0, "commitment not consumed");
        require(api.registry().findOwner("boundary") == merchant, "interface registered wrong owner");
    }

    function testExpiredCommitmentCanBeReplacedButRegistrarExpiryIsFinal() public {
        _deploy();
        IServiceRegistrar api = IServiceRegistrar(address(registrar));
        IServiceRegistrar.Service memory service = _service("expired");
        bytes32 secret = keccak256("expired-boundary");
        bytes32 commitment = api.makeCommitment(service, merchant, secret);
        api.commit(commitment);
        vm.warp(block.timestamp + api.MAX_COMMITMENT_AGE() + 1);
        api.commit(commitment);
        require(api.commitments(commitment) == block.timestamp, "expired commitment not replaced");
        vm.warp(api.registrationExpiry());
        vm.expectPartialRevert(IServiceRegistrar.RegistrationExpired.selector);
        vm.prank(merchant);
        api.register(service, secret);
        require(api.commitments(commitment) != 0, "expired reveal consumed commitment");
    }

    function testExplicitCallMetadataRequiredAndCommitmentBound() public {
        _deploy();
        IServiceRegistrar.Service memory service = _service("weather");
        service.callConfig = "";
        vm.expectPartialRevert(IServiceRegistrar.InvalidRecord.selector);
        vm.prank(merchant);
        registrar.register(service, bytes32(0));
        service = _service("weather");
        bytes32 secret = keccak256("call-metadata");
        registrar.commit(registrar.makeCommitment(service, merchant, secret));
        vm.warp(block.timestamp + 60);
        service.callConfig = '{"method":"POST"}';
        vm.expectPartialRevert(IServiceRegistrar.CommitmentNotReady.selector);
        vm.prank(merchant);
        registrar.register(service, secret);
    }

    function testInvalidLabelAndZeroWritersRejected() public {
        _deploy();
        IServiceRegistrar.Service memory s = _service("Bad.Label");
        vm.expectPartialRevert(IServiceRegistrar.InvalidLabel.selector);
        registrar.register(s, bytes32(0));
        s = _service("weather");
        s.treasury = address(0);
        vm.expectPartialRevert(IServiceRegistrar.InvalidRecord.selector);
        registrar.register(s, bytes32(0));
    }
}
