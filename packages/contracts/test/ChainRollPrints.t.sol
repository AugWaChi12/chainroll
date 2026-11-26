// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChainRoll} from "../src/ChainRoll.sol";
import {ChainRollPrints} from "../src/ChainRollPrints.sol";

contract RejectingBidder {
    function bid(ChainRollPrints prints, uint256 tokenId, uint64 expiresAt) external payable {
        prints.makeOffer{value: msg.value}(tokenId, expiresAt);
    }

    receive() external payable {
        revert("no receive");
    }
}

contract ChainRollPrintsTest is Test {
    ChainRoll internal rollContract;
    ChainRollPrints internal prints;

    address internal admin = makeAddr("admin");
    address internal router = makeAddr("sdkCallHelperRouter");
    address internal treasury = makeAddr("treasury");
    address internal shooter = makeAddr("shooter");
    address internal collector1 = makeAddr("collector1");
    address internal collector2 = makeAddr("collector2");

    bytes32 internal constant PHOTO_1 = keccak256("frame-1-webp");
    bytes32 internal constant PHOTO_2 = keccak256("frame-2-webp");
    bytes32 internal constant BOB_PHOTO_1 = keccak256("bob-frame-1");
    bytes32 internal constant BOB_PHOTO_2 = keccak256("bob-frame-2");

    function setUp() public {
        vm.warp(1_795_000_000);
        rollContract = new ChainRoll(admin, router);
        prints = new ChainRollPrints(admin, address(rollContract), treasury);

        // Configure a 2-frame test film stock so rolls can finish quickly
        vm.prank(admin);
        rollContract.setFilm(1, "KUB 400", 2, true);

        vm.deal(shooter, 100 ether);
        vm.deal(collector1, 100 ether);
        vm.deal(collector2, 100 ether);
    }

    function _shootAndDevelopRoll() internal returns (uint256 rollId) {
        vm.startPrank(shooter);
        rollId = rollContract.claimDailyRoll(1);
        rollContract.shoot(rollId, PHOTO_1);
        rollContract.shoot(rollId, PHOTO_2);
        rollContract.develop(rollId);
        vm.stopPrank();
        vm.warp(block.timestamp + 1 hours + 1);
    }

    function test_mint_requiresDevelopedRollAndRecordedHash() public {
        vm.startPrank(shooter);
        uint256 rollId = rollContract.claimDailyRoll(1);
        rollContract.shoot(rollId, PHOTO_1);
        rollContract.shoot(rollId, PHOTO_2);

        // Not developed yet -> reverts
        vm.expectRevert(abi.encodeWithSelector(ChainRollPrints.RollNotDeveloped.selector, rollId));
        prints.mintPrint(rollId, 1, PHOTO_1, 5 ether);

        rollContract.develop(rollId);
        vm.stopPrank();

        // Still inside 1-hour tank -> reverts
        vm.prank(shooter);
        vm.expectRevert(abi.encodeWithSelector(ChainRollPrints.RollNotDeveloped.selector, rollId));
        prints.mintPrint(rollId, 1, PHOTO_1, 5 ether);

        // Developed -> succeeds
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(shooter);
        uint256 tokenId = prints.mintPrint(rollId, 1, PHOTO_1, 5 ether);
        assertEq(tokenId, 1);
        assertEq(prints.ownerOf(1), shooter);
        assertEq(prints.tokenIdOfHash(PHOTO_1), 1);

        // Duplicate mint of the same photoHash reverts
        vm.prank(shooter);
        vm.expectRevert(
            abi.encodeWithSelector(ChainRollPrints.PrintAlreadyMinted.selector, PHOTO_1, 1)
        );
        prints.mintPrint(rollId, 1, PHOTO_1, 5 ether);

        // baseTokenURI configurable by admin
        assertEq(prints.tokenURI(1), "");
        vm.prank(admin);
        prints.setBaseURI("https://chainroll.art/api/prints/metadata/");
        assertEq(prints.tokenURI(1), "https://chainroll.art/api/prints/metadata/1");
    }

    function test_buyPrint_primaryAndSecondaryRoyaltySplit() public {
        uint256 rollId = _shootAndDevelopRoll();

        vm.prank(shooter);
        uint256 tokenId = prints.mintPrint(rollId, 1, PHOTO_1, 10 ether);

        // Primary sale: collector1 buys for 10 KUB (2.5% protocol fee = 0.25 KUB, shooter gets 9.75 KUB)
        uint256 shooterBefore = shooter.balance;
        uint256 treasuryBefore = treasury.balance;

        vm.prank(collector1);
        prints.buyPrint{value: 10 ether}(tokenId);

        assertEq(prints.ownerOf(tokenId), collector1);
        assertEq(treasury.balance - treasuryBefore, 0.25 ether);
        assertEq(shooter.balance - shooterBefore, 9.75 ether);

        // Secondary sale: collector1 lists at 20 KUB, collector2 buys
        // Photographer receives 5% royalty (1.0 KUB), treasury 2.5% (0.5 KUB), collector1 gets 18.5 KUB
        vm.prank(collector1);
        prints.setAskPrice(tokenId, 20 ether);

        uint256 shooterBefore2 = shooter.balance;
        uint256 collector1Before = collector1.balance;

        vm.prank(collector2);
        prints.buyPrint{value: 20 ether}(tokenId);

        assertEq(prints.ownerOf(tokenId), collector2);
        assertEq(shooter.balance - shooterBefore2, 1 ether);
        assertEq(collector1.balance - collector1Before, 18.5 ether);
    }

    function test_offers_outbidAcceptCancelAndPullFallback() public {
        uint256 rollId = _shootAndDevelopRoll();

        // Mint without an askPrice (open for offers only)
        vm.prank(shooter);
        uint256 tokenId = prints.mintPrint(rollId, 1, PHOTO_1, 0);

        uint64 expiry = uint64(block.timestamp + 1 days);

        // RejectingBidder places first 4 KUB offer
        RejectingBidder badBidder = new RejectingBidder();
        vm.deal(address(badBidder), 10 ether);
        badBidder.bid{value: 4 ether}(prints, tokenId, expiry);

        // Collector1 outbids with 5 KUB -> badBidder reverts on push, so 4 KUB is credited to pendingWithdrawals
        vm.prank(collector1);
        prints.makeOffer{value: 5 ether}(tokenId, expiry);
        assertEq(prints.pendingWithdrawals(address(badBidder)), 4 ether);

        // Collector2 tries to outbid with only 5.1 KUB (< 5% increase) -> reverts
        vm.prank(collector2);
        vm.expectRevert(
            abi.encodeWithSelector(ChainRollPrints.OfferTooLow.selector, 5.25 ether, 5.1 ether)
        );
        prints.makeOffer{value: 5.1 ether}(tokenId, expiry);

        // Collector2 outbids with 6 KUB -> collector1 receives 5 KUB refund immediately
        uint256 c1Before = collector1.balance;
        vm.prank(collector2);
        prints.makeOffer{value: 6 ether}(tokenId, expiry);
        assertEq(collector1.balance - c1Before, 5 ether);

        // Shooter accepts the 6 KUB offer with slippage protection
        uint256 shooterBefore = shooter.balance;
        vm.prank(shooter);
        prints.acceptOffer(tokenId, 6 ether);

        assertEq(prints.ownerOf(tokenId), collector2);
        assertEq(shooter.balance - shooterBefore, 5.85 ether); // 6 - 2.5% protocol fee
    }

    function test_blocksCrossRollHashHijackingAndWrongFrame() public {
        uint256 aliceRoll = _shootAndDevelopRoll();

        // Bob shoots and develops his own roll #2
        vm.startPrank(collector1);
        uint256 bobRoll = rollContract.claimDailyRoll(1);
        rollContract.shoot(bobRoll, BOB_PHOTO_1);
        rollContract.shoot(bobRoll, BOB_PHOTO_2);
        rollContract.develop(bobRoll);
        vm.stopPrank();
        vm.warp(block.timestamp + 1 hours + 1);

        // Bob tries to hijack Alice's PHOTO_1 onto Bob's developed roll -> reverts with HashOriginMismatch
        vm.prank(collector1);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainRollPrints.HashOriginMismatch.selector, bobRoll, 1, aliceRoll, 1
            )
        );
        prints.mintPrint(bobRoll, 1, PHOTO_1, 5 ether);

        // Alice tries to mint her frame 2 hash as frame 1 -> reverts with HashOriginMismatch
        vm.prank(shooter);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainRollPrints.HashOriginMismatch.selector, aliceRoll, 1, aliceRoll, 2
            )
        );
        prints.mintPrint(aliceRoll, 1, PHOTO_2, 5 ether);
    }

    function test_bitkubNextRouterAndDirectTransferOfferRefund() public {
        uint256 rollId = _shootAndDevelopRoll();

        // Shooter mints via Bitkub NEXT sdkCallHelperRouter
        vm.prank(router);
        uint256 tokenId = prints.mintPrint(rollId, 1, PHOTO_1, 4 ether, shooter);
        assertEq(prints.ownerOf(tokenId), shooter);

        // Collector1 places a 3 KUB offer
        uint64 expiry = uint64(block.timestamp + 1 days);
        vm.prank(collector1);
        prints.makeOffer{value: 3 ether}(tokenId, expiry);

        // Shooter transfers NFT directly to collector1 -> collector1's escrowed 3 KUB is auto-refunded
        uint256 c1Before = collector1.balance;
        vm.prank(shooter);
        prints.transferFrom(shooter, collector1, tokenId);

        assertEq(prints.ownerOf(tokenId), collector1);
        assertEq(collector1.balance - c1Before, 3 ether);
        (, uint128 remainingOffer,) = prints.highestOfferOf(tokenId);
        assertEq(remainingOffer, 0);
    }

    function test_preMintOffer_bidCancelAndAtomicAccept() public {
        _shootAndDevelopRoll();
        uint64 expiry = uint64(block.timestamp + 1 days);

        // Collector1 places a pre-mint offer of 2 KUB on PHOTO_1 before it's minted
        vm.prank(collector1);
        prints.makePreMintOffer{value: 2 ether}(PHOTO_1, expiry);

        // Collector1 cancels and gets refunded
        uint256 c1Before = collector1.balance;
        vm.prank(collector1);
        prints.cancelPreMintOffer(PHOTO_1);
        assertEq(collector1.balance - c1Before, 2 ether);

        // Collector1 bids 3 KUB, Collector2 outbids at 4 KUB (auto-refunds Collector1)
        vm.prank(collector1);
        prints.makePreMintOffer{value: 3 ether}(PHOTO_1, expiry);

        uint256 c1Mid = collector1.balance;
        vm.prank(collector2);
        prints.makePreMintOffer{value: 4 ether}(PHOTO_1, expiry);
        assertEq(collector1.balance - c1Mid, 3 ether);

        // Photographer accepts the pre-mint offer -> atomically mints 1/1 NFT to Collector2 and pays photographer 97.5%
        uint256 shooterBefore = shooter.balance;
        uint256 feeBefore = treasury.balance;
        vm.prank(shooter);
        uint256 tokenId = prints.acceptPreMintOffer(PHOTO_1, 4 ether);

        assertEq(prints.ownerOf(tokenId), collector2);
        assertEq(prints.tokenIdOfHash(PHOTO_1), tokenId);
        // 4 ether - 2.5% (0.1 ether) = 3.9 ether to shooter
        assertEq(treasury.balance - feeBefore, 0.1 ether);
        assertEq(shooter.balance - shooterBefore, 3.9 ether);
    }
}
