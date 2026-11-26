// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title ChainRoll — on-chain film camera
/// @notice 1 shot = 1 tx. Stores only the photo hash, never the image.
/// @dev Every user action has two entry points:
///      - `fn(args)`                          → user is `msg.sender` (MetaMask / injected wallets)
///      - `fn(args, address _bitkubNext)`     → called by Bitkub NEXT's `sdkCallHelperRouter`,
///        which forwards the real user as the trailing argument (KUB docs: NEXT SDK).
contract ChainRoll is AccessControl, Pausable {
    // ─── Roles ────────────────────────────────────────────────
    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");

    // ─── Config ───────────────────────────────────────────────
    /// @dev Daily rolls reset at 00:00 Asia/Bangkok (UTC+7).
    uint256 public constant DAY_OFFSET = 7 hours;
    uint8 public constant MAX_FRAMES = 72;

    // ─── Types ────────────────────────────────────────────────
    struct Film {
        string name;
        uint8 frames;
        bool active;
    }

    struct Roll {
        address owner;
        uint16 filmId;
        uint8 framesUsed;
        uint8 frames; // snapshot so a later film edit can't change an open roll
        uint64 developReadyAt; // 0 = not sent for developing
    }

    // ─── Storage ──────────────────────────────────────────────
    mapping(uint16 filmId => Film) private _films;
    mapping(uint256 rollId => Roll) private _rolls;
    /// @dev Number of free rolls claimed by `user` on each Bangkok calendar day.
    mapping(address user => mapping(uint256 day => uint8)) private _claimsOnDay;
    /// @dev Packed `(rollId << 8) | frame` where `photoHash` was recorded (0 = unused).
    mapping(bytes32 photoHash => uint256) private _hashOrigin;
    /// @notice Most recent roll claimed by a user (0 = none). Lets the app find the open roll without scanning logs.
    mapping(address user => uint256 rollId) public latestRollOf;
    /// @dev Complete chronological list of roll IDs claimed by `user` for O(1) owner history lookup.
    mapping(address user => uint256[]) private _ownerRolls;

    uint256 public nextRollId = 1;
    address public sdkCallHelperRouter;
    uint64 public developDelay = 1 hours;
    uint8 public dailyRollLimit = 2;

    // ─── Events ───────────────────────────────────────────────
    event FilmSet(uint16 indexed filmId, string name, uint8 frames, bool active);
    event RollClaimed(
        address indexed owner, uint256 indexed rollId, uint16 indexed filmId, uint8 frames
    );
    event Shot(
        address indexed shooter,
        uint256 indexed rollId,
        uint8 frame,
        bytes32 photoHash,
        uint16 filmId
    );
    event Developed(address indexed owner, uint256 indexed rollId, uint64 readyAt);
    event RouterSet(address indexed router);
    event DevelopDelaySet(uint64 delay);
    event DailyRollLimitSet(uint8 limit);

    // ─── Errors ───────────────────────────────────────────────
    error AlreadyClaimedToday(uint256 nextClaimAt);
    error InvalidDailyLimit(uint8 limit);
    error FilmNotActive(uint16 filmId);
    error InvalidFrames(uint8 frames);
    error NotRollOwner(uint256 rollId);
    error RollFull(uint256 rollId);
    error RollNotFull(uint256 rollId, uint8 framesUsed, uint8 frames);
    error EmptyRoll(uint256 rollId);
    error AlreadyDeveloped(uint256 rollId);
    error HashAlreadyUsed(bytes32 photoHash);
    error ZeroHash();
    error OnlyRouter();
    error ZeroAddress();

    modifier onlySdkCallHelperRouter() {
        if (msg.sender != sdkCallHelperRouter || msg.sender == address(0)) revert OnlyRouter();
        _;
    }

    constructor(address admin, address router) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CURATOR_ROLE, admin);
        if (router != address(0)) {
            sdkCallHelperRouter = router;
            emit RouterSet(router);
        }
    }

    // ═══ Claim daily roll ═══════════════════════════════════════

    function claimDailyRoll(uint16 filmId) external returns (uint256) {
        return _claim(msg.sender, filmId);
    }

    function claimDailyRoll(uint16 filmId, address _bitkubNext)
        external
        onlySdkCallHelperRouter
        returns (uint256)
    {
        return _claim(_bitkubNext, filmId);
    }

    // ═══ Shoot ══════════════════════════════════════════════════

    function shoot(uint256 rollId, bytes32 photoHash) external {
        _shoot(msg.sender, rollId, photoHash);
    }

    function shoot(uint256 rollId, bytes32 photoHash, address _bitkubNext)
        external
        onlySdkCallHelperRouter
    {
        _shoot(_bitkubNext, rollId, photoHash);
    }

    // ═══ Develop ════════════════════════════════════════════════

    function develop(uint256 rollId) external {
        _develop(msg.sender, rollId, false);
    }

    function develop(uint256 rollId, address _bitkubNext) external onlySdkCallHelperRouter {
        _develop(_bitkubNext, rollId, false);
    }

    /// @notice Cut and develop a partially-shot roll early (requires at least 1 exposed frame).
    function developEarly(uint256 rollId) external {
        _develop(msg.sender, rollId, true);
    }

    function developEarly(uint256 rollId, address _bitkubNext) external onlySdkCallHelperRouter {
        _develop(_bitkubNext, rollId, true);
    }

    // ═══ Views ══════════════════════════════════════════════════

    function hashUsed(bytes32 photoHash) public view returns (bool) {
        return _hashOrigin[photoHash] != 0;
    }

    /// @notice Exact `(rollId, frame)` where `photoHash` was shot (`(0, 0)` if unused).
    function shotOrigin(bytes32 photoHash) external view returns (uint256 rollId, uint8 frame) {
        uint256 packed = _hashOrigin[photoHash];
        // low 8 bits hold `frame` (1..MAX_FRAMES <= 72)
        // forge-lint: disable-next-line(unsafe-typecast)
        return (packed >> 8, uint8(packed));
    }

    function getFilm(uint16 filmId) external view returns (Film memory) {
        return _films[filmId];
    }

    function getRoll(uint256 rollId) external view returns (Roll memory) {
        return _rolls[rollId];
    }

    /// @notice All roll IDs ever claimed by `user` in chronological order (O(1) single-RPC lookup).
    function getRollsByOwner(address user) external view returns (uint256[] memory) {
        return _ownerRolls[user];
    }

    function currentDay() public view returns (uint256) {
        return (block.timestamp + DAY_OFFSET) / 1 days;
    }

    function claimsToday(address user) public view returns (uint8) {
        return _claimsOnDay[user][currentDay()];
    }

    function canClaim(address user) public view returns (bool) {
        return _claimsOnDay[user][currentDay()] < dailyRollLimit;
    }

    /// @notice Unix time when `user` can claim again (0 = now).
    function nextClaimAt(address user) public view returns (uint256) {
        if (canClaim(user)) return 0;
        return (currentDay() + 1) * 1 days - DAY_OFFSET;
    }

    function isDeveloped(uint256 rollId) external view returns (bool) {
        uint64 readyAt = _rolls[rollId].developReadyAt;
        // Seconds of validator drift don't matter for an hour-scale "developing" delay.
        // forge-lint: disable-next-line(block-timestamp)
        return readyAt != 0 && block.timestamp >= readyAt;
    }

    // ═══ Admin ══════════════════════════════════════════════════

    function setFilm(uint16 filmId, string calldata name, uint8 frames, bool active)
        external
        onlyRole(CURATOR_ROLE)
    {
        if (frames == 0 || frames > MAX_FRAMES) revert InvalidFrames(frames);
        _films[filmId] = Film({name: name, frames: frames, active: active});
        emit FilmSet(filmId, name, frames, active);
    }

    function setSdkCallHelperRouter(address router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        sdkCallHelperRouter = router;
        emit RouterSet(router);
    }

    function setDevelopDelay(uint64 delay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        developDelay = delay;
        emit DevelopDelaySet(delay);
    }

    function setDailyRollLimit(uint8 limit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (limit == 0) revert InvalidDailyLimit(limit);
        dailyRollLimit = limit;
        emit DailyRollLimitSet(limit);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ═══ Internal ═══════════════════════════════════════════════

    function _claim(address user, uint16 filmId) internal whenNotPaused returns (uint256 rollId) {
        if (user == address(0)) revert ZeroAddress();
        if (!canClaim(user)) revert AlreadyClaimedToday(nextClaimAt(user));
        Film storage film = _films[filmId];
        if (!film.active) revert FilmNotActive(filmId);

        _claimsOnDay[user][currentDay()] += 1;
        rollId = nextRollId++;
        latestRollOf[user] = rollId;
        _ownerRolls[user].push(rollId);
        _rolls[rollId] = Roll({
            owner: user, filmId: filmId, framesUsed: 0, frames: film.frames, developReadyAt: 0
        });
        emit RollClaimed(user, rollId, filmId, film.frames);
    }

    function _shoot(address user, uint256 rollId, bytes32 photoHash) internal whenNotPaused {
        if (photoHash == bytes32(0)) revert ZeroHash();
        Roll storage roll = _rolls[rollId];
        if (roll.owner != user || user == address(0)) revert NotRollOwner(rollId);
        if (roll.developReadyAt != 0) revert AlreadyDeveloped(rollId);
        if (roll.framesUsed >= roll.frames) revert RollFull(rollId);
        if (_hashOrigin[photoHash] != 0) revert HashAlreadyUsed(photoHash);

        uint8 frame = ++roll.framesUsed;
        _hashOrigin[photoHash] = (rollId << 8) | uint256(frame);
        emit Shot(user, rollId, frame, photoHash, roll.filmId);
    }

    function _develop(address user, uint256 rollId, bool allowPartial) internal whenNotPaused {
        Roll storage roll = _rolls[rollId];
        if (roll.owner != user || user == address(0)) revert NotRollOwner(rollId);
        if (roll.developReadyAt != 0) revert AlreadyDeveloped(rollId);
        if (allowPartial) {
            if (roll.framesUsed == 0) revert EmptyRoll(rollId);
            roll.frames = roll.framesUsed;
        } else if (roll.framesUsed < roll.frames) {
            revert RollNotFull(rollId, roll.framesUsed, roll.frames);
        }
        uint64 readyAt = uint64(block.timestamp) + developDelay;
        roll.developReadyAt = readyAt;
        emit Developed(user, rollId, readyAt);
    }
}
