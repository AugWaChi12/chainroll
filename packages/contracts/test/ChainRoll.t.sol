// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ChainRoll} from "../src/ChainRoll.sol";

contract ChainRollTest is Test {
    ChainRoll internal cam;

    address internal admin = makeAddr("admin");
    address internal router = makeAddr("sdkCallHelperRouter");
    address internal alice = makeAddr("alice"); // MetaMask user
    address internal bob = makeAddr("bob"); // Bitkub NEXT user
    address internal mallory = makeAddr("mallory");

    uint16 internal constant FILM = 1;
    uint8 internal constant FRAMES = 24;

    event Shot(
        address indexed shooter,
        uint256 indexed rollId,
        uint8 frame,
        bytes32 photoHash,
        uint16 filmId
    );
    event RollClaimed(
        address indexed owner, uint256 indexed rollId, uint16 indexed filmId, uint8 frames
    );

    function setUp() public {
        // 2026-12-14 12:00 Bangkok
        vm.warp(1_797_224_400);
        cam = new ChainRoll(admin, router);
        vm.prank(admin);
        cam.setFilm(FILM, "KUB 400", FRAMES, true);
    }

    // ─── helpers ───────────────────────────────────────────────
    function _h(uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encode("photo", i));
    }

    function _claim(address user) internal returns (uint256) {
        vm.prank(user);
        return cam.claimDailyRoll(FILM);
    }

    function _fill(address user, uint256 rollId, uint256 salt) internal {
        uint8 frames = cam.getRoll(rollId).frames;
        for (uint256 i; i < frames; ++i) {
            vm.prank(user);
            cam.shoot(rollId, _h(salt * 1000 + i));
        }
    }

    // ═══ constructor / admin ═══════════════════════════════════

    function test_constructor_setsRolesAndRouter() public view {
        assertTrue(cam.hasRole(cam.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(cam.hasRole(cam.CURATOR_ROLE(), admin));
        assertEq(cam.sdkCallHelperRouter(), router);
    }

    function test_constructor_revertsOnZeroAdmin() public {
        vm.expectRevert(ChainRoll.ZeroAddress.selector);
        new ChainRoll(address(0), router);
    }

    function test_setFilm_onlyCurator() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                mallory,
                cam.CURATOR_ROLE()
            )
        );
        vm.prank(mallory);
        cam.setFilm(2, "Night 800", 36, true);
    }

    function test_setFilm_rejectsBadFrameCounts() public {
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.InvalidFrames.selector, 0));
        cam.setFilm(2, "x", 0, true);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.InvalidFrames.selector, 73));
        cam.setFilm(2, "x", 73, true);
        vm.stopPrank();
    }

    function test_setRouter_onlyAdmin() public {
        vm.prank(mallory);
        vm.expectRevert();
        cam.setSdkCallHelperRouter(mallory);

        vm.prank(admin);
        cam.setSdkCallHelperRouter(address(0xBEEF));
        assertEq(cam.sdkCallHelperRouter(), address(0xBEEF));
    }

    // ═══ claim ═════════════════════════════════════════════════

    function test_claim_createsRoll() public {
        vm.expectEmit(address(cam));
        emit RollClaimed(alice, 1, FILM, FRAMES);
        uint256 id = _claim(alice);

        ChainRoll.Roll memory r = cam.getRoll(id);
        assertEq(id, 1);
        assertEq(r.owner, alice);
        assertEq(r.filmId, FILM);
        assertEq(r.frames, FRAMES);
        assertEq(r.framesUsed, 0);
        assertFalse(cam.canClaim(alice));
    }

    function test_claim_onlyOncePerBangkokDay() public {
        _claim(alice);
        uint256 nextAt = cam.nextClaimAt(alice);
        // next claim = next 00:00 Bangkok = 17:00 UTC
        assertEq((nextAt + 7 hours) % 1 days, 0);
        assertGt(nextAt, block.timestamp);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.AlreadyClaimedToday.selector, nextAt));
        cam.claimDailyRoll(FILM);

        vm.warp(nextAt - 1);
        assertFalse(cam.canClaim(alice));
        vm.warp(nextAt);
        assertTrue(cam.canClaim(alice));
        assertEq(_claim(alice), 2);
    }

    function test_claim_revertsOnInactiveFilm() public {
        vm.prank(admin);
        cam.setFilm(FILM, "KUB 400", FRAMES, false);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.FilmNotActive.selector, FILM));
        cam.claimDailyRoll(FILM);
    }

    function test_claim_filmEditDoesNotChangeOpenRoll() public {
        uint256 id = _claim(alice);
        vm.prank(admin);
        cam.setFilm(FILM, "KUB 400", 36, true);
        assertEq(cam.getRoll(id).frames, FRAMES);
    }

    // ═══ shoot ═════════════════════════════════════════════════

    function test_shoot_emitsAndCounts() public {
        uint256 id = _claim(alice);
        vm.expectEmit(address(cam));
        emit Shot(alice, id, 1, _h(1), FILM);
        vm.prank(alice);
        cam.shoot(id, _h(1));

        assertEq(cam.getRoll(id).framesUsed, 1);
        assertTrue(cam.hashUsed(_h(1)));
    }

    function test_shoot_revertsWhenNotOwner() public {
        uint256 id = _claim(alice);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.NotRollOwner.selector, id));
        cam.shoot(id, _h(1));
    }

    function test_shoot_revertsOnUnknownRoll() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.NotRollOwner.selector, 999));
        cam.shoot(999, _h(1));
    }

    function test_shoot_revertsWhenFull() public {
        uint256 id = _claim(alice);
        _fill(alice, id, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.RollFull.selector, id));
        cam.shoot(id, _h(99_999));
    }

    function test_shoot_rejectsDuplicateAndZeroHash() public {
        uint256 id = _claim(alice);
        vm.startPrank(alice);
        cam.shoot(id, _h(1));
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.HashAlreadyUsed.selector, _h(1)));
        cam.shoot(id, _h(1));
        vm.expectRevert(ChainRoll.ZeroHash.selector);
        cam.shoot(id, bytes32(0));
        vm.stopPrank();
    }

    function testFuzz_shoot_framesNeverExceedRoll(uint8 shots) public {
        uint256 id = _claim(alice);
        uint256 ok;
        for (uint256 i; i < uint256(shots) % 40; ++i) {
            vm.prank(alice);
            try cam.shoot(id, _h(i + 1)) {
                ++ok;
            } catch {}
        }
        ChainRoll.Roll memory r = cam.getRoll(id);
        assertLe(r.framesUsed, r.frames);
        assertEq(r.framesUsed, ok);
    }

    // ═══ develop ═══════════════════════════════════════════════

    function test_develop_requiresFullRoll() public {
        uint256 id = _claim(alice);
        vm.prank(alice);
        cam.shoot(id, _h(1));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.RollNotFull.selector, id, 1, FRAMES));
        cam.develop(id);
    }

    function test_develop_setsReadyAtOnce() public {
        uint256 id = _claim(alice);
        _fill(alice, id, 1);

        vm.prank(alice);
        cam.develop(id);
        assertEq(cam.getRoll(id).developReadyAt, block.timestamp + 1 hours);
        assertFalse(cam.isDeveloped(id));

        vm.warp(block.timestamp + 1 hours);
        assertTrue(cam.isDeveloped(id));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.AlreadyDeveloped.selector, id));
        cam.develop(id);
    }

    function test_develop_onlyOwner() public {
        uint256 id = _claim(alice);
        _fill(alice, id, 1);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.NotRollOwner.selector, id));
        cam.develop(id);
    }

    // ═══ Bitkub NEXT router path ═══════════════════════════════

    function test_next_fullFlowAttributesToUser() public {
        vm.startPrank(router);
        uint256 id = cam.claimDailyRoll(FILM, bob);
        assertEq(cam.getRoll(id).owner, bob);

        vm.expectEmit(address(cam));
        emit Shot(bob, id, 1, _h(1), FILM);
        cam.shoot(id, _h(1), bob);
        for (uint256 i = 2; i <= FRAMES; ++i) {
            cam.shoot(id, _h(i), bob);
        }
        cam.develop(id, bob);
        vm.stopPrank();

        assertGt(cam.getRoll(id).developReadyAt, 0);
        assertFalse(cam.canClaim(bob));
    }

    function test_next_onlyRouterCanUseForwardedEntryPoints() public {
        vm.startPrank(mallory);
        vm.expectRevert(ChainRoll.OnlyRouter.selector);
        cam.claimDailyRoll(FILM, bob);

        uint256 id = cam.claimDailyRoll(FILM); // mallory's own roll via the normal path is fine
        vm.expectRevert(ChainRoll.OnlyRouter.selector);
        cam.shoot(id, _h(1), mallory);
        vm.expectRevert(ChainRoll.OnlyRouter.selector);
        cam.develop(id, mallory);
        vm.stopPrank();
    }

    function test_next_routerCannotShootSomeoneElsesRoll() public {
        uint256 aliceRoll = _claim(alice);
        vm.prank(router);
        vm.expectRevert(abi.encodeWithSelector(ChainRoll.NotRollOwner.selector, aliceRoll));
        cam.shoot(aliceRoll, _h(1), bob);
    }

    function test_next_unsetRouterBlocksForwardedCalls() public {
        ChainRoll noRouter = new ChainRoll(admin, address(0));
        vm.prank(admin);
        noRouter.setFilm(FILM, "KUB 400", FRAMES, true);
        vm.prank(address(0));
        vm.expectRevert(ChainRoll.OnlyRouter.selector);
        noRouter.claimDailyRoll(FILM, bob);
    }

    function test_next_zeroUserRejected() public {
        vm.prank(router);
        vm.expectRevert(ChainRoll.ZeroAddress.selector);
        cam.claimDailyRoll(FILM, address(0));
    }

    function test_walletsShareOneDailyQuota() public {
        // same address via router and directly → still one roll per day
        vm.prank(router);
        cam.claimDailyRoll(FILM, alice);
        vm.prank(alice);
        vm.expectRevert();
        cam.claimDailyRoll(FILM);
    }

    // ═══ pause ═════════════════════════════════════════════════

    function test_pause_blocksUserActions() public {
        uint256 id = _claim(alice);
        vm.prank(admin);
        cam.pause();

        vm.startPrank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        cam.shoot(id, _h(1));
        vm.stopPrank();

        vm.prank(router);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        cam.claimDailyRoll(FILM, bob);

        vm.prank(admin);
        cam.unpause();
        vm.prank(alice);
        cam.shoot(id, _h(1));
    }

    function test_pause_onlyAdmin() public {
        vm.prank(mallory);
        vm.expectRevert();
        cam.pause();
    }
}
