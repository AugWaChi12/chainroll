// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ChainRoll} from "../src/ChainRoll.sol";
import {ChainRollPrints} from "../src/ChainRollPrints.sol";

/// @notice Deploy ChainRoll + ChainRollPrints (1/1 Print NFT & Escrow Offer Market) + seed launch film stocks.
///
/// Env (all optional):
///   ADMIN        final admin/curator & feeRecipient (default: deployer). Deployer renounces if different.
///   NEXT_ROUTER  Bitkub NEXT sdkCallHelperRouter for this network (settable later by admin).
///
/// Usage (key stays in an encrypted keystore — never in .env):
///   cast wallet import chainroll-deployer --interactive
///   forge script script/Deploy.s.sol --rpc-url kub_testnet --account chainroll-deployer --broadcast
contract Deploy is Script {
    function run() external returns (ChainRoll cam, ChainRollPrints prints) {
        address router = vm.envOr("NEXT_ROUTER", address(0));

        vm.startBroadcast();
        address deployer = msg.sender;
        address admin = vm.envOr("ADMIN", deployer);

        cam = new ChainRoll(deployer, router);
        prints = new ChainRollPrints(admin, address(cam), admin);

        // Launch stocks — names are ours, not real film brands.
        cam.setFilm(1, "KUB 400", 24, true);
        cam.setFilm(2, unicode"ขาวดำ 400", 24, true);
        cam.setFilm(3, "Night 800", 24, true);

        if (admin != deployer) {
            cam.grantRole(cam.DEFAULT_ADMIN_ROLE(), admin);
            cam.grantRole(cam.CURATOR_ROLE(), admin);
            cam.renounceRole(cam.CURATOR_ROLE(), deployer);
            cam.renounceRole(cam.DEFAULT_ADMIN_ROLE(), deployer);
        }
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeAddress(key, "admin", admin);
        vm.serializeAddress(key, "sdkCallHelperRouter", router);
        vm.serializeUint(key, "blockNumber", block.number);
        vm.serializeAddress(key, "chainRollPrints", address(prints));
        string memory json = vm.serializeAddress(key, "chainRoll", address(cam));
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console.log("ChainRoll:      ", address(cam));
        console.log("ChainRollPrints:", address(prints));
        console.log("admin/treasury: ", admin);
        console.log("router:         ", router);
        console.log("written:        ", path);
    }
}
