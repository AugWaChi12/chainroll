// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ChainRoll} from "./ChainRoll.sol";

/// @title ChainRollPrints — 1/1 On-chain Film Print NFTs & Escrow Offer Market
/// @notice Paris-EVM compatible ERC-721 + ERC-2981 implementation for KUB Chain.
///         Mints verified developed frames from `ChainRoll` as 1-of-1 prints
///         with perpetual photographer royalties, instant Buy Now listings,
///         and an on-chain KUB escrow offer book with pull-payment refund protection.
contract ChainRollPrints is
    IERC721,
    IERC721Metadata,
    ERC2981,
    AccessControl,
    Pausable,
    ReentrancyGuard
{
    // ─── Constants ────────────────────────────────────────────
    uint96 public constant DEFAULT_ROYALTY_BPS = 500; // 5.00% to original photographer
    uint96 public constant MAX_PROTOCOL_FEE_BPS = 500; // capped at 5.00%
    uint256 public constant MIN_OUTBID_BPS = 500; // new offer must beat active offer by >= 5%
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ─── Types ────────────────────────────────────────────────
    struct Print {
        address photographer;
        uint256 rollId;
        uint16 filmId;
        uint8 frame;
        uint64 mintedAt;
        uint128 askPrice; // 0 = not listed for instant buy (still open to offers)
        bytes32 photoHash;
    }

    struct Offer {
        address bidder;
        uint128 amount;
        uint64 expiresAt;
    }

    // ─── ERC-721 Storage ──────────────────────────────────────
    mapping(uint256 tokenId => address) private _owners;
    mapping(address owner => uint256) private _balances;
    mapping(uint256 tokenId => address) private _tokenApprovals;
    mapping(address owner => mapping(address operator => bool)) private _operatorApprovals;

    // ─── Market Storage ───────────────────────────────────────
    ChainRoll public immutable CHAIN_ROLL;
    address public feeRecipient;
    uint96 public protocolFeeBps = 250; // 2.50%
    string public baseTokenURI;

    uint256 public nextTokenId = 1;
    mapping(uint256 tokenId => Print) private _prints;
    mapping(bytes32 photoHash => uint256 tokenId) public tokenIdOfHash;
    mapping(uint256 tokenId => Offer) public highestOfferOf;
    mapping(bytes32 photoHash => Offer) public highestPreMintOfferOf;
    mapping(address account => uint256 amount) public pendingWithdrawals;

    // ─── Events ───────────────────────────────────────────────
    event PrintMinted(
        uint256 indexed tokenId,
        address indexed photographer,
        uint256 indexed rollId,
        uint8 frame,
        uint16 filmId,
        bytes32 photoHash,
        uint128 askPrice
    );
    event AskPriceUpdated(uint256 indexed tokenId, uint128 askPrice);
    event PrintBought(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint128 price,
        uint128 royaltyPaid,
        uint128 feePaid
    );
    event OfferMade(
        uint256 indexed tokenId,
        address indexed bidder,
        uint128 amount,
        uint64 expiresAt
    );
    event OfferCancelled(uint256 indexed tokenId, address indexed bidder, uint128 amount);
    event OfferAccepted(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint128 amount,
        uint128 royaltyPaid,
        uint128 feePaid
    );
    event PreMintOfferMade(
        bytes32 indexed photoHash,
        address indexed bidder,
        uint128 amount,
        uint64 expiresAt
    );
    event PreMintOfferCancelled(
        bytes32 indexed photoHash,
        address indexed bidder,
        uint128 amount
    );
    event PreMintOfferAccepted(
        bytes32 indexed photoHash,
        uint256 indexed tokenId,
        address indexed photographer,
        address buyer,
        uint128 amount,
        uint128 feePaid
    );
    event WithdrawalCredited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event ProtocolFeeUpdated(address indexed recipient, uint96 feeBps);
    event BaseURIUpdated(string baseURI);

    // ─── Errors ───────────────────────────────────────────────
    error ZeroAddress();
    error NonexistentToken(uint256 tokenId);
    error NotAuthorized(address caller, uint256 tokenId);
    error UnsafeRecipient(address to);
    error RollNotDeveloped(uint256 rollId);
    error NotRollOwner(uint256 rollId);
    error InvalidFrame(uint8 frame, uint8 framesUsed);
    error UnrecordedPhotoHash(bytes32 photoHash);
    error HashOriginMismatch(
        uint256 expectedRollId, uint8 expectedFrame, uint256 actualRollId, uint8 actualFrame
    );
    error PrintAlreadyMinted(bytes32 photoHash, uint256 tokenId);
    error OnlyRouter();
    error NotPrintOwner(uint256 tokenId);
    error OwnerCannotBidOrBuy(uint256 tokenId);
    error NotListedForSale(uint256 tokenId);
    error InsufficientPayment(uint256 required, uint256 sent);
    error OfferTooLow(uint256 minRequired, uint256 sent);
    error InvalidExpiry(uint64 expiresAt);
    error NoActiveOffer(uint256 tokenId);
    error OfferExpired(uint256 tokenId, uint64 expiresAt);
    error NotOfferBidder(uint256 tokenId);
    error SlippageExceeded(uint128 offerAmount, uint128 minAmount);
    error NothingToWithdraw();
    error FeeTooHigh(uint96 feeBps);
    error TransferFailed();

    modifier onlySdkCallHelperRouter() {
        address router = CHAIN_ROLL.sdkCallHelperRouter();
        if (msg.sender != router || msg.sender == address(0)) revert OnlyRouter();
        _;
    }

    constructor(address admin, address chainRollAddr, address initialFeeRecipient) {
        if (admin == address(0) || chainRollAddr == address(0) || initialFeeRecipient == address(0))
        {
            revert ZeroAddress();
        }
        CHAIN_ROLL = ChainRoll(chainRollAddr);
        feeRecipient = initialFeeRecipient;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ═══ ERC-721 Metadata & Standard ═══════════════════════════

    function name() external pure returns (string memory) {
        return "ChainRoll 1/1 Print";
    }

    function symbol() external pure returns (string memory) {
        return "CRPRINT";
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert NonexistentToken(tokenId);
        if (bytes(baseTokenURI).length == 0) return "";
        return string.concat(baseTokenURI, _toString(tokenId));
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert NonexistentToken(tokenId);
        return owner;
    }

    function approve(address to, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        if (msg.sender != owner && !_operatorApprovals[owner][msg.sender]) {
            revert NotAuthorized(msg.sender, tokenId);
        }
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        if (_owners[tokenId] == address(0)) revert NonexistentToken(tokenId);
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        if (operator == address(0)) revert ZeroAddress();
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) public view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public whenNotPaused {
        address owner = ownerOf(tokenId);
        if (owner != from) revert NotPrintOwner(tokenId);
        if (
            msg.sender != owner && _tokenApprovals[tokenId] != msg.sender
                && !_operatorApprovals[owner][msg.sender]
        ) {
            revert NotAuthorized(msg.sender, tokenId);
        }
        if (to == address(0)) revert ZeroAddress();
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (
                bytes4 retval
            ) {
                if (retval != IERC721Receiver.onERC721Received.selector) {
                    revert UnsafeRecipient(to);
                }
            } catch {
                revert UnsafeRecipient(to);
            }
        }
    }

    // ═══ Mint 1/1 Print ════════════════════════════════════════

    /// @notice Mints a developed frame as a 1/1 ERC-721 print with 5% perpetual royalty to the photographer.
    function mintPrint(uint256 rollId, uint8 frame, bytes32 photoHash, uint128 askPrice)
        external
        returns (uint256)
    {
        return _mintPrint(msg.sender, rollId, frame, photoHash, askPrice);
    }

    function mintPrint(
        uint256 rollId,
        uint8 frame,
        bytes32 photoHash,
        uint128 askPrice,
        address _bitkubNext
    ) external onlySdkCallHelperRouter returns (uint256) {
        return _mintPrint(_bitkubNext, rollId, frame, photoHash, askPrice);
    }

    function _mintPrint(
        address user,
        uint256 rollId,
        uint8 frame,
        bytes32 photoHash,
        uint128 askPrice
    ) internal whenNotPaused returns (uint256 tokenId) {
        if (user == address(0)) revert ZeroAddress();
        ChainRoll.Roll memory roll = CHAIN_ROLL.getRoll(rollId);
        if (roll.owner != user) revert NotRollOwner(rollId);
        if (!CHAIN_ROLL.isDeveloped(rollId)) revert RollNotDeveloped(rollId);
        if (frame == 0 || frame > roll.framesUsed) revert InvalidFrame(frame, roll.framesUsed);
        (uint256 originRollId, uint8 originFrame) = CHAIN_ROLL.shotOrigin(photoHash);
        if (originRollId == 0) revert UnrecordedPhotoHash(photoHash);
        if (originRollId != rollId || originFrame != frame) {
            revert HashOriginMismatch(rollId, frame, originRollId, originFrame);
        }
        if (tokenIdOfHash[photoHash] != 0) {
            revert PrintAlreadyMinted(photoHash, tokenIdOfHash[photoHash]);
        }

        tokenId = nextTokenId++;
        tokenIdOfHash[photoHash] = tokenId;
        _prints[tokenId] = Print({
            photographer: user,
            rollId: rollId,
            filmId: roll.filmId,
            frame: frame,
            mintedAt: uint64(block.timestamp),
            askPrice: askPrice,
            photoHash: photoHash
        });

        _owners[tokenId] = user;
        _balances[user] += 1;
        emit Transfer(address(0), user, tokenId);

        _setTokenRoyalty(tokenId, user, DEFAULT_ROYALTY_BPS);

        emit PrintMinted(tokenId, user, rollId, frame, roll.filmId, photoHash, askPrice);
    }

    // ═══ Listings & Instant Buy ════════════════════════════════

    function setAskPrice(uint256 tokenId, uint128 askPrice) external {
        _setAskPrice(msg.sender, tokenId, askPrice);
    }

    function setAskPrice(uint256 tokenId, uint128 askPrice, address _bitkubNext)
        external
        onlySdkCallHelperRouter
    {
        _setAskPrice(_bitkubNext, tokenId, askPrice);
    }

    function _setAskPrice(address user, uint256 tokenId, uint128 askPrice) internal whenNotPaused {
        if (_owners[tokenId] != user || user == address(0)) revert NotPrintOwner(tokenId);
        _prints[tokenId].askPrice = askPrice;
        emit AskPriceUpdated(tokenId, askPrice);
    }

    function buyPrint(uint256 tokenId) external payable whenNotPaused nonReentrant {
        address seller = _owners[tokenId];
        if (seller == address(0)) revert NotListedForSale(tokenId);
        if (seller == msg.sender) revert OwnerCannotBidOrBuy(tokenId);

        uint128 price = _prints[tokenId].askPrice;
        if (price == 0) revert NotListedForSale(tokenId);
        if (msg.value < price) revert InsufficientPayment(price, msg.value);

        // Refund buyer's own active offer if they had one escrowed
        Offer memory activeOffer = highestOfferOf[tokenId];
        if (activeOffer.bidder == msg.sender && activeOffer.amount > 0) {
            delete highestOfferOf[tokenId];
            _creditOrSend(msg.sender, activeOffer.amount);
        }

        _transfer(seller, msg.sender, tokenId);
        (uint128 royaltyPaid, uint128 feePaid) = _settleSale(tokenId, seller, price);

        uint256 excess = msg.value - price;
        if (excess > 0) {
            _creditOrSend(msg.sender, excess);
        }

        emit PrintBought(tokenId, seller, msg.sender, price, royaltyPaid, feePaid);
    }

    // ═══ Escrow Offers (Make / Cancel / Accept) ════════════════

    function makeOffer(uint256 tokenId, uint64 expiresAt)
        external
        payable
        whenNotPaused
        nonReentrant
    {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert NotListedForSale(tokenId);
        if (owner == msg.sender) revert OwnerCannotBidOrBuy(tokenId);
        if (msg.value == 0 || msg.value > type(uint128).max) revert OfferTooLow(1, msg.value);
        // forge-lint: disable-next-line(block-timestamp)
        if (expiresAt <= block.timestamp) revert InvalidExpiry(expiresAt);

        Offer memory prev = highestOfferOf[tokenId];
        // forge-lint: disable-next-line(block-timestamp)
        bool prevActive = prev.amount > 0 && prev.expiresAt > block.timestamp;
        if (prevActive) {
            uint256 minBid =
                uint256(prev.amount) + (uint256(prev.amount) * MIN_OUTBID_BPS) / BPS_DENOMINATOR;
            if (msg.value < minBid) revert OfferTooLow(minBid, msg.value);
        }

        highestOfferOf[tokenId] =
            Offer({bidder: msg.sender, amount: uint128(msg.value), expiresAt: expiresAt});

        if (prev.amount > 0) {
            _creditOrSend(prev.bidder, prev.amount);
        }

        emit OfferMade(tokenId, msg.sender, uint128(msg.value), expiresAt);
    }

    function cancelOffer(uint256 tokenId) external nonReentrant {
        Offer memory cur = highestOfferOf[tokenId];
        if (cur.bidder != msg.sender || cur.amount == 0) revert NotOfferBidder(tokenId);

        delete highestOfferOf[tokenId];
        _sendValue(msg.sender, cur.amount);

        emit OfferCancelled(tokenId, msg.sender, cur.amount);
    }

    function acceptOffer(uint256 tokenId, uint128 minAmount) external {
        _acceptOffer(msg.sender, tokenId, minAmount);
    }

    function acceptOffer(uint256 tokenId, uint128 minAmount, address _bitkubNext)
        external
        onlySdkCallHelperRouter
    {
        _acceptOffer(_bitkubNext, tokenId, minAmount);
    }

    function _acceptOffer(address seller, uint256 tokenId, uint128 minAmount)
        internal
        whenNotPaused
        nonReentrant
    {
        if (_owners[tokenId] != seller || seller == address(0)) revert NotPrintOwner(tokenId);

        Offer memory cur = highestOfferOf[tokenId];
        if (cur.amount == 0 || cur.bidder == address(0)) revert NoActiveOffer(tokenId);
        // forge-lint: disable-next-line(block-timestamp)
        if (cur.expiresAt <= block.timestamp) revert OfferExpired(tokenId, cur.expiresAt);
        if (cur.amount < minAmount) revert SlippageExceeded(cur.amount, minAmount);

        delete highestOfferOf[tokenId];

        _transfer(seller, cur.bidder, tokenId);
        (uint128 royaltyPaid, uint128 feePaid) = _settleSale(tokenId, seller, cur.amount);

        emit OfferAccepted(tokenId, seller, cur.bidder, cur.amount, royaltyPaid, feePaid);
    }

    // ═══ Pre-Mint Offers (Bid on unminted shots) ═══════════════

    function makePreMintOffer(bytes32 photoHash, uint64 expiresAt)
        external
        payable
        whenNotPaused
        nonReentrant
    {
        uint256 existingId = tokenIdOfHash[photoHash];
        if (existingId != 0) revert PrintAlreadyMinted(photoHash, existingId);
        (uint256 rollId,) = CHAIN_ROLL.shotOrigin(photoHash);
        if (rollId == 0) revert UnrecordedPhotoHash(photoHash);
        if (CHAIN_ROLL.getRoll(rollId).owner == msg.sender) revert OwnerCannotBidOrBuy(0);
        if (msg.value == 0 || msg.value > type(uint128).max) revert OfferTooLow(1, msg.value);
        // forge-lint: disable-next-line(block-timestamp)
        if (expiresAt <= block.timestamp) revert InvalidExpiry(expiresAt);

        Offer memory prev = highestPreMintOfferOf[photoHash];
        // forge-lint: disable-next-line(block-timestamp)
        bool prevActive = prev.amount > 0 && prev.expiresAt > block.timestamp;
        if (prevActive) {
            uint256 minBid =
                uint256(prev.amount) + (uint256(prev.amount) * MIN_OUTBID_BPS) / BPS_DENOMINATOR;
            if (msg.value < minBid) revert OfferTooLow(minBid, msg.value);
        }

        highestPreMintOfferOf[photoHash] =
            Offer({bidder: msg.sender, amount: uint128(msg.value), expiresAt: expiresAt});

        if (prev.amount > 0) {
            _creditOrSend(prev.bidder, prev.amount);
        }

        emit PreMintOfferMade(photoHash, msg.sender, uint128(msg.value), expiresAt);
    }

    function cancelPreMintOffer(bytes32 photoHash) external nonReentrant {
        Offer memory cur = highestPreMintOfferOf[photoHash];
        if (cur.bidder != msg.sender || cur.amount == 0) revert NotOfferBidder(0);

        delete highestPreMintOfferOf[photoHash];
        _sendValue(msg.sender, cur.amount);

        emit PreMintOfferCancelled(photoHash, msg.sender, cur.amount);
    }

    function acceptPreMintOffer(bytes32 photoHash, uint128 minAmount) external returns (uint256) {
        return _acceptPreMintOffer(msg.sender, photoHash, minAmount);
    }

    function acceptPreMintOffer(bytes32 photoHash, uint128 minAmount, address _bitkubNext)
        external
        onlySdkCallHelperRouter
        returns (uint256)
    {
        return _acceptPreMintOffer(_bitkubNext, photoHash, minAmount);
    }

    function _acceptPreMintOffer(address photographer, bytes32 photoHash, uint128 minAmount)
        internal
        whenNotPaused
        nonReentrant
        returns (uint256 tokenId)
    {
        (uint256 rollId, uint8 frame) = CHAIN_ROLL.shotOrigin(photoHash);
        if (rollId == 0) revert UnrecordedPhotoHash(photoHash);

        Offer memory cur = highestPreMintOfferOf[photoHash];
        if (cur.amount == 0 || cur.bidder == address(0)) revert NoActiveOffer(0);
        // forge-lint: disable-next-line(block-timestamp)
        if (cur.expiresAt <= block.timestamp) revert OfferExpired(0, cur.expiresAt);
        if (cur.amount < minAmount) revert SlippageExceeded(cur.amount, minAmount);

        delete highestPreMintOfferOf[photoHash];

        tokenId = _mintPrint(photographer, rollId, frame, photoHash, 0);
        _transfer(photographer, cur.bidder, tokenId);
        (, uint128 feePaid) = _settleSale(tokenId, photographer, cur.amount);

        emit PreMintOfferAccepted(
            photoHash, tokenId, photographer, cur.bidder, cur.amount, feePaid
        );
    }

    function withdrawPending() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        _sendValue(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ═══ Views ═════════════════════════════════════════════════

    function getPrint(uint256 tokenId) external view returns (Print memory) {
        return _prints[tokenId];
    }

    // ═══ Admin ═════════════════════════════════════════════════

    function setProtocolFee(address recipient, uint96 feeBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (feeBps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh(feeBps);
        feeRecipient = recipient;
        protocolFeeBps = feeBps;
        emit ProtocolFeeUpdated(recipient, feeBps);
    }

    function setBaseURI(string calldata newBaseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ═══ Internal Settlement & Pull-Fallback ═══════════════════

    function _transfer(address from, address to, uint256 tokenId) internal {
        delete _tokenApprovals[tokenId];
        _PrintsClearAsk(tokenId);

        // If recipient had an active escrowed offer on this token (e.g. direct transferFrom),
        // automatically refund their escrowed KUB so it is never stranded.
        Offer memory activeOffer = highestOfferOf[tokenId];
        if (activeOffer.bidder == to && activeOffer.amount > 0) {
            delete highestOfferOf[tokenId];
            _creditOrSend(to, activeOffer.amount);
        }

        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function _PrintsClearAsk(uint256 tokenId) internal {
        _prints[tokenId].askPrice = 0;
    }

    function _settleSale(uint256 tokenId, address seller, uint128 price)
        internal
        returns (uint128 royaltyPaid, uint128 feePaid)
    {
        (address royaltyReceiver, uint256 royaltyAmount) = royaltyInfo(tokenId, price);
        if (royaltyReceiver != seller && royaltyAmount > 0) {
            // royaltyAmount <= price (uint128)
            // forge-lint: disable-next-line(unsafe-typecast)
            royaltyPaid = uint128(royaltyAmount);
            _creditOrSend(royaltyReceiver, royaltyPaid);
        }

        // fee <= 5% of price (uint128)
        // forge-lint: disable-next-line(unsafe-typecast)
        feePaid = uint128((uint256(price) * protocolFeeBps) / BPS_DENOMINATOR);
        if (feePaid > 0) {
            _creditOrSend(feeRecipient, feePaid);
        }

        uint256 sellerProceeds = uint256(price) - royaltyPaid - feePaid;
        _sendValue(seller, sellerProceeds);
    }

    function _creditOrSend(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount, gas: 30_000}("");
        if (!ok) {
            pendingWithdrawals[to] += amount;
            emit WithdrawalCredited(to, amount);
        }
    }

    function _sendValue(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            // forge-lint: disable-next-line(unsafe-typecast)
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(IERC165, ERC2981, AccessControl)
        returns (bool)
    {
        return interfaceId == type(IERC721).interfaceId
            || interfaceId == type(IERC721Metadata).interfaceId
            || super.supportsInterface(interfaceId);
    }
}
