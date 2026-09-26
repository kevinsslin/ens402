// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IVerifiableFactory, ICurrentResolver, INativeResolver, NativeGrant} from "../src/interfaces/INativeENS.sol";
import {Vm} from "./NativeENS.t.sol";

interface IResolverScopeRead {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
    function linkToRecord(bytes calldata name, uint256 recordId) external;
}

/// @notice Tests the article's resolver trust boundaries against the pinned native deployment.
/// @dev Every deployment and write stays on a disposable Sepolia fork.
contract ResolverScopeTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    IVerifiableFactory constant factory = IVerifiableFactory(0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C);
    address constant implementation = 0x14F09Fd05d4585759e54844DC9B00147131Cf243;
    address constant ops = address(0xB0B);
    uint256 constant SET_TEXT = 1 << 4;
    uint256 constant TEXT_ADMIN = SET_TEXT << 128;
    bytes constant ALPHA = hex"05616c70686100";
    bytes constant BETA = hex"046265746100";
    ICurrentResolver resolverA;
    ICurrentResolver resolverB;

    function setUp() public {
        vm.createSelectFork(vm.envOr("ENS_FORK_RPC_URL", "https://sepolia.gateway.tenderly.co"), 11783987);
        resolverA = _deploy(6101, SET_TEXT | TEXT_ADMIN);
        resolverB = _deploy(6102, SET_TEXT | TEXT_ADMIN);
        resolverA.setText(ALPHA, "description", "Alpha");
        resolverB.setText(BETA, "description", "Beta");
        resolverA.grantSetterRoles(abi.encodeCall(ICurrentResolver.setText, (ALPHA, "description", "")), ops);
    }

    function _deploy(uint256 salt, uint256 roles) private returns (ICurrentResolver) {
        NativeGrant[] memory grants = new NativeGrant[](1);
        grants[0] = NativeGrant(address(this), roles);
        return ICurrentResolver(factory.deployProxy(implementation, salt, abi.encodeCall(ICurrentResolver.initialize, (grants, new bytes[](0)))));
    }

    function _node(string memory label) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(label))));
    }

    function _text(ICurrentResolver resolver, bytes32 node, string memory key) private view returns (bytes32) {
        bytes memory dns = node == _node("alpha") ? ALPHA : BETA;
        bytes memory result = IResolverScopeRead(address(resolver)).resolve(dns, abi.encodeWithSignature("text(bytes32,string)", node, key));
        return keccak256(bytes(abi.decode(result, (string))));
    }

    function testSetterGrantIgnoresNameButCannotCrossResolverBoundary() public {
        vm.prank(ops);
        resolverA.setText(BETA, "description", "Written by Alpha delegate");
        require(resolverA.getRecordCount() == 2, "key grant is not name scoped");
        require(_text(resolverA, _node("beta"), "description") == keccak256("Written by Alpha delegate"), "second name write");
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(ops);
        resolverB.setText(BETA, "description", "Forbidden");
        require(_text(resolverB, _node("beta"), "description") == keccak256("Beta"), "other resolver changed");
    }

    function testDelegateCannotWriteAnotherKeyOrGrantRoles() public {
        vm.expectPartialRevert(bytes4(0x4b27a133));
        vm.prank(ops);
        resolverA.setText(ALPHA, "ens402.payment", "Forbidden");
        vm.prank(ops);
        (bool ok,) = address(resolverA).call(abi.encodeCall(ICurrentResolver.grantSetterRoles, (abi.encodeCall(ICurrentResolver.setText, (ALPHA, "description", "")), address(0xCAFE))));
        require(!ok, "delegate granted its role onward");
    }

    function testDefaultFallbackIsPerNameNotPerField() public {
        resolverA.setText(hex"00", "description", "Default");
        require(_text(resolverA, _node("beta"), "description") == keccak256("Default"), "missing name fallback");
        resolverA.setText(BETA, "avatar", "https://example.com/avatar.png");
        require(_text(resolverA, _node("beta"), "description") == keccak256(""), "field fallback must not occur");
    }

    function testSingleRecordCountDoesNotProveSingleName() public {
        ICurrentResolver shared = _deploy(6103, SET_TEXT | TEXT_ADMIN | (1 << 28));
        shared.setText(ALPHA, "description", "Shared");
        IResolverScopeRead(address(shared)).linkToRecord(BETA, 1);
        require(shared.getRecordCount() == 1, "one record bundle");
        require(shared.getRecordId(_node("alpha")) == 1 && shared.getRecordId(_node("beta")) == 1, "two linked names");
        shared.grantSetterRoles(abi.encodeCall(ICurrentResolver.setText, (ALPHA, "description", "")), ops);
        vm.prank(ops);
        shared.setText(ALPHA, "description", "Changed");
        require(_text(shared, _node("beta"), "description") == keccak256("Changed"), "linked bundle shares values");
    }

    function testRevokingActionWhileKeepingAdminAllowsRegrant() public {
        INativeResolver(address(resolverA)).revokeRootRoles(SET_TEXT, address(this));
        require(!INativeResolver(address(resolverA)).hasRootRoles(SET_TEXT, address(this)), "action remains");
        resolverA.grantRootRoles(SET_TEXT, address(this));
        require(INativeResolver(address(resolverA)).hasRootRoles(SET_TEXT, address(this)), "admin cannot regrant");
    }
}
