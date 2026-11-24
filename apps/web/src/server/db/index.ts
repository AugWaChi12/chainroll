import {
  defaultSceneTags,
  expandVisualQuery,
  tagPhotoWithGemini,
} from '@/server/ai/visual-tagger'
import { chainRollAbi, chainRollAddress } from '@chainroll/contracts'
import postgres, { type Sql } from 'postgres'
import { createPublicClient, http, type Address } from 'viem'

const DEFAULT_DB_URL = 'postgresql://chainroll:chainroll@127.0.0.1:5435/chainroll'

const globalForDb = globalThis as unknown as { __chainrollSql?: Sql }

export function getSql(): Sql {
  if (!globalForDb.__chainrollSql) {
    globalForDb.__chainrollSql = postgres(process.env.DATABASE_URL || DEFAULT_DB_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 5,
    })
  }
  return globalForDb.__chainrollSql
}

export type DbPostDto = {
  id: string
  shooter: string
  handle: string | null
  rollId: number
  frame: number
  filmId: number
  photoHash: string
  txHash?: string
  caption: string
  createdAt: number
  baseLikes: number
  likes: string[]
  imageDataUrl?: string
  scene: 'nature' | 'portrait' | 'night' | 'indoor'
  featured: boolean
  aiTags?: string[]
  reports: {
    reporter: string
    reason: 'nsfw' | 'spam' | 'copyright' | 'harassment'
    note?: string
    createdAt: number
  }[]
}

export type DbProfileDto = {
  address: string
  handle: string | null
  bio: string
  updatedAt: number
}

export type DbPrintDto = {
  tokenId: number
  postId: string
  photoHash: string
  rollId: number
  frame: number
  filmId: number
  photographer: string
  owner: string
  ownerHandle: string | null
  askPriceKub: number | null
  royaltyBps: number
  protocolFeeBps: number
  mintedAt: number
  mintTxHash: string
  lastSaleKub: number | null
  offers: {
    id: string
    bidder: string
    bidderHandle: string | null
    amountKub: number
    createdAt: number
    expiresAt: number
    txHash: string
  }[]
  history: {
    id: string
    kind: 'minted' | 'listed' | 'offer_made' | 'offer_cancelled' | 'offer_accepted' | 'bought'
    actor: string
    actorHandle: string | null
    amountKub?: number
    txHash: string
    timestamp: number
  }[]
}

export type DbAuditDto = {
  id: string
  actor: string
  category: 'moderation' | 'films' | 'users' | 'gas' | 'contract'
  action: string
  target: string
  detail: string
  txHash?: string
  minutesAgo: number
}

export type DbRollDto = {
  id: number
  owner: string
  filmId: number
  frames: number
  framesUsed: number
  developReadyAt: number
  claimTxHash?: string
}

let visualColsPromise: Promise<void> | null = null

async function ensureVisualSearchColumns(sql: Sql): Promise<void> {
  if (!visualColsPromise) {
    visualColsPromise = (async () => {
      await sql`
        ALTER TABLE public.posts
        ADD COLUMN IF NOT EXISTS ai_tags TEXT[] NOT NULL DEFAULT '{}'
      `
      await sql`
        ALTER TABLE public.posts
        ADD COLUMN IF NOT EXISTS ai_description TEXT NOT NULL DEFAULT ''
      `
      await sql`
        ALTER TABLE public.posts
        ADD COLUMN IF NOT EXISTS ai_tagged_at TIMESTAMPTZ
      `
    })().catch((err) => {
      visualColsPromise = null
      throw err
    })
  }
  await visualColsPromise
}

export async function tagAndSavePostVisuals(
  postId: string,
  imageSource: string,
  opts?: { caption?: string; scene?: string },
): Promise<{ tagged: boolean; tags: string[] }> {
  const sql = getSql()
  await ensureVisualSearchColumns(sql)

  const aiResult = imageSource
    ? await tagPhotoWithGemini(imageSource, { caption: opts?.caption })
    : null

  if (aiResult && (aiResult.tags.length > 0 || aiResult.description || aiResult.nsfw)) {
    await sql`
      UPDATE public.posts
      SET ai_tags = ${aiResult.tags},
          ai_description = ${aiResult.description},
          ai_tagged_at = now(),
          hidden_at = CASE WHEN ${aiResult.nsfw} THEN COALESCE(hidden_at, now()) ELSE hidden_at END
      WHERE id = ${postId}
    `
    if (aiResult.nsfw) {
      const note = `AI Auto-Moderation (18+): ${aiResult.nsfwReason ?? 'Explicit content detected'}`
      await sql`
        INSERT INTO public.reports (post_id, reporter, reason, note)
        VALUES (${postId}, '0x0000000000000000000000000000000000000000', 'nsfw', ${note})
      `
    }
    return { tagged: true, tags: aiResult.tags }
  }

  // Zero-token baseline tags from scene if Gemini key is not yet configured
  const fallbackTags = defaultSceneTags(opts?.scene ?? 'nature')
  await sql`
    UPDATE public.posts
    SET ai_tags = CASE WHEN array_length(ai_tags, 1) IS NULL THEN ${fallbackTags} ELSE ai_tags END
    WHERE id = ${postId}
  `
  return { tagged: false, tags: fallbackTags }
}

export async function reindexUntaggedPostsFromDb(opts?: {
  limit?: number
  force?: boolean
}): Promise<{
  geminiConfigured: boolean
  processed: number
  tagged: number
  skipped: number
}> {
  const sql = getSql()
  await ensureVisualSearchColumns(sql)

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim())
  const limit = Math.max(1, Math.min(50, Math.floor(opts?.limit ?? 20)))
  const force = Boolean(opts?.force)

  const rows = force
    ? await sql`
        SELECT id, r2_public_url, caption, scene
        FROM public.posts
        WHERE hidden_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT id, r2_public_url, caption, scene
        FROM public.posts
        WHERE hidden_at IS NULL AND ai_tagged_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${limit}
      `

  let tagged = 0
  let skipped = 0

  // Process 2 at a time to stay friendly on memory & API rate limits
  for (let i = 0; i < rows.length; i += 2) {
    const chunk = rows.slice(i, i + 2)
    await Promise.all(
      chunk.map(async (row) => {
        const id = String(row.id)
        const scene = String(row.scene ?? 'nature')
        const imgSrc = row.r2_public_url ? String(row.r2_public_url) : `/samples/${scene}.jpg`
        const res = await tagAndSavePostVisuals(id, imgSrc, {
          caption: String(row.caption ?? ''),
          scene,
        })
        if (res.tagged) tagged += 1
        else skipped += 1
      }),
    )
  }

  return { geminiConfigured, processed: rows.length, tagged, skipped }
}

export async function fetchVisualIndexStatsFromDb(): Promise<{
  geminiConfigured: boolean
  totalPosts: number
  aiTaggedPosts: number
  untaggedPosts: number
}> {
  const sql = getSql()
  await ensureVisualSearchColumns(sql)
  const rows = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(ai_tagged_at)::int AS tagged
    FROM public.posts
    WHERE hidden_at IS NULL
  `
  const totalPosts = Number(rows[0]?.total ?? 0)
  const aiTaggedPosts = Number(rows[0]?.tagged ?? 0)
  return {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    totalPosts,
    aiTaggedPosts,
    untaggedPosts: Math.max(0, totalPosts - aiTaggedPosts),
  }
}

export type LeaderboardEntryDto = {
  address: string
  handle: string | null
  rollsCount: number
  framesShot: number
  postsCount: number
  totalLikes: number
  printsOwned: number
  printsMinted: number
  favoriteFilmId: number
  signatureImageUrl: string | null
  signaturePostId: string | null
  signatureScene: 'nature' | 'portrait' | 'night' | 'indoor'
}

export type LeaderboardSnapshotDto = {
  totals: {
    photographers: number
    frames: number
    posts: number
    prints: number
    likes: number
  }
  entries: LeaderboardEntryDto[]
}

/**
 * Computes live leaderboard metrics across all photographers & collectors from PostgreSQL.
 */
export async function fetchLeaderboardFromDb(): Promise<LeaderboardSnapshotDto> {
  const sql = getSql()

  const [userRows, rollRows, postRows, likeRows, printRows] = await Promise.all([
    sql`SELECT address, handle FROM public.users`,
    sql`SELECT owner, film_id, frames_used FROM public.rolls`,
    sql`
      SELECT p.id, p.shooter, p.film_id, p.r2_public_url, p.scene, p.like_count, p.created_at
      FROM public.posts p
      WHERE p.hidden_at IS NULL
      ORDER BY p.created_at DESC
    `,
    sql`SELECT post_id FROM public.likes`,
    sql`SELECT photographer, owner FROM public.prints`,
  ])

  const liveLikesByPost = new Map<string, number>()
  for (const l of likeRows) {
    const pid = String(l.post_id)
    liveLikesByPost.set(pid, (liveLikesByPost.get(pid) ?? 0) + 1)
  }

  type Acc = {
    address: string
    handle: string | null
    rollsCount: number
    framesShot: number
    postsCount: number
    totalLikes: number
    printsOwned: number
    printsMinted: number
    filmCounts: Map<number, number>
    bestPostLikes: number
    signatureImageUrl: string | null
    signaturePostId: string | null
    signatureScene: 'nature' | 'portrait' | 'night' | 'indoor'
  }

  const byAddr = new Map<string, Acc>()
  const getOrCreate = (raw: string): Acc => {
    const addr = raw.toLowerCase()
    let acc = byAddr.get(addr)
    if (!acc) {
      acc = {
        address: addr,
        handle: null,
        rollsCount: 0,
        framesShot: 0,
        postsCount: 0,
        totalLikes: 0,
        printsOwned: 0,
        printsMinted: 0,
        filmCounts: new Map(),
        bestPostLikes: -1,
        signatureImageUrl: null,
        signaturePostId: null,
        signatureScene: 'nature',
      }
      byAddr.set(addr, acc)
    }
    return acc
  }

  for (const u of userRows) {
    const acc = getOrCreate(String(u.address))
    if (u.handle) acc.handle = String(u.handle)
  }

  let globalFrames = 0
  for (const r of rollRows) {
    const acc = getOrCreate(String(r.owner))
    const used = Number(r.frames_used ?? 0)
    acc.rollsCount += 1
    acc.framesShot += used
    globalFrames += used
    const fid = Number(r.film_id ?? 1)
    acc.filmCounts.set(fid, (acc.filmCounts.get(fid) ?? 0) + Math.max(1, used))
  }

  let globalLikes = 0
  for (const p of postRows) {
    const acc = getOrCreate(String(p.shooter))
    const pid = String(p.id)
    const likes = Number(p.like_count ?? 0) + (liveLikesByPost.get(pid) ?? 0)
    const fid = Number(p.film_id ?? 1)
    const sceneVal = String(p.scene ?? 'nature')
    const validScene = (
      ['nature', 'portrait', 'night', 'indoor'].includes(sceneVal) ? sceneVal : 'nature'
    ) as LeaderboardEntryDto['signatureScene']

    acc.postsCount += 1
    acc.totalLikes += likes
    globalLikes += likes
    acc.filmCounts.set(fid, (acc.filmCounts.get(fid) ?? 0) + 1)

    const imgUrl = p.r2_public_url ? String(p.r2_public_url) : null
    if (likes > acc.bestPostLikes || (likes === acc.bestPostLikes && imgUrl && !acc.signatureImageUrl)) {
      acc.bestPostLikes = likes
      acc.signatureImageUrl = imgUrl
      acc.signaturePostId = pid
      acc.signatureScene = validScene
    }
  }

  for (const pr of printRows) {
    const ownerAcc = getOrCreate(String(pr.owner))
    ownerAcc.printsOwned += 1
    const photogAcc = getOrCreate(String(pr.photographer))
    photogAcc.printsMinted += 1
  }

  const entries: LeaderboardEntryDto[] = []
  for (const acc of byAddr.values()) {
    // Only include active participants with at least 1 shot, post, or print
    if (acc.framesShot === 0 && acc.postsCount === 0 && acc.printsOwned === 0) continue

    let favoriteFilmId = 1
    let maxFilmWeight = -1
    for (const [fid, weight] of acc.filmCounts.entries()) {
      if (weight > maxFilmWeight) {
        maxFilmWeight = weight
        favoriteFilmId = fid
      }
    }

    entries.push({
      address: acc.address,
      handle: acc.handle,
      rollsCount: acc.rollsCount,
      framesShot: Math.max(acc.framesShot, acc.postsCount),
      postsCount: acc.postsCount,
      totalLikes: acc.totalLikes,
      printsOwned: acc.printsOwned,
      printsMinted: acc.printsMinted,
      favoriteFilmId,
      signatureImageUrl: acc.signatureImageUrl,
      signaturePostId: acc.signaturePostId,
      signatureScene: acc.signatureScene,
    })
  }

  return {
    totals: {
      photographers: entries.length,
      frames: Math.max(globalFrames, postRows.length),
      posts: postRows.length,
      prints: printRows.length,
      likes: globalLikes,
    },
    entries,
  }
}

let shotSyncColsPromise: Promise<void> | null = null

async function ensureShotSyncColumns(sql: Sql): Promise<void> {
  if (!shotSyncColsPromise) {
    shotSyncColsPromise = (async () => {
      await sql`
        ALTER TABLE public.shots
        ADD COLUMN IF NOT EXISTS r2_private_key TEXT
      `
    })().catch((err) => {
      shotSyncColsPromise = null
      throw err
    })
  }
  await shotSyncColsPromise
}

function getServerChainConfig(): { rpcUrl: string; contract: Address | null } {
  const isMainnet = process.env.NEXT_PUBLIC_CHAIN === 'mainnet'
  const rpcUrl = isMainnet
    ? 'https://rpc.bitkubchain.io'
    : 'https://rpc-testnet.bitkubchain.io'
  const envAddr = process.env.NEXT_PUBLIC_CHAINROLL_ADDRESS?.trim()
  const fallback = isMainnet ? chainRollAddress[96] : chainRollAddress[25925]
  const addr = (envAddr && /^0x[a-fA-F0-9]{40}$/.test(envAddr) ? envAddr : fallback) as
    | Address
    | undefined
  return { rpcUrl, contract: addr ?? null }
}

/**
 * Looks up the authoritative owner of `rollId` from Postgres (`public.rolls`)
 * or live on-chain (`ChainRoll.getRoll(rollId)`).
 */
export async function getRollMetaFromDbOrChain(
  rollId: number,
): Promise<{ owner: string; filmId: number; frames: number } | null> {
  const sql = getSql()
  const rows = await sql`
    SELECT owner, film_id, frames FROM public.rolls WHERE id = ${rollId} LIMIT 1
  `
  if (rows[0]?.owner) {
    return {
      owner: String(rows[0].owner).toLowerCase(),
      filmId: Number(rows[0].film_id ?? 1),
      frames: Number(rows[0].frames ?? 24),
    }
  }

  const { rpcUrl, contract } = getServerChainConfig()
  if (!contract) return null
  try {
    const client = createPublicClient({ transport: http(rpcUrl) })
    const onChain = await client.readContract({
      address: contract,
      abi: chainRollAbi,
      functionName: 'getRoll',
      args: [BigInt(rollId)],
    })
    if (
      onChain.owner !== '0x0000000000000000000000000000000000000000' &&
      onChain.frames > 0
    ) {
      return {
        owner: onChain.owner.toLowerCase(),
        filmId: Number(onChain.filmId),
        frames: Number(onChain.frames),
      }
    }
  } catch {
    // RPC read failed
  }
  return null
}

/**
 * Verifies that `walletAddress` owns `rollId` either in Postgres (`public.rolls`)
 * or on-chain (`ChainRoll.getRoll(rollId)`).
 */
export async function verifyRollOwner(
  rollId: number,
  walletAddress: string,
): Promise<{ ok: boolean; filmId?: number; frames?: number }> {
  const meta = await getRollMetaFromDbOrChain(rollId)
  if (!meta) return { ok: false }
  if (meta.owner !== walletAddress.toLowerCase()) return { ok: false }
  return { ok: true, filmId: meta.filmId, frames: meta.frames }
}

export async function saveSyncedShotKey(input: {
  rollId: number
  owner: string
  filmId: number
  frames: number
  frame: number
  photoHash: string
  txHash?: string | null
  r2PrivateKey: string
}): Promise<void> {
  const sql = getSql()
  await ensureShotSyncColumns(sql)
  const owner = input.owner.toLowerCase()
  const photoHash = input.photoHash.toLowerCase()

  await ensureUser(sql, owner)
  await sql`
    INSERT INTO public.rolls (id, owner, film_id, frames, frames_used)
    VALUES (${input.rollId}, ${owner}, ${input.filmId}, ${input.frames}, ${input.frame})
    ON CONFLICT (id) DO UPDATE
    SET frames_used = GREATEST(public.rolls.frames_used, ${input.frame})
  `
  await sql`
    INSERT INTO public.shots (roll_id, frame, photo_hash, tx_hash, status, r2_private_key)
    VALUES (${input.rollId}, ${input.frame}, ${photoHash}, ${input.txHash ?? null}, 'confirmed', ${input.r2PrivateKey})
    ON CONFLICT (photo_hash) DO UPDATE
    SET r2_private_key = EXCLUDED.r2_private_key,
        tx_hash = COALESCE(EXCLUDED.tx_hash, public.shots.tx_hash),
        status = 'confirmed'
  `
}

export type SyncedShotDto = {
  frame: number
  photoHash: string
  txHash?: string
  r2PrivateKey: string
  createdAt: number
}

export async function fetchSyncedShotsForRoll(rollId: number): Promise<SyncedShotDto[]> {
  const sql = getSql()
  await ensureShotSyncColumns(sql)
  const rows = await sql`
    SELECT frame, photo_hash, tx_hash, r2_private_key, created_at
    FROM public.shots
    WHERE roll_id = ${rollId} AND r2_private_key IS NOT NULL
    ORDER BY frame ASC
  `
  return rows.map((r) => ({
    frame: Number(r.frame),
    photoHash: String(r.photo_hash).toLowerCase(),
    txHash: r.tx_hash ? String(r.tx_hash) : undefined,
    r2PrivateKey: String(r.r2_private_key),
    createdAt: new Date(String(r.created_at)).getTime(),
  }))
}

export async function fetchSyncedShotKey(
  rollId: number,
  photoHash: string,
): Promise<string | null> {
  const sql = getSql()
  await ensureShotSyncColumns(sql)
  const rows = await sql`
    SELECT r2_private_key
    FROM public.shots
    WHERE roll_id = ${rollId} AND lower(photo_hash) = ${photoHash.toLowerCase()}
    LIMIT 1
  `
  return rows[0]?.r2_private_key ? String(rows[0].r2_private_key) : null
}

async function ensurePreMintTable(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS public.pre_mint_offers (
      id TEXT PRIMARY KEY,
      photo_hash TEXT NOT NULL,
      bidder TEXT NOT NULL REFERENCES public.users(address) ON DELETE CASCADE,
      amount_kub NUMERIC(18, 6) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      tx_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
}

export async function fetchAppStateFromDb(): Promise<{
  posts: DbPostDto[]
  profiles: Record<string, DbProfileDto>
  prints: DbPrintDto[]
  preMintOffers: Record<string, DbPrintDto['offers']>
  audit: DbAuditDto[]
  rolls: DbRollDto[]
}> {
  const sql = getSql()
  await ensurePreMintTable(sql)

  const [userRows, postRows, likeRows, reportRows, printRows, offerRows, preMintRows, auditRows, rollRows] =
    await Promise.all([
      sql`SELECT address, handle, bio, updated_at FROM public.users`,
      sql`
        SELECT p.id, p.shooter, u.handle, p.roll_id, p.frame, p.film_id, p.photo_hash, p.tx_hash,
               p.r2_public_url, p.scene, p.featured, p.caption, p.like_count, p.created_at
        FROM public.posts p
        LEFT JOIN public.users u ON u.address = p.shooter
        WHERE p.hidden_at IS NULL
        ORDER BY p.created_at DESC
        LIMIT 100
      `,
      sql`SELECT post_id, user_address FROM public.likes`,
      sql`SELECT post_id, reporter, reason, note, created_at FROM public.reports ORDER BY created_at ASC`,
      sql`
        SELECT pr.token_id, pr.post_id, pr.photo_hash, pr.roll_id, pr.frame, pr.film_id,
               pr.photographer, pr.owner, u.handle AS owner_handle, pr.ask_price_kub,
               pr.last_sale_kub, pr.royalty_bps, pr.protocol_fee_bps, pr.mint_tx_hash,
               pr.history, pr.minted_at
        FROM public.prints pr
        LEFT JOIN public.users u ON u.address = pr.owner
        ORDER BY pr.token_id ASC
      `,
      sql`
        SELECT o.id, o.token_id, o.bidder, u.handle AS bidder_handle, o.amount_kub,
               o.tx_hash, o.created_at, o.expires_at
        FROM public.print_offers o
        LEFT JOIN public.users u ON u.address = o.bidder
        WHERE o.status = 'active'
        ORDER BY o.amount_kub DESC
      `,
      sql`
        SELECT pm.id, pm.photo_hash, pm.bidder, u.handle AS bidder_handle, pm.amount_kub,
               pm.tx_hash, pm.created_at, pm.expires_at
        FROM public.pre_mint_offers pm
        LEFT JOIN public.users u ON u.address = pm.bidder
        WHERE pm.expires_at > now()
        ORDER BY pm.amount_kub DESC
      `,
      sql`
        SELECT id, actor, category, action, target, detail, tx_hash, created_at
        FROM public.admin_log
        ORDER BY created_at DESC
        LIMIT 100
      `,
      sql`
        SELECT id, owner, film_id, frames, frames_used, ready_at, claim_tx_hash
        FROM public.rolls
        ORDER BY id DESC
      `,
    ])

  const profiles: Record<string, DbProfileDto> = {}
  for (const r of userRows) {
    const addr = String(r.address).toLowerCase()
    profiles[addr] = {
      address: addr,
      handle: r.handle ? String(r.handle) : null,
      bio: String(r.bio ?? ''),
      updatedAt: new Date(String(r.updated_at)).getTime(),
    }
  }

  const likesByPost = new Map<string, string[]>()
  for (const l of likeRows) {
    const pid = String(l.post_id)
    const list = likesByPost.get(pid) ?? []
    list.push(String(l.user_address).toLowerCase())
    likesByPost.set(pid, list)
  }

  const reportsByPost = new Map<string, DbPostDto['reports']>()
  for (const rep of reportRows) {
    const pid = String(rep.post_id)
    const list = reportsByPost.get(pid) ?? []
    list.push({
      reporter: String(rep.reporter),
      reason: rep.reason as DbPostDto['reports'][number]['reason'],
      note: rep.note ? String(rep.note) : undefined,
      createdAt: new Date(String(rep.created_at)).getTime(),
    })
    reportsByPost.set(pid, list)
  }

  const posts: DbPostDto[] = postRows.map((p) => {
    const pid = String(p.id)
    const sceneVal = String(p.scene ?? 'nature')
    const validScene = (
      ['nature', 'portrait', 'night', 'indoor'].includes(sceneVal) ? sceneVal : 'nature'
    ) as DbPostDto['scene']

    return {
      id: pid,
      shooter: String(p.shooter).toLowerCase(),
      handle: p.handle ? String(p.handle) : null,
      rollId: Number(p.roll_id),
      frame: Number(p.frame),
      filmId: Number(p.film_id),
      photoHash: String(p.photo_hash),
      txHash: p.tx_hash ? String(p.tx_hash) : undefined,
      caption: String(p.caption ?? ''),
      createdAt: new Date(String(p.created_at)).getTime(),
      baseLikes: Number(p.like_count ?? 0),
      likes: likesByPost.get(pid) ?? [],
      imageDataUrl: p.r2_public_url ? String(p.r2_public_url) : undefined,
      scene: validScene,
      featured: Boolean(p.featured),
      aiTags: Array.isArray(p.ai_tags) ? p.ai_tags.map(String) : undefined,
      reports: reportsByPost.get(pid) ?? [],
    }
  })

  const offersByToken = new Map<number, DbPrintDto['offers']>()
  for (const o of offerRows) {
    const tid = Number(o.token_id)
    const list = offersByToken.get(tid) ?? []
    list.push({
      id: String(o.id),
      bidder: String(o.bidder).toLowerCase(),
      bidderHandle: o.bidder_handle ? String(o.bidder_handle) : null,
      amountKub: Number(o.amount_kub),
      createdAt: new Date(String(o.created_at)).getTime(),
      expiresAt: new Date(String(o.expires_at)).getTime(),
      txHash: String(o.tx_hash),
    })
    offersByToken.set(tid, list)
  }

  const prints: DbPrintDto[] = printRows.map((pr) => {
    const tid = Number(pr.token_id)
    const rawHistory =
      typeof pr.history === 'string'
        ? (JSON.parse(pr.history) as DbPrintDto['history'])
        : Array.isArray(pr.history)
          ? (pr.history as DbPrintDto['history'])
          : []
    return {
      tokenId: tid,
      postId: String(pr.post_id),
      photoHash: String(pr.photo_hash),
      rollId: Number(pr.roll_id),
      frame: Number(pr.frame),
      filmId: Number(pr.film_id),
      photographer: String(pr.photographer).toLowerCase(),
      owner: String(pr.owner).toLowerCase(),
      ownerHandle: pr.owner_handle ? String(pr.owner_handle) : null,
      askPriceKub: pr.ask_price_kub !== null ? Number(pr.ask_price_kub) : null,
      royaltyBps: Number(pr.royalty_bps ?? 500),
      protocolFeeBps: Number(pr.protocol_fee_bps ?? 250),
      mintedAt: new Date(String(pr.minted_at)).getTime(),
      mintTxHash: String(pr.mint_tx_hash),
      lastSaleKub: pr.last_sale_kub !== null ? Number(pr.last_sale_kub) : null,
      offers: offersByToken.get(tid) ?? [],
      history: rawHistory,
    }
  })

  const nowMs = Date.now()
  const audit: DbAuditDto[] = auditRows.map((a) => {
    const createdMs = new Date(String(a.created_at)).getTime()
    return {
      id: String(a.id),
      actor: String(a.actor),
      category: a.category as DbAuditDto['category'],
      action: String(a.action),
      target: String(a.target),
      detail: String(a.detail ?? ''),
      txHash: a.tx_hash ? String(a.tx_hash) : undefined,
      minutesAgo: Math.max(0, Math.round((nowMs - createdMs) / 60_000)),
    }
  })

  const rolls: DbRollDto[] = rollRows.map((r) => ({
    id: Number(r.id),
    owner: String(r.owner).toLowerCase(),
    filmId: Number(r.film_id),
    frames: Number(r.frames),
    framesUsed: Number(r.frames_used),
    developReadyAt: r.ready_at ? Math.floor(new Date(String(r.ready_at)).getTime() / 1000) : 0,
    claimTxHash: r.claim_tx_hash ? String(r.claim_tx_hash) : undefined,
  }))

  const preMintOffers: Record<string, DbPrintDto['offers']> = {}
  for (const pm of preMintRows) {
    const hash = String(pm.photo_hash).toLowerCase()
    const list = preMintOffers[hash] ?? []
    list.push({
      id: String(pm.id),
      bidder: String(pm.bidder).toLowerCase(),
      bidderHandle: pm.bidder_handle ? String(pm.bidder_handle) : null,
      amountKub: Number(pm.amount_kub),
      createdAt: new Date(String(pm.created_at)).getTime(),
      expiresAt: new Date(String(pm.expires_at)).getTime(),
      txHash: String(pm.tx_hash),
    })
    preMintOffers[hash] = list
  }

  return { posts, profiles, prints, preMintOffers, audit, rolls }
}

export type FeedPageParams = {
  limit?: number
  cursor?: string | null
  filmId?: number | null
  printsOnly?: boolean
  sort?: 'latest' | 'popular'
  q?: string | null
}

export type FeedPageResult = {
  items: DbPostDto[]
  nextCursor: string | null
  totalCount: number
}

type FeedCursorPayload = {
  t: string // ISO timestamp
  id: string
  l?: number // total likes (used when sort === 'popular')
}

function encodeFeedCursor(payload: FeedCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodeFeedCursor(raw: string | null | undefined): FeedCursorPayload | null {
  if (!raw || raw.length > 256) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<FeedCursorPayload>
    if (typeof parsed.t !== 'string' || typeof parsed.id !== 'string') return null
    if (Number.isNaN(Date.parse(parsed.t))) return null
    if (parsed.l !== undefined && (typeof parsed.l !== 'number' || !Number.isFinite(parsed.l))) {
      return null
    }
    return { t: parsed.t, id: parsed.id, l: parsed.l }
  } catch {
    return null
  }
}

export async function fetchFeedPageFromDb(params: FeedPageParams = {}): Promise<FeedPageResult> {
  const sql = getSql()
  await ensureVisualSearchColumns(sql)
  const limit = Math.max(1, Math.min(50, Math.floor(params.limit ?? 20)))
  const sort = params.sort === 'popular' ? 'popular' : 'latest'
  const filmId = params.filmId && params.filmId > 0 ? Math.floor(params.filmId) : null
  const printsOnly = Boolean(params.printsOnly)
  const cursor = decodeFeedCursor(params.cursor)
  const searchTerms = params.q ? expandVisualQuery(params.q) : []
  const searchPatterns = searchTerms.map((term) => `%${term.replace(/[%_\\]/g, '\\$&')}%`)

  const filmClause = filmId ? sql`AND p.film_id = ${filmId}` : sql``
  const printsClause = printsOnly
    ? sql`AND EXISTS (
        SELECT 1 FROM public.prints pr
        WHERE pr.post_id = p.id OR lower(pr.photo_hash) = lower(p.photo_hash)
      )`
    : sql``
  const searchClause =
    searchPatterns.length > 0
      ? sql`AND (
          p.caption ILIKE ANY(${searchPatterns})
          OR array_to_string(p.ai_tags, ' ') ILIKE ANY(${searchPatterns})
          OR p.ai_description ILIKE ANY(${searchPatterns})
          OR COALESCE(u.handle, '') ILIKE ANY(${searchPatterns})
          OR p.scene ILIKE ANY(${searchPatterns})
        )`
      : sql``

  const countPromise = sql`
    SELECT COUNT(*)::int AS total
    FROM public.posts p
    LEFT JOIN public.users u ON u.address = p.shooter
    WHERE p.hidden_at IS NULL
      ${filmClause}
      ${printsClause}
      ${searchClause}
  `

  const rowsPromise =
    sort === 'popular'
      ? sql`
          WITH ranked AS (
            SELECT p.id, p.shooter, u.handle, p.roll_id, p.frame, p.film_id, p.photo_hash, p.tx_hash,
                   p.r2_public_url, p.scene, p.featured, p.caption, p.like_count, p.created_at,
                   p.ai_tags,
                   (p.like_count + COALESCE(lc.cnt, 0))::int AS total_likes
            FROM public.posts p
            LEFT JOIN public.users u ON u.address = p.shooter
            LEFT JOIN (
              SELECT post_id, COUNT(*)::int AS cnt
              FROM public.likes
              GROUP BY post_id
            ) lc ON lc.post_id = p.id
            WHERE p.hidden_at IS NULL
              ${filmClause}
              ${printsClause}
              ${searchClause}
          )
          SELECT *
          FROM ranked
          ${
            cursor && cursor.l !== undefined
              ? sql`WHERE (
                  total_likes < ${cursor.l}
                  OR (total_likes = ${cursor.l} AND created_at < ${cursor.t}::timestamptz)
                  OR (total_likes = ${cursor.l} AND created_at = ${cursor.t}::timestamptz AND id < ${cursor.id})
                )`
              : sql``
          }
          ORDER BY total_likes DESC, created_at DESC, id DESC
          LIMIT ${limit + 1}
        `
      : sql`
          SELECT p.id, p.shooter, u.handle, p.roll_id, p.frame, p.film_id, p.photo_hash, p.tx_hash,
                 p.r2_public_url, p.scene, p.featured, p.caption, p.like_count, p.created_at,
                 p.ai_tags
          FROM public.posts p
          LEFT JOIN public.users u ON u.address = p.shooter
          WHERE p.hidden_at IS NULL
            ${filmClause}
            ${printsClause}
            ${searchClause}
            ${
              cursor
                ? sql`AND (
                    p.created_at < ${cursor.t}::timestamptz
                    OR (p.created_at = ${cursor.t}::timestamptz AND p.id < ${cursor.id})
                  )`
                : sql``
            }
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT ${limit + 1}
        `

  const [countRows, rawRows] = await Promise.all([countPromise, rowsPromise])
  const totalCount = Number(countRows[0]?.total ?? 0)

  const hasMore = rawRows.length > limit
  const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows
  const postIds = pageRows.map((r) => String(r.id))

  const likesByPost = new Map<string, string[]>()
  const reportsByPost = new Map<string, DbPostDto['reports']>()

  if (postIds.length > 0) {
    const [likeRows, reportRows] = await Promise.all([
      sql`SELECT post_id, user_address FROM public.likes WHERE post_id = ANY(${postIds})`,
      sql`
        SELECT post_id, reporter, reason, note, created_at
        FROM public.reports
        WHERE post_id = ANY(${postIds})
        ORDER BY created_at ASC
      `,
    ])

    for (const l of likeRows) {
      const pid = String(l.post_id)
      const list = likesByPost.get(pid) ?? []
      list.push(String(l.user_address).toLowerCase())
      likesByPost.set(pid, list)
    }

    for (const rep of reportRows) {
      const pid = String(rep.post_id)
      const list = reportsByPost.get(pid) ?? []
      list.push({
        reporter: String(rep.reporter),
        reason: rep.reason as DbPostDto['reports'][number]['reason'],
        note: rep.note ? String(rep.note) : undefined,
        createdAt: new Date(String(rep.created_at)).getTime(),
      })
      reportsByPost.set(pid, list)
    }
  }

  const items: DbPostDto[] = pageRows.map((p) => {
    const pid = String(p.id)
    const sceneVal = String(p.scene ?? 'nature')
    const validScene = (
      ['nature', 'portrait', 'night', 'indoor'].includes(sceneVal) ? sceneVal : 'nature'
    ) as DbPostDto['scene']

    return {
      id: pid,
      shooter: String(p.shooter).toLowerCase(),
      handle: p.handle ? String(p.handle) : null,
      rollId: Number(p.roll_id),
      frame: Number(p.frame),
      filmId: Number(p.film_id),
      photoHash: String(p.photo_hash),
      txHash: p.tx_hash ? String(p.tx_hash) : undefined,
      caption: String(p.caption ?? ''),
      createdAt: new Date(String(p.created_at)).getTime(),
      baseLikes: Number(p.like_count ?? 0),
      likes: likesByPost.get(pid) ?? [],
      imageDataUrl: p.r2_public_url ? String(p.r2_public_url) : undefined,
      scene: validScene,
      featured: Boolean(p.featured),
      aiTags: Array.isArray(p.ai_tags) ? p.ai_tags.map(String) : undefined,
      reports: reportsByPost.get(pid) ?? [],
    }
  })

  let nextCursor: string | null = null
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1]!
    const lastIso = new Date(String(last.created_at)).toISOString()
    nextCursor = encodeFeedCursor({
      t: lastIso,
      id: String(last.id),
      l: sort === 'popular' ? Number(last.total_likes ?? 0) : undefined,
    })
  }

  return { items, nextCursor, totalCount }
}

export type PostOgSummary = {
  id: string
  shooter: string
  handle: string | null
  rollId: number
  frame: number
  filmId: number
  photoHash: string
  caption: string
  imageUrl: string | null
  scene: 'nature' | 'portrait' | 'night' | 'indoor'
  createdAt: number
  print: {
    tokenId: number
    askPriceKub: number | null
    topOfferKub: number | null
  } | null
  topPreMintOfferKub: number | null
}

export async function fetchPostByIdFromDb(id: string): Promise<PostOgSummary | null> {
  const sql = getSql()
  await ensurePreMintTable(sql)

  const rows = await sql`
    SELECT p.id, p.shooter, u.handle, p.roll_id, p.frame, p.film_id, p.photo_hash,
           p.r2_public_url, p.scene, p.caption, p.created_at,
           pr.token_id, pr.ask_price_kub,
           (
             SELECT MAX(o.amount_kub)
             FROM public.print_offers o
             WHERE o.token_id = pr.token_id AND o.status = 'active'
           ) AS top_offer_kub,
           (
             SELECT MAX(pm.amount_kub)
             FROM public.pre_mint_offers pm
             WHERE lower(pm.photo_hash) = lower(p.photo_hash) AND pm.expires_at > now()
           ) AS top_pre_mint_kub
    FROM public.posts p
    LEFT JOIN public.users u ON u.address = p.shooter
    LEFT JOIN public.prints pr
      ON pr.post_id = p.id OR lower(pr.photo_hash) = lower(p.photo_hash)
    WHERE p.id = ${id} AND p.hidden_at IS NULL
    LIMIT 1
  `

  const r = rows[0]
  if (!r) return null

  const sceneVal = String(r.scene ?? 'nature')
  const validScene = (
    ['nature', 'portrait', 'night', 'indoor'].includes(sceneVal) ? sceneVal : 'nature'
  ) as PostOgSummary['scene']

  return {
    id: String(r.id),
    shooter: String(r.shooter).toLowerCase(),
    handle: r.handle ? String(r.handle) : null,
    rollId: Number(r.roll_id),
    frame: Number(r.frame),
    filmId: Number(r.film_id),
    photoHash: String(r.photo_hash),
    caption: String(r.caption ?? ''),
    imageUrl: r.r2_public_url ? String(r.r2_public_url) : null,
    scene: validScene,
    createdAt: new Date(String(r.created_at)).getTime(),
    print:
      r.token_id !== null && r.token_id !== undefined
        ? {
            tokenId: Number(r.token_id),
            askPriceKub: r.ask_price_kub !== null ? Number(r.ask_price_kub) : null,
            topOfferKub: r.top_offer_kub !== null ? Number(r.top_offer_kub) : null,
          }
        : null,
    topPreMintOfferKub: r.top_pre_mint_kub !== null ? Number(r.top_pre_mint_kub) : null,
  }
}

export type DbAdminDashboardDto = {
  kpis: {
    shotsToday: number
    shotsTotal: number
    txFailed: number
    activeUsers: number
    openReports: number
    hiddenPosts: number
  }
  recentShots: {
    id: string
    postId?: string
    frame: string
    shooter: string
    handle: string | null
    film: string
    wallet: 'bitkub-next' | 'metamask'
    txHash: string
    status: 'confirmed' | 'pending' | 'failed'
    minutesAgo: number
  }[]
  moderation: {
    id: string
    postId: string
    frame: string
    filmId: number
    film: string
    scene: 'nature' | 'portrait' | 'night' | 'indoor'
    imageUrl: string | null
    shooter: string
    handle: string | null
    caption: string
    photoHash: string
    reason: 'nsfw' | 'spam' | 'copyright' | 'harassment'
    confidence: number | null
    reporter: string
    reportCount: number
    minutesAgo: number
    status: 'pending' | 'approved' | 'hidden' | 'banned'
  }[]
  users: {
    address: string
    handle: string | null
    wallet: 'bitkub-next' | 'metamask'
    rolls: number
    shots: number
    posts: number
    streak: number
    reports: number
    status: 'active' | 'banned'
    lastActiveMinutes: number
  }[]
}

const FILM_NAME_FALLBACK: Record<number, string> = {
  1: 'KUB 400',
  2: 'BW 400',
  3: 'Night 800',
}

function formatFrameCode(frame: number): string {
  return `${String(frame).padStart(2, '0')}${frame % 2 ? 'A' : ''}`
}

export async function fetchAdminDashboardFromDb(): Promise<DbAdminDashboardDto> {
  const sql = getSql()
  const nowMs = Date.now()

  const [kpiRows, postShotRows, reportRows, userRows] = await Promise.all([
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM public.shots WHERE created_at > now() - interval '24 hours') AS shots_24h,
        (SELECT COUNT(*)::int FROM public.posts WHERE created_at > now() - interval '24 hours') AS posts_24h,
        (SELECT COUNT(*)::int FROM public.shots) AS shots_total,
        (SELECT COUNT(*)::int FROM public.posts) AS posts_total,
        (SELECT COUNT(*)::int FROM public.shots WHERE status = 'failed') AS tx_failed,
        (SELECT COUNT(*)::int FROM public.users) AS active_users,
        (SELECT COUNT(*)::int FROM public.reports WHERE status = 'pending') AS open_reports,
        (SELECT COUNT(*)::int FROM public.posts WHERE hidden_at IS NOT NULL) AS hidden_posts
    `,
    sql`
      SELECT p.id, p.frame, p.shooter, u.handle, u.wallet_kind, p.film_id, f.name AS film_name,
             COALESCE(p.tx_hash, p.photo_hash) AS tx_hash, p.hidden_at, p.created_at
      FROM public.posts p
      LEFT JOIN public.users u ON u.address = p.shooter
      LEFT JOIN public.films f ON f.id = p.film_id
      ORDER BY p.created_at DESC
      LIMIT 30
    `,
    sql`
      SELECT r.id, r.post_id, r.reporter, r.reason, r.ai_confidence, r.status, r.created_at,
             p.frame, p.film_id, f.name AS film_name, p.scene, p.r2_public_url,
             p.shooter, u.handle, p.caption, p.photo_hash, p.hidden_at,
             (SELECT COUNT(*)::int FROM public.reports r2 WHERE r2.post_id = r.post_id) AS report_count
      FROM public.reports r
      JOIN public.posts p ON p.id = r.post_id
      LEFT JOIN public.users u ON u.address = p.shooter
      LEFT JOIN public.films f ON f.id = p.film_id
      ORDER BY
        CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END ASC,
        r.created_at DESC
      LIMIT 100
    `,
    sql`
      SELECT u.address, u.handle, u.wallet_kind, u.streak, u.banned_at, u.updated_at,
             COALESCE(rl.roll_count, 0)::int AS rolls,
             COALESCE(rl.shots_used, 0)::int AS shots_used,
             COALESCE(ps.post_count, 0)::int AS posts,
             COALESCE(rp.report_count, 0)::int AS reports
      FROM public.users u
      LEFT JOIN (
        SELECT owner, COUNT(*)::int AS roll_count, COALESCE(SUM(frames_used), 0)::int AS shots_used
        FROM public.rolls
        GROUP BY owner
      ) rl ON rl.owner = u.address
      LEFT JOIN (
        SELECT shooter, COUNT(*)::int AS post_count
        FROM public.posts
        GROUP BY shooter
      ) ps ON ps.shooter = u.address
      LEFT JOIN (
        SELECT p.shooter, COUNT(*)::int AS report_count
        FROM public.reports r
        JOIN public.posts p ON p.id = r.post_id
        GROUP BY p.shooter
      ) rp ON rp.shooter = u.address
      ORDER BY COALESCE(ps.post_count, 0) DESC, u.updated_at DESC
      LIMIT 100
    `,
  ])

  const k = kpiRows[0]
  const shotsToday = Math.max(Number(k?.shots_24h ?? 0), Number(k?.posts_24h ?? 0))
  const shotsTotal = Math.max(Number(k?.shots_total ?? 0), Number(k?.posts_total ?? 0))

  const recentShots: DbAdminDashboardDto['recentShots'] = postShotRows.map((row) => {
    const createdMs = new Date(String(row.created_at)).getTime()
    const filmId = Number(row.film_id)
    return {
      id: String(row.id),
      postId: String(row.id),
      frame: formatFrameCode(Number(row.frame)),
      shooter: String(row.shooter).toLowerCase(),
      handle: row.handle ? String(row.handle) : null,
      film: row.film_name ? String(row.film_name) : (FILM_NAME_FALLBACK[filmId] ?? `Film #${filmId}`),
      wallet: String(row.wallet_kind) === 'bitkub-next' ? 'bitkub-next' : 'metamask',
      txHash: String(row.tx_hash ?? ''),
      status: row.hidden_at ? 'failed' : 'confirmed',
      minutesAgo: Math.max(0, Math.round((nowMs - createdMs) / 60_000)),
    }
  })

  const moderation: DbAdminDashboardDto['moderation'] = reportRows.map((r) => {
    const createdMs = new Date(String(r.created_at)).getTime()
    const filmId = Number(r.film_id)
    const sceneVal = String(r.scene ?? 'nature')
    const validScene = (
      ['nature', 'portrait', 'night', 'indoor'].includes(sceneVal) ? sceneVal : 'nature'
    ) as DbAdminDashboardDto['moderation'][number]['scene']

    return {
      id: String(r.id),
      postId: String(r.post_id),
      frame: formatFrameCode(Number(r.frame)),
      filmId,
      film: r.film_name ? String(r.film_name) : (FILM_NAME_FALLBACK[filmId] ?? `Film #${filmId}`),
      scene: validScene,
      imageUrl: r.r2_public_url ? String(r.r2_public_url) : null,
      shooter: String(r.shooter).toLowerCase(),
      handle: r.handle ? String(r.handle) : null,
      caption: String(r.caption ?? ''),
      photoHash: String(r.photo_hash),
      reason: r.reason as DbAdminDashboardDto['moderation'][number]['reason'],
      confidence: r.ai_confidence !== null && r.ai_confidence !== undefined ? Number(r.ai_confidence) : null,
      reporter: String(r.reporter),
      reportCount: Number(r.report_count ?? 1),
      minutesAgo: Math.max(0, Math.round((nowMs - createdMs) / 60_000)),
      status: r.status as DbAdminDashboardDto['moderation'][number]['status'],
    }
  })

  const users: DbAdminDashboardDto['users'] = userRows.map((u) => {
    const updatedMs = new Date(String(u.updated_at)).getTime()
    const postsCount = Number(u.posts ?? 0)
    const shotsCount = Math.max(Number(u.shots_used ?? 0), postsCount)
    return {
      address: String(u.address).toLowerCase(),
      handle: u.handle ? String(u.handle) : null,
      wallet: String(u.wallet_kind) === 'bitkub-next' ? 'bitkub-next' : 'metamask',
      rolls: Number(u.rolls ?? 0),
      shots: shotsCount,
      posts: postsCount,
      streak: Number(u.streak ?? 0),
      reports: Number(u.reports ?? 0),
      status: u.banned_at ? 'banned' : 'active',
      lastActiveMinutes: Math.max(0, Math.round((nowMs - updatedMs) / 60_000)),
    }
  })

  return {
    kpis: {
      shotsToday,
      shotsTotal,
      txFailed: Number(k?.tx_failed ?? 0),
      activeUsers: Number(k?.active_users ?? 0),
      openReports: Number(k?.open_reports ?? 0),
      hiddenPosts: Number(k?.hidden_posts ?? 0),
    },
    recentShots,
    moderation,
    users,
  }
}

export type AdminActionPayload =
  | {
      type: 'moderation.decide'
      reportId: string
      postId: string
      shooter: string
      decision: 'pending' | 'approved' | 'hidden' | 'banned'
      note?: string
    }
  | {
      type: 'post.bulkHide'
      postIds: string[]
      note?: string
    }
  | {
      type: 'user.setBan'
      address: string
      banned: boolean
      note?: string
    }
  | {
      type: 'user.resetStreak'
      address: string
    }

export async function applyAdminActionInDb(
  payload: AdminActionPayload,
  actorAddress: string,
): Promise<void> {
  const sql = getSql()
  const actor = actorAddress.toLowerCase()

  switch (payload.type) {
    case 'moderation.decide': {
      const resolvedAt = payload.decision === 'pending' ? null : new Date()
      const resolvedBy = payload.decision === 'pending' ? null : actor

      // Update report status if reportId is a valid UUID
      if (/^[0-9a-f-]{36}$/i.test(payload.reportId)) {
        await sql`
          UPDATE public.reports
          SET status = ${payload.decision},
              resolved_by = ${resolvedBy},
              resolved_at = ${resolvedAt}
          WHERE id = ${payload.reportId}::uuid
        `
      } else {
        await sql`
          UPDATE public.reports
          SET status = ${payload.decision},
              resolved_by = ${resolvedBy},
              resolved_at = ${resolvedAt}
          WHERE post_id = ${payload.postId}
        `
      }

      if (payload.decision === 'hidden' || payload.decision === 'banned') {
        await sql`
          UPDATE public.posts
          SET hidden_at = now(), visibility = 'hidden'
          WHERE id = ${payload.postId}
        `
      } else {
        await sql`
          UPDATE public.posts
          SET hidden_at = NULL, visibility = 'public'
          WHERE id = ${payload.postId}
        `
      }

      if (payload.decision === 'banned') {
        await sql`
          UPDATE public.users
          SET banned_at = now(), updated_at = now()
          WHERE address = ${payload.shooter.toLowerCase()}
        `
      }
      return
    }

    case 'post.bulkHide': {
      if (payload.postIds.length === 0) return
      await sql`
        UPDATE public.posts
        SET hidden_at = now(), visibility = 'hidden'
        WHERE id = ANY(${payload.postIds})
      `
      return
    }

    case 'user.setBan': {
      const addr = payload.address.toLowerCase()
      await sql`
        UPDATE public.users
        SET banned_at = ${payload.banned ? new Date() : null},
            updated_at = now()
        WHERE address = ${addr}
      `
      return
    }

    case 'user.resetStreak': {
      const addr = payload.address.toLowerCase()
      await sql`
        UPDATE public.users
        SET streak = 0, updated_at = now()
        WHERE address = ${addr}
      `
      return
    }
  }
}

export type PhotoVerificationDto = {
  verified: true
  source: 'post' | 'shot'
  photoHash: string
  postId: string | null
  rollId: number
  frame: number
  filmId: number
  filmName: string
  shooter: string
  shooterHandle: string | null
  txHash: string | null
  caption: string | null
  imageUrl: string | null
  createdAt: number
  print: {
    tokenId: number
    owner: string
    ownerHandle: string | null
    askPriceKub: number | null
  } | null
}

export async function fetchVerificationByHashFromDb(
  photoHash: string,
): Promise<PhotoVerificationDto | null> {
  const sql = getSql()
  const norm = photoHash.toLowerCase()

  // 1. Check public posts (joined with users, films, and 1/1 prints)
  const postRows = await sql`
    SELECT p.id, p.roll_id, p.frame, p.film_id, f.name AS film_name, p.photo_hash,
           p.tx_hash, p.shooter, u.handle AS shooter_handle, p.caption, p.r2_public_url,
           p.created_at,
           pr.token_id, pr.owner AS print_owner, pu.handle AS print_owner_handle, pr.ask_price_kub
    FROM public.posts p
    LEFT JOIN public.users u ON u.address = p.shooter
    LEFT JOIN public.films f ON f.id = p.film_id
    LEFT JOIN public.prints pr
      ON pr.post_id = p.id OR lower(pr.photo_hash) = lower(p.photo_hash)
    LEFT JOIN public.users pu ON pu.address = pr.owner
    WHERE lower(p.photo_hash) = ${norm}
    LIMIT 1
  `

  const p = postRows[0]
  if (p) {
    const filmId = Number(p.film_id)
    return {
      verified: true,
      source: 'post',
      photoHash: String(p.photo_hash).toLowerCase(),
      postId: String(p.id),
      rollId: Number(p.roll_id),
      frame: Number(p.frame),
      filmId,
      filmName: p.film_name ? String(p.film_name) : (FILM_NAME_FALLBACK[filmId] ?? `Film #${filmId}`),
      shooter: String(p.shooter).toLowerCase(),
      shooterHandle: p.shooter_handle ? String(p.shooter_handle) : null,
      txHash: p.tx_hash ? String(p.tx_hash) : null,
      caption: p.caption ? String(p.caption) : null,
      imageUrl: p.r2_public_url ? String(p.r2_public_url) : null,
      createdAt: new Date(String(p.created_at)).getTime(),
      print:
        p.token_id !== null && p.token_id !== undefined
          ? {
              tokenId: Number(p.token_id),
              owner: String(p.print_owner).toLowerCase(),
              ownerHandle: p.print_owner_handle ? String(p.print_owner_handle) : null,
              askPriceKub: p.ask_price_kub !== null ? Number(p.ask_price_kub) : null,
            }
          : null,
    }
  }

  // 2. Check private/unposted darkroom shots recorded on-chain
  const shotRows = await sql`
    SELECT s.roll_id, s.frame, s.photo_hash, s.tx_hash, s.created_at,
           r.owner AS shooter, r.film_id, f.name AS film_name, u.handle AS shooter_handle
    FROM public.shots s
    JOIN public.rolls r ON r.id = s.roll_id
    LEFT JOIN public.users u ON u.address = r.owner
    LEFT JOIN public.films f ON f.id = r.film_id
    WHERE lower(s.photo_hash) = ${norm}
    LIMIT 1
  `

  const s = shotRows[0]
  if (!s) return null

  const filmId = Number(s.film_id)
  return {
    verified: true,
    source: 'shot',
    photoHash: String(s.photo_hash).toLowerCase(),
    postId: null,
    rollId: Number(s.roll_id),
    frame: Number(s.frame),
    filmId,
    filmName: s.film_name ? String(s.film_name) : (FILM_NAME_FALLBACK[filmId] ?? `Film #${filmId}`),
    shooter: String(s.shooter).toLowerCase(),
    shooterHandle: s.shooter_handle ? String(s.shooter_handle) : null,
    txHash: s.tx_hash ? String(s.tx_hash) : null,
    caption: null,
    imageUrl: null,
    createdAt: new Date(String(s.created_at)).getTime(),
    print: null,
  }
}

export type LiveActivityItemDto = {
  id: string
  kind: 'post' | 'roll' | 'print' | 'offer'
  actor: string
  actorHandle: string | null
  title: string
  detail: string
  postId?: string | null
  rollId?: number | null
  filmId?: number | null
  imageUrl?: string | null
  amountKub?: number | null
  txHash?: string | null
  timestamp: number
}

export async function fetchLiveActivityFromDb(limit = 40): Promise<LiveActivityItemDto[]> {
  const sql = getSql()
  await ensurePreMintTable(sql)
  const cap = Math.max(5, Math.min(80, Math.floor(limit)))

  const [postRows, rollRows, printRows, offerRows, preMintRows] = await Promise.all([
    sql`
      SELECT p.id, p.shooter, u.handle, p.roll_id, p.frame, p.film_id, f.name AS film_name,
             p.caption, p.r2_public_url, p.tx_hash, p.created_at
      FROM public.posts p
      LEFT JOIN public.users u ON u.address = p.shooter
      LEFT JOIN public.films f ON f.id = p.film_id
      WHERE p.hidden_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT ${cap}
    `,
    sql`
      SELECT r.id, r.owner, u.handle, r.film_id, f.name AS film_name,
             r.frames, r.frames_used, r.developed_at, r.claim_tx_hash, r.created_at
      FROM public.rolls r
      LEFT JOIN public.users u ON u.address = r.owner
      LEFT JOIN public.films f ON f.id = r.film_id
      ORDER BY COALESCE(r.developed_at, r.created_at) DESC
      LIMIT ${cap}
    `,
    sql`
      SELECT pr.token_id, pr.post_id, pr.roll_id, pr.frame, pr.film_id, f.name AS film_name,
             pr.owner, u.handle, pr.ask_price_kub, pr.last_sale_kub, pr.mint_tx_hash, pr.minted_at,
             p.r2_public_url
      FROM public.prints pr
      LEFT JOIN public.users u ON u.address = pr.owner
      LEFT JOIN public.films f ON f.id = pr.film_id
      LEFT JOIN public.posts p ON p.id = pr.post_id
      ORDER BY pr.minted_at DESC
      LIMIT ${cap}
    `,
    sql`
      SELECT o.id, o.token_id, o.bidder, u.handle, o.amount_kub, o.tx_hash, o.created_at,
             pr.post_id, pr.film_id, p.r2_public_url
      FROM public.print_offers o
      LEFT JOIN public.users u ON u.address = o.bidder
      LEFT JOIN public.prints pr ON pr.token_id = o.token_id
      LEFT JOIN public.posts p ON p.id = pr.post_id
      WHERE o.status = 'active'
      ORDER BY o.created_at DESC
      LIMIT ${cap}
    `,
    sql`
      SELECT pm.id, pm.photo_hash, pm.bidder, u.handle, pm.amount_kub, pm.tx_hash, pm.created_at,
             p.id AS post_id, p.film_id, p.r2_public_url
      FROM public.pre_mint_offers pm
      LEFT JOIN public.users u ON u.address = pm.bidder
      LEFT JOIN public.posts p ON lower(p.photo_hash) = lower(pm.photo_hash)
      WHERE pm.expires_at > now()
      ORDER BY pm.created_at DESC
      LIMIT ${cap}
    `,
  ])

  const events: LiveActivityItemDto[] = []

  for (const p of postRows) {
    const filmId = Number(p.film_id)
    const filmName = p.film_name ? String(p.film_name) : (FILM_NAME_FALLBACK[filmId] ?? `Film #${filmId}`)
    const frameStr = formatFrameCode(Number(p.frame))
    events.push({
      id: `post-${String(p.id)}`,
      kind: 'post',
      actor: String(p.shooter).toLowerCase(),
      actorHandle: p.handle ? String(p.handle) : null,
      title: `Published frame ${frameStr} · ${filmName}`,
      detail: String(p.caption ?? '').trim() || `Roll #${Number(p.roll_id)}`,
      postId: String(p.id),
      rollId: Number(p.roll_id),
      filmId,
      imageUrl: p.r2_public_url ? String(p.r2_public_url) : null,
      txHash: p.tx_hash ? String(p.tx_hash) : null,
      timestamp: new Date(String(p.created_at)).getTime(),
    })
  }

  for (const r of rollRows) {
    const filmId = Number(r.film_id)
    const filmName = r.film_name ? String(r.film_name) : (FILM_NAME_FALLBACK[filmId] ?? `Film #${filmId}`)
    const ts = r.developed_at ? new Date(String(r.developed_at)).getTime() : new Date(String(r.created_at)).getTime()
    events.push({
      id: `roll-${Number(r.id)}`,
      kind: 'roll',
      actor: String(r.owner).toLowerCase(),
      actorHandle: r.handle ? String(r.handle) : null,
      title: r.developed_at
        ? `Developed Roll #${Number(r.id)} · ${filmName}`
        : `Claimed Roll #${Number(r.id)} · ${filmName}`,
      detail: `${Number(r.frames_used)}/${Number(r.frames)} EXP`,
      rollId: Number(r.id),
      filmId,
      txHash: r.claim_tx_hash ? String(r.claim_tx_hash) : null,
      timestamp: ts,
    })
  }

  for (const pr of printRows) {
    const filmId = Number(pr.film_id)
    const filmName = pr.film_name ? String(pr.film_name) : (FILM_NAME_FALLBACK[filmId] ?? `Film #${filmId}`)
    const ask = pr.ask_price_kub !== null ? Number(pr.ask_price_kub) : null
    const lastSale = pr.last_sale_kub !== null ? Number(pr.last_sale_kub) : null
    events.push({
      id: `print-${Number(pr.token_id)}`,
      kind: 'print',
      actor: String(pr.owner).toLowerCase(),
      actorHandle: pr.handle ? String(pr.handle) : null,
      title: `1/1 Print #${String(Number(pr.token_id)).padStart(2, '0')} · ${filmName}`,
      detail: lastSale
        ? `Sold for ${lastSale.toFixed(2)} KUB`
        : ask
          ? `Listed at ${ask.toFixed(2)} KUB`
          : `Minted on KUB Chain`,
      postId: String(pr.post_id),
      rollId: Number(pr.roll_id),
      filmId,
      imageUrl: pr.r2_public_url ? String(pr.r2_public_url) : null,
      amountKub: lastSale ?? ask,
      txHash: pr.mint_tx_hash ? String(pr.mint_tx_hash) : null,
      timestamp: new Date(String(pr.minted_at)).getTime(),
    })
  }

  for (const o of offerRows) {
    const amt = Number(o.amount_kub)
    events.push({
      id: `offer-${String(o.id)}`,
      kind: 'offer',
      actor: String(o.bidder).toLowerCase(),
      actorHandle: o.handle ? String(o.handle) : null,
      title: `Offered ${amt.toFixed(2)} KUB on Print #${String(Number(o.token_id)).padStart(2, '0')}`,
      detail: 'Escrow offer on ChainRollPrints',
      postId: o.post_id ? String(o.post_id) : null,
      filmId: o.film_id ? Number(o.film_id) : null,
      imageUrl: o.r2_public_url ? String(o.r2_public_url) : null,
      amountKub: amt,
      txHash: o.tx_hash ? String(o.tx_hash) : null,
      timestamp: new Date(String(o.created_at)).getTime(),
    })
  }

  for (const pm of preMintRows) {
    const amt = Number(pm.amount_kub)
    events.push({
      id: `pre-${String(pm.id)}`,
      kind: 'offer',
      actor: String(pm.bidder).toLowerCase(),
      actorHandle: pm.handle ? String(pm.handle) : null,
      title: `Pre-Mint Offer ${amt.toFixed(2)} KUB`,
      detail: 'Escrow bid awaiting photographer accept',
      postId: pm.post_id ? String(pm.post_id) : null,
      filmId: pm.film_id ? Number(pm.film_id) : null,
      imageUrl: pm.r2_public_url ? String(pm.r2_public_url) : null,
      amountKub: amt,
      txHash: pm.tx_hash ? String(pm.tx_hash) : null,
      timestamp: new Date(String(pm.created_at)).getTime(),
    })
  }

  events.sort((a, b) => b.timestamp - a.timestamp)
  return events.slice(0, cap)
}

export type DbMutationPayload =
  | {
      type: 'post.create'
      post: {
        id: string
        shooter: string
        rollId: number
        frame: number
        filmId: number
        photoHash: string
        txHash?: string
        caption: string
        imageDataUrl?: string
        scene?: string
      }
    }
  | { type: 'post.like'; postId: string; userAddress: string }
  | { type: 'post.delete'; postId: string; actorAddress: string }
  | {
      type: 'post.report'
      postId: string
      reporter: string
      reason: 'nsfw' | 'spam' | 'copyright' | 'harassment'
      note?: string
    }
  | { type: 'profile.save'; address: string; handle: string | null; bio: string }
  | { type: 'user.touch'; address: string }
  | {
      type: 'print.upsert'
      print: DbPrintDto
    }
  | {
      type: 'audit.record'
      entry: {
        id: string
        actor: string
        category: 'moderation' | 'films' | 'users' | 'gas' | 'contract'
        action: string
        target: string
        detail: string
        txHash?: string
      }
    }
  | { type: 'audit.remove'; id: string }
  | {
      type: 'roll.claim'
      roll: {
        id: number
        owner: string
        filmId: number
        frames: number
        txHash: string
      }
    }
  | {
      type: 'roll.shoot'
      rollId: number
      frame: number
      photoHash: string
      txHash: string
    }
  | {
      type: 'print.preMintOffer'
      photoHash: string
      offer: DbPrintDto['offers'][number]
    }
  | { type: 'print.preMintCancel'; photoHash: string; offerId: string; bidder: string }
  | { type: 'print.preMintClear'; photoHash: string }
  | {
      type: 'roll.develop'
      rollId: number
      frames: number
      readyAtSec: number
    }

async function ensureUser(sql: Sql, address: string) {
  const norm = address.toLowerCase()
  await sql`
    INSERT INTO public.users (address)
    VALUES (${norm})
    ON CONFLICT (address) DO NOTHING
  `
}

export async function applyDbMutation(payload: DbMutationPayload): Promise<void> {
  const sql = getSql()

  switch (payload.type) {
    case 'post.create': {
      const p = payload.post
      const shooter = p.shooter.toLowerCase()
      const scene = p.scene ?? 'nature'
      const baselineTags = defaultSceneTags(scene)
      await ensureVisualSearchColumns(sql)
      await ensureUser(sql, shooter)
      await sql`
        INSERT INTO public.posts (
          id, shooter, roll_id, frame, film_id, photo_hash, tx_hash,
          r2_public_url, scene, featured, caption, ai_tags
        ) VALUES (
          ${p.id}, ${shooter}, ${p.rollId}, ${p.frame}, ${p.filmId},
          ${p.photoHash}, ${p.txHash ?? null}, ${p.imageDataUrl ?? null},
          ${scene}, true, ${p.caption}, ${baselineTags}
        )
        ON CONFLICT (photo_hash) DO UPDATE
        SET caption = EXCLUDED.caption,
            r2_public_url = COALESCE(EXCLUDED.r2_public_url, public.posts.r2_public_url)
      `
      // Fire-and-forget ultra-low-token Gemini Vision tagging (~180 tokens/photo)
      const imgSrc = p.imageDataUrl ?? `/samples/${scene}.jpg`
      void tagAndSavePostVisuals(p.id, imgSrc, { caption: p.caption, scene }).catch(() => {})
      return
    }

    case 'post.like': {
      const user = payload.userAddress.toLowerCase()
      await ensureUser(sql, user)
      const existing = await sql`
        SELECT 1 FROM public.likes
        WHERE post_id = ${payload.postId} AND user_address = ${user}
      `
      if (existing.length > 0) {
        await sql`
          DELETE FROM public.likes
          WHERE post_id = ${payload.postId} AND user_address = ${user}
        `
      } else {
        await sql`
          INSERT INTO public.likes (post_id, user_address)
          VALUES (${payload.postId}, ${user})
          ON CONFLICT DO NOTHING
        `
      }
      return
    }

    case 'post.delete': {
      const actor = payload.actorAddress.toLowerCase()
      await sql`
        DELETE FROM public.posts
        WHERE id = ${payload.postId} AND shooter = ${actor}
      `
      return
    }

    case 'post.report': {
      await sql`
        INSERT INTO public.reports (post_id, reporter, reason, note)
        VALUES (${payload.postId}, ${payload.reporter.toLowerCase()}, ${payload.reason}, ${payload.note ?? null})
      `
      return
    }

    case 'profile.save': {
      const addr = payload.address.toLowerCase()
      await sql`
        INSERT INTO public.users (address, handle, bio, updated_at)
        VALUES (${addr}, ${payload.handle}, ${payload.bio}, now())
        ON CONFLICT (address) DO UPDATE
        SET handle = EXCLUDED.handle,
            bio = EXCLUDED.bio,
            updated_at = now()
      `
      return
    }

    case 'print.upsert': {
      const pr = payload.print
      const photographer = pr.photographer.toLowerCase()
      const owner = pr.owner.toLowerCase()
      await ensureUser(sql, photographer)
      await ensureUser(sql, owner)

      await sql`
        INSERT INTO public.prints (
          token_id, post_id, photo_hash, roll_id, frame, film_id,
          photographer, owner, ask_price_kub, last_sale_kub,
          royalty_bps, protocol_fee_bps, mint_tx_hash, history
        ) VALUES (
          ${pr.tokenId}, ${pr.postId}, ${pr.photoHash}, ${pr.rollId}, ${pr.frame}, ${pr.filmId},
          ${photographer}, ${owner}, ${pr.askPriceKub}, ${pr.lastSaleKub},
          ${pr.royaltyBps}, ${pr.protocolFeeBps}, ${pr.mintTxHash}, ${sql.json(pr.history)}
        )
        ON CONFLICT (token_id) DO UPDATE
        SET owner = EXCLUDED.owner,
            ask_price_kub = EXCLUDED.ask_price_kub,
            last_sale_kub = EXCLUDED.last_sale_kub,
            history = EXCLUDED.history
      `

      // Sync active offers for this print token
      await sql`DELETE FROM public.print_offers WHERE token_id = ${pr.tokenId}`
      for (const off of pr.offers) {
        const bidder = off.bidder.toLowerCase()
        await ensureUser(sql, bidder)
        await sql`
          INSERT INTO public.print_offers (
            id, token_id, bidder, amount_kub, status, tx_hash, created_at, expires_at
          ) VALUES (
            ${off.id}, ${pr.tokenId}, ${bidder}, ${off.amountKub}, 'active',
            ${off.txHash}, ${new Date(off.createdAt)}, ${new Date(off.expiresAt)}
          )
          ON CONFLICT (id) DO NOTHING
        `
      }
      return
    }

    case 'audit.record': {
      const e = payload.entry
      await sql`
        INSERT INTO public.admin_log (id, actor, category, action, target, detail, tx_hash)
        VALUES (${e.id}, ${e.actor.toLowerCase()}, ${e.category}, ${e.action}, ${e.target}, ${e.detail}, ${e.txHash ?? null})
        ON CONFLICT (id) DO NOTHING
      `
      return
    }

    case 'audit.remove': {
      await sql`DELETE FROM public.admin_log WHERE id = ${payload.id}`
      return
    }

    case 'user.touch': {
      await ensureUser(sql, payload.address)
      return
    }

    case 'roll.claim': {
      const r = payload.roll
      const owner = r.owner.toLowerCase()
      await ensureUser(sql, owner)
      await sql`
        INSERT INTO public.rolls (id, owner, film_id, frames, frames_used, claim_tx_hash)
        VALUES (${r.id}, ${owner}, ${r.filmId}, ${r.frames}, 0, ${r.txHash})
        ON CONFLICT (id) DO UPDATE
        SET film_id = EXCLUDED.film_id,
            frames = EXCLUDED.frames
      `
      return
    }

    case 'roll.shoot': {
      await sql`
        UPDATE public.rolls
        SET frames_used = GREATEST(frames_used, ${payload.frame})
        WHERE id = ${payload.rollId}
      `
      await sql`
        INSERT INTO public.shots (roll_id, frame, photo_hash, tx_hash, status)
        VALUES (${payload.rollId}, ${payload.frame}, ${payload.photoHash}, ${payload.txHash}, 'confirmed')
        ON CONFLICT (photo_hash) DO UPDATE
        SET status = 'confirmed', tx_hash = EXCLUDED.tx_hash
      `
      return
    }

    case 'print.preMintOffer': {
      await ensurePreMintTable(sql)
      const o = payload.offer
      const bidder = o.bidder.toLowerCase()
      await ensureUser(sql, bidder)
      await sql`
        INSERT INTO public.pre_mint_offers (id, photo_hash, bidder, amount_kub, expires_at, tx_hash)
        VALUES (${o.id}, ${payload.photoHash.toLowerCase()}, ${bidder}, ${o.amountKub}, ${new Date(o.expiresAt)}, ${o.txHash})
        ON CONFLICT (id) DO NOTHING
      `
      return
    }

    case 'print.preMintCancel': {
      await ensurePreMintTable(sql)
      await sql`
        DELETE FROM public.pre_mint_offers
        WHERE id = ${payload.offerId} AND bidder = ${payload.bidder.toLowerCase()}
      `
      return
    }

    case 'print.preMintClear': {
      await ensurePreMintTable(sql)
      await sql`
        DELETE FROM public.pre_mint_offers
        WHERE photo_hash = ${payload.photoHash.toLowerCase()}
      `
      return
    }

    case 'roll.develop': {
      const readyDate = new Date(payload.readyAtSec * 1000)
      await sql`
        UPDATE public.rolls
        SET frames = ${payload.frames},
            developed_at = now(),
            ready_at = ${readyDate}
        WHERE id = ${payload.rollId}
      `
      return
    }
  }
}
