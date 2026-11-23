# ChainRoll — Project Brief & Build Prompt

> ชื่อชั่วคราว เปลี่ยนได้ — ใช้ไฟล์นี้เป็น prompt หลักทุกครั้งที่ให้ AI (หรือคน) ลงมือเขียนโค้ด
> Target launch: **14 ธ.ค. 2026** (พร้อม KUB Chain Zurich Hard Fork)

---

## 1. One-liner

กล้องฟิล์มบนเว็บ (PWA) — **ถ่าย 1 แชะ → ใส่โทนฟิล์ม → บันทึกลง KUB Chain 1 tx**
มีม้วนฟิล์มจำกัดรูป, ต้อง "ล้างฟิล์ม" ก่อนดูรูป, เลือกโพสต์ลง feed ได้

## 2. Core loop

```
เปิดแอป → เลือกม้วน (โทน) → ถ่าย (เหลือ 23/24) → tx: shoot(hash)
        → ครบม้วน → กด "ล้างฟิล์ม" → tx: develop(rollId) → รอ ~1 ชม.
        → ได้ contact sheet → เลือกรูป → Post ลง feed (opt-in) / Mint NFT (optional)
        → พรุ่งนี้ได้ม้วนฟรีใหม่ → streak
```

## 3. Scope

### MVP (ต้องทันวันที่ 14 ธ.ค.)
- [ ] กล้องในเว็บ (มือถือเป็นหลัก) + film emulation 3 โทน
- [ ] Connect wallet + `shoot()` บันทึก hash ลงเชน
- [ ] ม้วนฟรีวันละ 1 ม้วน (24 รูป) + ตัวนับรูป
- [ ] Gallery ส่วนตัว (แสดงแบบ contact sheet)
- [ ] Post ลง feed (opt-in) + like + report
- [ ] **หน้า Admin (Darkroom Console)** — ดูข้อ 8

### Phase 2
- ล้างฟิล์มแบบรอเวลา, ม้วน limited (ERC-1155), streak rewards
- Gasless ผ่าน paymaster / relayer
- Mint รูปเป็น NFT (ตอนนี้เท่านั้นที่ขึ้น IPFS)

### Out of scope
- เก็บรูปบนเชน, เก็บทุกรูปบน IPFS, แชท, วิดีโอ

---

## 4. Tech stack

| Layer | เลือกใช้ |
|---|---|
| Repo | pnpm workspaces + Turborepo (ดูข้อ 10) |
| Frontend | Next.js 16 (App Router, Turbopack) + TypeScript strict + Tailwind CSS v4 |
| UI | `packages/ui`: Radix UI (headless) + tokens ของเรา, Lucide icons, Storybook, TanStack Table, Recharts |
| Data / State | Drizzle ORM, TanStack Query, `nuqs` (URL state), zod ทุกขอบระบบ, next-intl (th/en) |
| Quality | Vitest, Playwright + axe, ESLint (boundaries), Sentry |
| Web3 | wagmi + viem (MetaMask / injected) **+ Bitkub NEXT ผ่าน `@bitkub-chain/sdk.js`** — ดูข้อ 5.1 |
| Camera / Filter | `getUserMedia` + WebGL2 fragment shader (3D LUT + grain + halation + vignette) |
| Contract | Solidity `0.8.2x`, Foundry, `evmVersion: cancun` *(ยืนยัน opcode ที่ Zurich รองรับก่อน deploy)* |
| DB / Auth | Supabase (Postgres + RLS), session เดียวกันไม่ว่า login ทางไหน (SIWE หรือ Bitkub NEXT OAuth) |
| Storage | Cloudflare R2 (รูป WebP ≤ 300KB + thumbnail) |
| Moderation | NSFW classifier API + report queue |
| Deploy | Vercel / Cloudflare Pages |

## 5. Smart contract

> โค้ดจริง: `packages/contracts/src/ChainRoll.sol` · test: `test/ChainRoll.t.sol` (26 tests + fuzz)

```solidity
// เก็บแค่ hash ไม่เก็บรูป · ทุก action มี 2 ทางเข้า
// 1) ผู้ใช้ = msg.sender (MetaMask)
// 2) เรียกผ่าน Bitkub NEXT sdkCallHelperRouter, ผู้ใช้จริงอยู่ใน arg ตัวท้าย `_bitkubNext`
function claimDailyRoll(uint16 filmId) external returns (uint256 rollId);
function claimDailyRoll(uint16 filmId, address _bitkubNext) external onlySdkCallHelperRouter returns (uint256);
function shoot(uint256 rollId, bytes32 photoHash) external;
function shoot(uint256 rollId, bytes32 photoHash, address _bitkubNext) external onlySdkCallHelperRouter;
function develop(uint256 rollId) external;
function develop(uint256 rollId, address _bitkubNext) external onlySdkCallHelperRouter;

event RollClaimed(address indexed owner, uint256 indexed rollId, uint16 indexed filmId, uint8 frames);
event Shot(address indexed shooter, uint256 indexed rollId, uint8 frame, bytes32 photoHash, uint16 filmId);
event Developed(address indexed owner, uint256 indexed rollId, uint64 readyAt);

// views: getFilm, getRoll, canClaim, nextClaimAt, isDeveloped, hashUsed, currentDay
// admin: setFilm (CURATOR), setSdkCallHelperRouter / setDevelopDelay / pause / unpause (ADMIN)
```
- กติกา: ม้วนฟรีวันละ 1 (รีเซ็ต 00:00 เวลาไทย), จำนวนรูปถูก snapshot ตอนรับม้วน, hash ซ้ำไม่ได้, ล้างได้เมื่อครบม้วน (default รอ 1 ชม.)
- MetaMask กับ Bitkub NEXT ใช้โควตาร่วมกันต่อ address
- Gas (จาก `forge test --gas-report`): `shoot` ≈ 55k · `claimDailyRoll` ≈ 79k · `develop` ≈ 26–34k
- OpenZeppelin 5.6 (`AccessControl`, `Pausable`), Solidity 0.8.30, `evm_version = cancun` *(ยืนยันกับ Zurich ก่อน mainnet)*
- ไม่ต้องใช้ reentrancy guard — contract ไม่รับ/ส่งเงิน และไม่เรียก contract ภายนอก
- ABI → TS: `pnpm --filter @chainroll/contracts build` → `import { chainRollAbi, chainRollAddress } from '@chainroll/contracts'`
- Deploy: `forge script script/Deploy.s.sol --rpc-url kub_testnet --account <keystore> --broadcast` (key อยู่ใน keystore เข้ารหัส ไม่อยู่ใน .env)

## 5.1 Login & Wallet

ปุ่ม "เชื่อมกระเป๋า" เปิด sheet ให้เลือก 2 ทาง — **Bitkub NEXT อยู่บนสุด** (คนไทยส่วนใหญ่มีอยู่แล้ว)

| | Bitkub NEXT | MetaMask / injected |
|---|---|---|
| วิธี login | OAuth: `login()` เปิดหน้าต่าง Bitkub NEXT → redirect กลับ `/oauth/callback` → server แลก code เป็น token → ได้ wallet address | SIWE: เซ็นข้อความ → server verify |
| ยิง tx | ผ่าน NEXT SDK (ผู้ใช้กดยืนยันในแอป Bitkub NEXT) | wagmi `writeContract` |
| เหมาะกับ | มือใหม่ ไม่ต้องจำ seed phrase | สาย crypto |

**ข้อกำหนด**
- ทั้งสองทางจบที่ **session เดียวกัน** ผูกกับ `wallet address` — โค้ดฝั่งแอปห้ามแยกตรรกะตามชนิดกระเป๋า ให้ผ่าน interface กลาง:
  ```ts
  interface WalletAdapter {
    kind: 'bitkub-next' | 'injected'
    address: `0x${string}`
    shoot(rollId: bigint, photoHash: `0x${string}`): Promise<TxResult>
    claimDailyRoll(filmId: number): Promise<TxResult>
    develop(rollId: bigint): Promise<TxResult>
  }
  ```
- เก็บ `wallet_kind` ใน `users` ไว้ดูสถิติในหน้า admin
- OAuth client secret / token exchange ทำฝั่ง server (`/api/auth/bitkub-next/callback`) เท่านั้น
- Chain (Whitepaper V5.2): mainnet `96`, RPC `https://rpc.kubchain.io` (สำรอง `rpc.bitkubchain.io`), block 3s, gas ขั้นต่ำ 25 Gwei · testnet `25925`, RPC `https://rpc-testnet.bitkubchain.io` (โดเมนใหม่ `rpc-testnet.kubchain.io` ยังไม่ตอบ ณ 22 พ.ย.) · L2 mainnet `9601` / L2 testnet `259251` · explorer `www.kubscan.com` / `testnet.kubscan.com` (bkcscan.com redirect มาที่นี่)

**ต้องเช็คก่อนเขียน contract (สำคัญ)**
- [ ] สมัคร KUB Developer Console + ขอสิทธิ์ mainnet ของ NEXT SDK (ต้องกรอกฟอร์มและรอติดต่อกลับ — **ทำทันที** เพราะอาจใช้เวลา)
- [x] tx จาก Bitkub NEXT ผ่าน `sdkCallHelperRouter` (`msg.sender` = router) และส่งผู้ใช้จริงเป็น arg ตัวท้าย `address _bitkubNext` — contract รองรับแล้ว (ข้อ 5). ฝั่งเว็บเรียกด้วย `sdk.sendCustomTx(contract, "shoot(uint256 rollId, bytes32 photoHash, address _bitkubNext)", [rollId, hash])`
- [ ] ยืนยัน address ของ router: testnet ตาม docs คือ `0x96f4C25E4fEB02c8BCbAdb80d0088E0112F728Bc` (docs เตือนให้ยืนยันเอง), **mainnet ยังไม่มีใน docs** — ตั้งค่าได้ทีหลังด้วย `setSdkCallHelperRouter`
- [~] ค่า gas ของผู้ใช้ Bitkub NEXT: SDK มี `getUserQuota()` → `{ currentFree, limitFree, currentPaid }` แปลว่ามีโควตา tx ฟรีต่อผู้ใช้ — ต้องยืนยันตัวเลขกับทีม KUB

---

## 6. Data model (Supabase)

```
users      (address PK, wallet_kind, handle, avatar_url, streak, banned_at, created_at)
films      (id, name, lut_url, frames, is_limited, supply, season, active)
rolls      (id, owner, film_id, frames_used, developed_at, ready_at)
shots      (id, roll_id, frame, photo_hash, r2_key, tx_hash, created_at)
posts      (id, shot_id, caption, visibility, like_count, hidden_at)
likes      (post_id, user, created_at)
reports    (id, post_id, reporter, reason, status, resolved_by)
admin_log  (id, actor, action, target, payload jsonb, created_at)
```
- RLS: ผู้ใช้เห็นเฉพาะรูปตัวเอง ยกเว้นที่โพสต์แล้ว
- `photo_hash = keccak256(webp bytes)` — ใช้ยืนยันว่ารูปใน R2 ตรงกับบนเชน

---

## 7. หน้าเว็บฝั่งผู้ใช้ (Information Architecture)

```
🌐 สาธารณะ (ไม่ต้องเชื่อมกระเป๋า)
   /                 Landing
   /feed             ฟีดรูปที่โพสต์ (ดูได้ทุกคน; like/โพสต์ต้องเชื่อมกระเป๋า)   ← M4 (ต้องใช้ server)
   /p/[id]           รูปเดี่ยว + OG image สำหรับแชร์ (หน้าดึงคนใหม่)             ← M4
   /u/[address]      โปรไฟล์ช่างภาพ (เริ่มที่ address, เพิ่ม /@handle ทีหลัง)    ← M4
   /films            แคตตาล็อกฟิล์ม พร้อมตัวอย่างโทนจริงจาก shader
   /how-it-works     ทำงานยังไง · ค่า gas · ความเป็นส่วนตัว
   /privacy          PDPA
📷 ของฉัน (ต้องเชื่อมกระเป๋า)
   /camera           กล้อง (เต็มจอ, ไม่มีเมนู)
   /darkroom         ห้องมืด — ม้วนทั้งหมดของฉัน
   /darkroom/[roll]  contact sheet + ตัวจับเวลาล้างฟิล์ม
   /post/new · /activity · /settings                                      ← หลังเปิดตัว
🛠 /admin/*          Darkroom Console (ข้อ 8)
⚙ /oauth/callback · 404 · offline
```

**เมนู:** มือถือ = แถบล่าง `ฟีด · ฟิล์ม · ( ◉ กล้อง ) · ห้องมืด · วิธีใช้` / คอม = แถบบน. หน้ากล้องไม่มีเมนู.

**วงจรผู้ใช้:** ลิงก์ /p/[id] ที่เพื่อนแชร์ → "ถ่ายรูปของคุณ" → /camera → เชื่อมกระเป๋า → รับม้วน (tx) → 24 แชะ (24 tx) → ส่งล้าง (tx) → รอ → /darkroom/[roll] → เลือกรูป → โพสต์ → แชร์ต่อ ↺

**การตัดสินใจ (22 พ.ย.):**
1. **Latent image** — รูปถูกซ่อนจนกว่าจะล้างเสร็จ เห็นแค่กรอบมืด + เลขเฟรม + สถานะบนเชน (รูปจริงอยู่ใน IndexedDB ในเครื่องเสมอ เป็นการซ่อนทาง UX)
2. `/` เป็น Landing เสมอ (CTA เปลี่ยนตามสถานะ) — ไม่ redirect เพื่อไม่ให้หน้ากระพริบ
3. โปรไฟล์ใช้ `/u/0x…` ก่อน
4. Feed เปิดให้ดูโดยไม่ต้องเชื่อมกระเป๋า
5. ห้องมืดรวมม้วนจาก: ม้วนล่าสุดบนเชน (`latestRollOf`) + ม้วนที่เคยถ่ายในเครื่องนี้ (IndexedDB) — ม้วนเก่าจากเครื่องอื่นจะมาครบเมื่อมี indexer (M3b)

---

## 8. หน้าจัดการ — "Darkroom Console" (`/admin`)

> ทำให้ดีที่สุดในโปรเจกต์ — คนดูแลต้องใช้ทุกวัน ต้องเร็ว อ่านง่าย ไม่ต้องเดา

**Layout:** sidebar ซ้ายแคบ (ไอคอน + label) · topbar มี search ทั่วระบบ (`⌘K`) · เนื้อหาเป็นตาราง/การ์ดหนาแน่นแบบเครื่องมือมืออาชีพ ไม่ใช่ landing page

### 8.1 Overview
- KPI แถวบน: แชะวันนี้, tx สำเร็จ / fail, ผู้ใช้ active, โพสต์ใหม่, report รอตรวจ
- กราฟ tx ต่อชั่วโมง 7 วัน (line) + แยกตามม้วนฟิล์ม (stacked bar)
- **Relayer wallet**: ยอด KUB คงเหลือ, burn rate/วัน, "เหลือพอใช้อีก X วัน" — ขึ้นแถบเตือนสีแดงเมื่อ < 3 วัน
- Feed กิจกรรมล่าสุด (real-time)

### 8.2 Moderation queue
- คิวรูปที่ถูก report + ที่ AI flag (มี confidence score)
- คีย์ลัด: `J/K` เลื่อน, `A` อนุมัติ, `H` ซ่อน, `B` แบนผู้ใช้ — ทำงานได้โดยไม่แตะเมาส์
- ทุก action ต้องมีเหตุผล + บันทึกลง `admin_log` + undo ได้ 10 วินาที

### 8.3 Film stocks (จัดการม้วนฟิล์ม)
- รายการม้วน: ชื่อ, preview โทน, จำนวนรูป/ม้วน, supply, ช่วงเวลาเปิด, active
- **Editor:** อัปโหลด `.cube` LUT, ปรับ grain / halation / vignette ด้วย slider, **preview สดบนรูปตัวอย่าง 4 รูป** (คน / กลางคืน / ธรรมชาติ / ในร่ม) แบบ before–after
- ปุ่ม "Publish" → เรียก `setFilm()` บนเชน + แสดงสถานะ tx

### 8.4 Users
- ค้นหาด้วย address / handle, ดูประวัติแชะ, โพสต์, report ที่เคยโดน
- แบน / ปลดแบน, รีเซ็ต streak, ให้ม้วนพิเศษ

### 8.5 Gas & quota
- ตั้งค่า: ม้วนฟรีต่อวัน, จำนวน tx gasless ต่อ user/วัน, งบ relayer ต่อวัน
- ตาราง top spenders (กันบอท) + ปุ่ม rate-limit

### 8.6 Contract
- สถานะ contract, address, version, role ทั้งหมด
- ปุ่ม Pause / Unpause (ต้องพิมพ์ยืนยันชื่อ contract)

### 8.7 Audit log
- ทุก action ของ admin: ใคร ทำอะไร กับอะไร เมื่อไร — filter ได้, export CSV

**สิทธิ์:** `admin` (ทุกอย่าง) · `moderator` (8.2, 8.4) · `curator` (8.3) — เช็คทั้ง server และ on-chain role

---

## 9. UX/UI — "Enterprise ที่ถ่ายเป็นฟิล์ม"

### 9.0 หลักคิด: สองโหมด
| | **Analog mode** | **Studio mode** |
|---|---|---|
| ใช้ที่ | หน้ากล้อง, ล้างฟิล์ม, contact sheet | feed, profile, settings, **admin ทั้งหมด** |
| ความรู้สึก | กล้องจริง สัมผัสได้ มีเสียง มี grain | สะอาด แม่น หนาแน่น เชื่อถือได้ แบบเครื่องมือมืออาชีพ |
| ฟิล์มอยู่ตรงไหน | ทุกอย่าง | **รายละเอียด** — เลขเฟรม, ขอบ rebate, ตัว mono, กระดาษ, สีส้ม/แดง |

กติกา: **ฟิล์มเป็นเครื่องปรุง ไม่ใช่จานหลัก** นอกหน้ากล้อง — ระบบต้องใช้งานง่ายเหมือน Linear / Stripe Dashboard แต่จำได้ว่าเป็นแอปเรา

### 9.1 Design tokens (อยู่ใน `packages/ui/tokens`)
**Color — semantic เท่านั้น** (component ห้ามอ้าง hex ตรง)
```css
/* primitives */
--paper-50:#F7F4EE; --paper-100:#F2EDE4; --paper-200:#E6DFD2; --paper-300:#D9D2C5;
--ink-500:#8A8178;  --ink-700:#4A443E;  --ink-900:#1A1714;  --ink-950:#0E0C0B;
--safelight-500:#D23A1E; --amber-400:#E8A33D;
--green-600:#2F7D4F; --yellow-600:#B7791F; --red-600:#B42318; --blue-600:#2D5BD0;

/* semantic (light) — dark สลับ paper↔ink */
--bg:            var(--paper-100);
--bg-raised:     var(--paper-50);
--bg-sunken:     var(--paper-200);
--fg:            var(--ink-900);
--fg-muted:      var(--ink-500);
--border:        var(--paper-300);
--accent:        var(--safelight-500);   /* action หลักเท่านั้น */
--frame:         var(--amber-400);       /* เลขเฟรม, highlight ฟิล์ม */
--success/--warning/--danger/--info:     green/yellow/red/blue-600
--focus-ring:    var(--blue-600);
```
- ตรวจ contrast ทุกคู่ fg/bg ≥ 4.5:1 (ข้อความ) และ ≥ 3:1 (UI) — มี test อัตโนมัติ

**Fonts (22 พ.ย.):** หัวข้อ **Bricolage Grotesque** (weight 600, ตัวชิดเฉพาะภาษาอังกฤษ) · เนื้อหา **Geist** · ตัวเลข/ขอบฟิล์ม **Geist Mono** · ภาษาไทยทุกจุดตกไปที่ **Anuphan** (ไทยไม่มีหัว ทันสมัย เข้ากับ grotesk) — ห้ามใส่ letter-spacing ติดลบกับข้อความไทย

**Type scale** (1.200, base 15px สำหรับไทยอ่านสบาย)
`12 · 13 · 15 · 18 · 22 · 26 · 32 · 44 · 64` — display ใช้ serif, UI ใช้ sans, ตัวเลข/hash/เลขเฟรมใช้ mono `tabular-nums`

**Spacing** 4px grid: `0 2 4 8 12 16 24 32 48 64 96`
**Radius** `0 · 2 · 4 · 8(sheet/dialog เท่านั้น) · full(avatar, shutter)`
**Elevation** ใช้เส้น 1px + พื้นต่างระดับ เงาใช้แค่ popover/dialog (`0 8px 24px rgb(0 0 0 / .12)`)
**Motion** `fast 120ms · base 200ms · slow 320ms`, `ease-out` เข้า / `ease-in` ออก, เคารพ `prefers-reduced-motion`
**Density** admin มี `comfortable` / `compact` (row 44px / 32px) จำค่าต่อผู้ใช้

### 9.2 Component inventory (`packages/ui`, มี Storybook ทุกตัว)
- **Primitives** (บน Radix UI headless + styling ของเราเอง ไม่ใช้หน้าตา default ของ library ใดๆ): Button, IconButton, Input, Textarea, Select, Combobox, Checkbox, Switch, Slider, Tabs, Dialog, Sheet, Popover, Tooltip, DropdownMenu, Toast, Badge, Avatar, Skeleton
- **Data**: DataTable (TanStack Table: sort, filter, column visibility, bulk select, virtualized, URL-synced state), KPIStat, Sparkline, Chart (line/bar), EmptyState, Pagination, FilterBar, DateRangePicker
- **App shell**: Sidebar (collapsible), Topbar, CommandPalette (`⌘K`), Breadcrumbs, PageHeader (title + actions + tabs)
- **Film-specific**: FrameCounter `07/24`, FilmStrip (loading/scroll), ContactSheet, RebateLabel `▸ 07A`, TxHash (ตัดกลาง + copy + ลิงก์ explorer), FilmCard, DevelopReveal, ShutterButton
- **Web3**: ConnectWalletSheet, WalletBadge, **TxStatus** (ดู 9.4), NetworkGuard

### 9.3 State ที่ทุกหน้าต้องมี (ไม่มี = ยังไม่เสร็จ)
| State | แนวทาง |
|---|---|
| Loading | skeleton ตามรูปทรงจริง (ไม่ใช่ spinner กลางจอ); โหลดนาน > 1s ใช้ FilmStrip |
| Empty | บอกว่าทำไมว่าง + action ถัดไป เช่น "ยังไม่มีม้วน — รับม้วนฟรีวันนี้" |
| Error | บอกสาเหตุเป็นภาษาคน + ปุ่ม retry + error id ให้แจ้ง support |
| Offline | banner บาง + ถ่ายต่อได้ (เข้าคิว ดู 9.5) |
| No permission | หน้า admin บอก role ที่ต้องมี ไม่ใช่ 404 |
| Partial | ข้อมูลบางส่วนโหลดไม่ได้ แสดงส่วนที่ได้ + แจ้งเฉพาะจุด |

### 9.4 Transaction UX (หัวใจของแอป)
- ทุก tx ผ่าน state machine เดียว: `idle → awaiting-signature → pending → confirmed | failed | replaced`
- **Optimistic**: กดชัตเตอร์แล้วเฟรมขึ้นใน contact sheet ทันที (สถานะ "กำลังบันทึก") — ไม่ให้ผู้ใช้รอเชน
- Toast มุมล่างแสดงสถานะ + TxHash; fail แล้วมีปุ่ม "ลองใหม่" โดยไม่ต้องถ่ายใหม่
- ศูนย์รวม tx (`/activity`) ดูย้อนหลังทั้งหมด
- ข้อความ error ของกระเป๋าแปลเป็นภาษาคน (ปฏิเสธการเซ็น, gas ไม่พอ, ผิด network)

### 9.5 PWA & offline
- ติดตั้งลงหน้าจอได้, เปิดกล้องเร็ว (< 1.5s บนมือถือกลางๆ)
- ถ่ายตอนเน็ตหลุด → เก็บใน IndexedDB → sync (upload + tx) เมื่อกลับมาออนไลน์ — **เหมือนฟิล์มที่ยังไม่ได้ล้างจริงๆ**

### 9.6 Accessibility & i18n
- WCAG 2.2 AA, ทุกอย่างใช้คีย์บอร์ดได้, focus ring ชัด, ARIA ครบ (ทดสอบด้วย axe ใน Playwright)
- ปุ่มชัตเตอร์: Space/Enter, มี label
- ภาษา `th` (หลัก) / `en` ด้วย next-intl — เลือกผ่านปุ่ม TH/EN (เก็บใน cookie `NEXT_LOCALE`), ถ้าไม่เคยเลือก: เบราว์เซอร์ที่มีภาษาไทย → th, อังกฤษล้วน → en · ข้อความของ `packages/ui` ส่งผ่าน `UiLabelsProvider` · มีเทสบังคับว่า th/en มี key และ `{placeholder}` ตรงกัน

### 9.7 Signature (ฟิล์ม)
- เลขเฟรมแบบขอบฟิล์ม `▸ 07A` สีส้มบนพื้นดำ
- grain texture บางๆ (SVG noise ~4%) — **เฉพาะ Analog mode และ hero** ไม่ใส่ในตาราง admin
- ชัตเตอร์: เสียงคลิก + haptic + แฟลชขาว 80ms
- ล้างฟิล์ม: รูปค่อยๆ ปรากฏจากดำ
- Admin: sidebar มีแถบ rebate บางๆ ด้านซ้าย, KPI ใช้เลข mono ใหญ่ — นอกนั้นเรียบ

### 9.8 ❌ ห้ามทำ (ลายเซ็นงาน AI)
- gradient ม่วง-น้ำเงิน, glassmorphism, glow รอบการ์ด
- hero กลางจอ + "Revolutionize your…" + ปุ่มสองปุ่ม
- การ์ด `rounded-2xl` เท่ากันสามคอลัมน์ทุกหน้า, shadow นุ่มทุกอย่าง
- emoji แทนไอคอน (ใช้ Lucide ชุดเดียว stroke 1.5), ไอคอนในวงกลมพาสเทล
- ใช้ Inter ทั้งเว็บ, หน้าตา default ของ component library
- คำฟุ่มเฟือย: "seamless", "unlock", "empower", "next-gen"
- ข้อความ placeholder แบบ lorem / "John Doe" — ใช้ข้อมูลตัวอย่างที่สมจริงเป็นภาษาไทย

### 9.9 ✅ ทำแทน
- มุม `2–4px`, เส้น 1px, layout ไม่สมมาตร, รูปใน feed ขนาดไม่เท่ากัน
- ข้อความสั้น เป็นภาษาคนถ่ายรูป: "ม้วนนี้เหลือ 3 รูป", "ล้างเสร็จแล้ว ไปดูกัน"
- หน้าผู้ใช้ whitespace เยอะ / หน้า admin หนาแน่นอ่านง่าย

---

## 10. Architecture

### 10.1 Monorepo (pnpm workspaces + Turborepo)
```
chainroll/   # (โฟลเดอร์ตอนนี้ชื่อ deeKub)
├─ apps/
│  └─ web/                         # Next.js 16 App Router
│     ├─ src/
│     │  ├─ app/                   # routing อย่างเดียว — บาง, เรียก features
│     │  │  ├─ (marketing)/        # landing
│     │  │  ├─ (app)/              # กล้อง, feed, roll, u, activity
│     │  │  ├─ (admin)/admin/      # Darkroom Console
│     │  │  ├─ oauth/callback/     # Bitkub NEXT redirect
│     │  │  └─ api/                # webhook, cron (indexer), upload-url
│     │  ├─ features/              # ★ แยกตามโดเมน
│     │  │  ├─ camera/             #   viewfinder, shutter, capture pipeline
│     │  │  ├─ film/               #   shaders, LUT, film stock
│     │  │  ├─ roll/               #   claim, contact sheet, develop
│     │  │  ├─ feed/  post/        #   feed, like, report
│     │  │  ├─ wallet/             #   WalletAdapter, bitkub-next, injected, tx machine
│     │  │  ├─ profile/
│     │  │  └─ admin/              #   overview, moderation, films, users, gas, contract, audit
│     │  │     แต่ละ feature มี:  components/ hooks/ actions.ts queries.ts schema.ts index.ts
│     │  ├─ server/                # import 'server-only' เท่านั้น
│     │  │  ├─ db/                 #   Drizzle schema + client
│     │  │  ├─ auth/               #   session, SIWE, bitkub-next OAuth, RBAC
│     │  │  ├─ storage/            #   R2 presigned URL
│     │  │  ├─ chain/              #   viem public client, relayer, indexer
│     │  │  └─ moderation/
│     │  ├─ lib/                   # utils ที่ไม่ผูกโดเมน
│     │  ├─ env.ts                 # ตรวจ env ด้วย zod ตอน boot
│     │  └─ proxy.ts               # guard /admin ตาม role (Next 16: middleware → proxy)
│     ├─ messages/{th,en}.json
│     └─ e2e/                      # Playwright
├─ packages/
│  ├─ contracts/                   # Foundry: src/ test/ script/ + gen ABI → TS (wagmi cli)
│  ├─ ui/                          # design system + tokens + Storybook
│  ├─ shared/                      # zod schemas, types, chain config, constants
│  └─ config/                      # tsconfig, eslint, tailwind preset, prettier
├─ supabase/migrations/            # SQL + RLS policies
├─ docs/                           # PROJECT_BRIEF.md, ADR/
└─ .github/workflows/ci.yml
```

### 10.2 กติกา dependency
```
app/  →  features/  →  server/ | lib/ | packages/*
features/X  ✗→  features/Y/ภายใน   (ใช้ได้แค่ผ่าน features/Y/index.ts)
client component  ✗→  server/       (บังคับด้วย 'server-only' + eslint boundaries)
packages/ui  ✗→  apps/*             (ui ไม่รู้จักโดเมน)
```

### 10.3 Data flow — 1 แชะ
```
[Camera] capture frame
   → WebGL: LUT + grain + halation (client)
   → encode WebP ≤300KB → keccak256(bytes) = photoHash
   → server action: ขอ presigned URL (ตรวจ session, quota, ban)
   → PUT รูปขึ้น R2  (เก็บ private, ยังไม่สาธารณะ)
   → WalletAdapter.shoot(rollId, photoHash)  → tx pending  (optimistic UI)
   → insert shots(status='pending', tx_hash)
[Indexer] (cron ทุก 15s / webhook)
   → อ่าน event Shot จากเชน → update shots(status='confirmed', block)
   → ถ้า hash ไม่ตรงหรือ tx fail → mark failed + แจ้งผู้ใช้
```
- **เชนคือ source of truth** ของ shot/roll; DB เป็น cache ที่สร้างใหม่จาก event ได้
- Post / like / report อยู่ใน DB อย่างเดียว (ไม่ยิง tx) — feed ต้องเร็ว

### 10.4 มาตรฐานโค้ด
- TypeScript `strict`, ห้าม `any`; validate ทุก input ที่ขอบระบบด้วย zod (server action, API, env, ข้อมูลจากเชน)
- Server Components เป็นค่าเริ่มต้น, `'use client'` เฉพาะที่จำเป็น; mutation ใช้ Server Actions
- Data fetching ฝั่ง client: TanStack Query; state ของ URL (filter/sort/page ใน admin) ใช้ `nuqs`
- Error: ทุก action คืน `Result<T, AppError>` ที่มี `code` — UI map `code` → ข้อความไทย
- Logging แบบมีโครงสร้าง + error tracking (Sentry) ทั้ง client/server
- Commit แบบ Conventional Commits, ตัดสินใจใหญ่เขียน ADR ใน `docs/ADR/`

### 10.5 Testing & CI
| ชั้น | เครื่องมือ | ขั้นต่ำ |
|---|---|---|
| Contract | Foundry (unit + fuzz + gas snapshot) | ทุก function + revert path |
| Logic | Vitest | features/*/schema, tx state machine, quota |
| UI | Storybook + visual test | ทุก component ใน `packages/ui` ทุก state |
| E2E | Playwright + axe | ถ่าย→tx→gallery, post→report→moderate, login ทั้ง 2 กระเป๋า (mock) |

CI (GitHub Actions): `lint → typecheck → test → build` ทุก PR; preview deploy ต่อ PR; deploy contract ทำมือผ่าน script เท่านั้น

### 10.6 Security
- RBAC ตรวจ 3 ชั้น: proxy.ts (route) → server action (สิทธิ์) → contract (on-chain role)
- Rate limit ต่อ address + IP (upload, shoot, post, report)
- R2 private; รูปที่โพสต์เสิร์ฟผ่าน URL ที่เซ็นหรือ CDN path แยก
- Relayer key / OAuth secret อยู่ใน server env เท่านั้น, แยก wallet relayer ออกจาก wallet admin
- Admin action สำคัญ (pause, ban, publish film) ต้องยืนยันซ้ำ + บันทึก audit log

## 11. กติกาตอนเขียนโค้ด (สำหรับ AI)
1. อ่านไฟล์นี้ก่อนทุกครั้ง ถ้าขัดกับคำสั่งใหม่ ให้ถามก่อน
2. ใช้ semantic tokens เท่านั้น ห้าม hardcode สี / ขนาด / เงา
3. ทุก component ใช้ได้บนจอ 360px, รองรับ dark mode, มีครบทุก state ในข้อ 9.3
4. ข้อความ UI อยู่ใน `messages/th.json` (และ `en.json`) ห้ามเขียนข้อความลง component ตรงๆ
5. ห้ามเก็บ private key ในโค้ด — secret อยู่ใน server env และผ่าน `env.ts` เท่านั้น
6. เคารพกติกา dependency ข้อ 10.2 — ถ้าต้องฝ่าฝืน ให้เขียน ADR ก่อน
7. ทำทีละ milestone, จบแต่ละอันต้อง `lint + typecheck + test + build` ผ่าน
8. ก่อนสร้าง component ใหม่ เช็ค `packages/ui` ก่อนเสมอ — อย่าสร้างซ้ำ

## 12. Milestones

| # | งาน | เสร็จเมื่อ |
|---|---|---|
| M0 | สมัคร Developer Console + ขอสิทธิ์ NEXT SDK mainnet *(ทำคู่ขนานได้เลย)* | ได้ client id / อนุมัติ |
| M1 | Monorepo + CI + `packages/ui` tokens & primitives + Storybook + app shell | `pnpm dev` รันได้, Storybook มี Button/Input/DataTable |
| M1.5 | Contract + test + deploy testnet | ✅ **KUB testnet: `0x8a4e72D58CBEb5D1be4C24606b76665Dc8712ED5`** (22 พ.ย. 2026, ค่า deploy 0.053 tKUB, evm `paris` เพราะเชนยังไม่รองรับ PUSH0) · admin `0x243d…9350` (keystore `chainroll-deployer`) |
| M2 | กล้อง + filter 3 โทน (ยังไม่ต่อเชน) | ✅ กล้อง + WebGL2 film shader 3 โทน + WebP ≤300KB + keccak hash + ม้วน 24 รูป (ทดสอบในเบราว์เซอร์ด้วยรูปจากเครื่อง) · ⏳ ทดสอบกล้องจริงบนมือถือ (`pnpm --filter @chainroll/web dev:https`) · iOS Safari เข้ารหัส WebP ไม่ได้ → ใช้ JPEG แทน |
| M3a | ต่อ wallet + บันทึกลงเชน | ✅ WalletAdapter (MetaMask / Bitkub NEXT SDK / dev wallet), tx state machine, claim → shoot → develop บนเชน, รูปเก็บใน IndexedDB (รีโหลดไม่หาย) · ทดสอบครบวงบน anvil (hash ในแอป = event บนเชน) · ⏳ Bitkub NEXT ยังไม่ได้ทดสอบจริง (รอ Client ID) |
| M3b | Server & Database: Local Docker Postgres 17 + Supabase SQL/RLS + Cloudflare R2 | ✅ **Local Docker Postgres 17 (`chainroll-db` port `5435`, `pnpm db:up`)** + ไฟล์ SQL Schema & RLS (`supabase/migrations/0001_chainroll_schema.sql`) + Seed (`0002_chainroll_seed.sql`) พร้อมใช้งานทันที · ⏳ รอคีย์ Cloud จริงของ Supabase & Cloudflare R2 เมื่อจะขึ้น Production (`chainroll.art`) |
| M4 | Gallery / contact sheet + feed + 1/1 Print NFT & Escrow Offer Market | ✅ โพสต์รูปจาก Contact sheet / Review sheet (`PostComposerModal`), ฟีดสาธารณะแบบไม่สมมาตร (`/feed` + แท็บ `1/1 Prints`), หน้ารูปเดี่ยวพร้อม **1/1 Print NFT & Escrow Offer Book (`PrintMarketPanel`)** + Dynamic OpenGraph Image (`/p/[id]/opengraph-image`), หน้าโปรไฟล์ช่างภาพ & นักสะสม (`/u/[address]` ครบ 3 แท็บ `Shot` / `Collected` / `Offers` + ตั้งชื่อ `@handle` & Bio), ประวัติธุรกรรม (`/activity`), PWA & Offline Queue, และ **ContentShield** (เรนเดอร์ลง `<canvas>`, บล็อกคลิกขวา/ลากรูป/F12) |
| M5 | Darkroom Console (8.1–8.7) | ✅ ครบทั้ง 7 หมวด: Overview, Moderation (คีย์ลัด `J/K/A/H/B` + undo 10s), Film Stocks (`.cube` LUT + WebGL2 preview 4 ฉาก before/after + `setFilm` บนเชน), Users, Gas & Quotas, Contract (`setDevelopDelay`, `setSdkCallHelperRouter`, `grantRole`, Pause/Unpause ยืนยันชื่อ), Audit Log + Command Palette (`⌘K`) + Density switch + 403 On-chain Role Guard |
| M6 | Deploy mainnet หลัง Zurich fork (`chainroll.art`) | 14 ธ.ค. 2026 |

---

## 13. Agent Handoff & Current State Summary (อัปเดตล่าสุด 23 พ.ย. 2026)

> **สำหรับ AI Agent ตัวถัดไปที่เข้ามาทำงานใน Repo นี้:** อ่านสรุปด้านล่างนี้เพื่อเข้าใจสถานะโค้ดปัจจุบันทันทีโดยไม่ต้องไล่เดาใหม่

### 13.1 โดเมนและสภาพแวดล้อม (Environment)
- **Production Domain ที่เลือกแล้ว:** `https://chainroll.art` (ตั้งค่า `metadataBase` ใน `apps/web/src/app/layout.tsx` แล้ว)
- **Local Docker Database (`pnpm db:up`):**
  - Container: `chainroll-db` (`postgres:17-alpine`) รันอยู่ที่ `127.0.0.1:5435` (เลี่ยงพอร์ต `54322` ที่ติด Hyper-V reserved range บน Windows)
  - Connection URL: `postgresql://chainroll:chainroll@127.0.0.1:5435/chainroll`
  - Auto-migrations: เมานต์ `./supabase/migrations` เข้า `/docker-entrypoint-initdb.d` รัน `0001_chainroll_schema.sql` (10 ตาราง + RLS), `0002_chainroll_seed.sql`, และ `0003_pre_mint_offers.sql` (และ `server/db/index.ts` มี `ensurePreMintTable` อัตโนมัติ)
  - **Live DB Sync:** `apps/web/src/server/db/index.ts` และ `apps/web/src/app/api/state/route.ts` (`GET`/`POST /api/state`) เชื่อมข้อมูล `posts`, `profiles`, `prints`, `preMintOffers`, `admin_log`, `rolls`, `shots` กับ PostgreSQL จริงเรียบร้อยแล้ว
  - คำสั่งจัดการ: `pnpm db:up`, `pnpm db:down`, `pnpm db:reset`, `pnpm db:psql`

### 13.2 Smart Contracts (`packages/contracts` — 34 Foundry Tests ผ่านครบ)
1. **`src/ChainRoll.sol`** (Deployed บน KUB Testnet `25925` ที่ `0x8a4e72D58CBEb5D1be4C24606b76665Dc8712ED5`):
   - รองรับทั้งกระเป๋าปกติ (`msg.sender`) และ Bitkub NEXT (`sdkCallHelperRouter` พร้อม trailing `address _bitkubNext`)
   - **Security Patch:** เก็บ `_hashOrigin[photoHash] = (rollId << 8) | frame` และมี `shotOrigin(bytes32 photoHash) returns (uint256 rollId, uint8 frame)` เพื่อผูก `photoHash` เข้ากับ `(rollId, frame)` ใน 1 Storage Slot (ป้องกันการขโมย `photoHash` ข้ามม้วน)
   - **Partial Roll Cut (`developEarly`):** มี `developEarly(uint256 rollId)` (และ overload สำหรับ Bitkub NEXT) ให้เจ้าของม้วนที่ถ่ายไปแล้วอย่างน้อย 1 รูป (`framesUsed > 0`) ตัดม้วนส่งล้างได้โดยไม่ต้องยิงรูปเปล่าให้ครบ 24 รูป
2. **`src/ChainRollPrints.sol`** (1/1 Analog Print NFT & Escrow Offer Market — `evm_version = "paris"` compatible):
   - มาตรฐาน **ERC-721 + ERC-2981 (5% Perpetual Photographer Royalty)** + `Protocol Fee 2.5%` (โอนเข้า `feeRecipient` ของโปรเจกต์อัตโนมัติทุกครั้งที่มีการซื้อขาย)
   - `mintPrint`: ตรวจกับ `CHAIN_ROLL.isDeveloped(rollId)` และ `CHAIN_ROLL.shotOrigin(photoHash)` ว่าตรงกับ `(rollId, frame)` ของผู้เรียกจริง และ Mint ได้เพียง 1 ชิ้นต่อ `photoHash`
   - `setAskPrice` & `buyPrint`: ตั้งราคาขายทันที (หรือตั้ง `0` เพื่อเปิดรับเฉพาะข้อเสนอ) และกดซื้อทันที
   - `makeOffer` / `cancelOffer` / `acceptOffer` / `withdrawPending`: ระบบวางเงิน KUB ค้ำประกันในสัญญา (ต้องเสนอสูงกว่า Offer เดิมอย่างน้อย +5%, มี Pull-payment fallback กันบอท DoS, มี `minAmount` กัน Slippage และคืนเงิน Escrow อัตโนมัติหากโอน NFT ตรงให้ผู้ประมูล)
   - **Pre-Mint Escrow Offer Book:** `makePreMintOffer(photoHash, expiresAt)`, `cancelPreMintOffer(photoHash)`, และ `acceptPreMintOffer(photoHash, minAmount)` (พร้อม Bitkub NEXT overload) ให้ผู้สะสมวาง KUB จีบขอซื้อรูปที่ยังไม่ได้ Mint ได้ และช่างภาพกด Mint + โอน + รับเงิน 97.5% จบใน 1 tx

### 13.3 โมดูลฝั่งเว็บ (`apps/web/src/features/*` — 36 Vitest Tests ผ่านครบ)
- **`features/wallet`:**
  - `WalletProvider` (MetaMask, EIP-6963, WalletConnect v2 พร้อม fast-disconnect timeout 1.2s, Bitkub NEXT, Dev Wallet)
  - `block-watcher.ts`: `waitForNextKubBlock()` จับ Block ใหม่แบบ Real-time จาก KUB Chain RPC และ `getKubBalance(address)` เช็กยอด KUB จริงบนเชนก่อนทำรายการซื้อ/เสนอราคา
- **`features/film`:**
  - WebGL2 Fragment Shader (`shader.ts`, `renderer.ts`), 3D `.cube` LUT Parser (`lut.ts`), **รูปถ่ายฟิล์มตัวอย่างจริง 4 ซีน** (`public/samples/{nature,portrait,night,indoor}.jpg` ที่เกรดสีสดผ่าน WebGL2 ใน `film-preview.tsx` พร้อมโหมดเทียบ `split` + `splitSide`), และหน้าแรกแบบ Interactive Kinetic (`landing-hero.tsx`: 1:1 `RAW ↔ FILM` slider, กดค้างเพื่อล้างฟิล์ม, 3D Tilt Loupe, และสายฟิล์ม 35mm พร้อมภาพตัวอย่างและปุ่มเลื่อนซ้าย-ขวา)
- **`features/camera` & `features/roll` & `features/darkroom`:**
  - `BlockConfirmHud` (`block-confirm-hud.tsx`): หน้าต่างยืนยันบล็อกบนหน้าเว็บสำหรับทุก action (`claim`, `shoot`, `develop`) ที่รอ Block จริงจาก KUB Chain RPC + บันทึกลง `onpage-roll-store.ts` & PostgreSQL (พร้อมตัวเลือกเซ็นผ่านกระเป๋าภายนอก)
  - กล้องถ่ายรูป (`/camera` + ปุ่มลัดไปห้องมืดเมื่อถ่ายแล้ว ≥ 1 รูป), ห้องมืด (`/darkroom`, `/darkroom/[roll]` พร้อมปุ่มตัดม้วนส่งล้าง `developEarly` และนับถอยหลัง 15 วิในโหมดทดสอบ), `/activity`, และ Offline Queue
- **`features/feed`:**
  - ฟีดสาธารณะ (`/feed` พร้อมแท็บ `1/1 Prints (NFT)` และป้าย Pre-Mint Offer), หน้ารูปเดี่ยว (`/p/[id]` + Dynamic OpenGraph Image `/p/[id]/opengraph-image`), แผงตลาด 1/1 Print (`print-market.ts`, `print-market-panel.tsx`, `market-block-hud.tsx`) ที่ **ตรวจยอด KUB จริงบนเชน (`getKubBalance`)**, **รอ Block จริง (`waitForNextKubBlock`)**, และรองรับ **Pre-Mint Offer** ครบวงจร
  - หน้าโปรไฟล์ (`/u/[address]` ครบ 3 แท็บ `Shot` / `Collected` / `Offers` + `@handle` & Bio) และเกราะกันขโมยรูป **`ContentShield`**
- **`features/admin`:**
  - Darkroom Console (`/admin`, `/admin/moderation` คีย์ลัด `J/K/A/H/B` + Undo 10s, `/admin/films` `.cube` LUT Lab + `setFilm` บนเชน, `/admin/users`, `/admin/gas`, `/admin/contract` + Emergency Pause, `/admin/audit` + Export CSV, Command Palette `⌘K`, Density switch, และ 403 On-chain Role Guard)

### 13.4 สิ่งที่ต้องทำต่อเมื่อพร้อมขึ้น Production (Next Steps)
1. **Redeploy สัญญาเวอร์ชันล่าสุดขึ้น KUB Testnet / Mainnet:** รัน `forge script script/Deploy.s.sol --rpc-url kub_testnet --account chainroll-deployer --broadcast` เพื่อเอา `ChainRoll` (ที่มี `shotOrigin` + `developEarly`) และ `ChainRollPrints` (ที่มี `PreMintOffer`) ขึ้นเชนพร้อมกัน แล้วรัน `pnpm --filter @chainroll/contracts build` เพื่ออัปเดต ABI/Addresses
2. **Switch DB & R2 Storage บน Production (`chainroll.art`):** นำ `DATABASE_URL` ของ Supabase Production + `supabase/migrations/0001..0003` ไปใช้แทน Docker Local และต่อ Cloudflare R2 Presigned URL บน `prints.chainroll.art` (แทน Data URL / Local IndexedDB)
3. **Wire Tx Execution จริงใน PrintMarketPanel (หลัง Deploy `ChainRollPrints`):** ต่อ `writeContract` ของ wagmi / Bitkub NEXT router เข้ากับปุ่มใน `print-market-panel.tsx` เพื่อส่ง ETH/KUB value จริงเข้าสัญญา `ChainRollPrints` บน Mainnet/Testnet
