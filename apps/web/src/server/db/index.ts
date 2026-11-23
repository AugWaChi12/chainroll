import postgres, { type Sql } from 'postgres'

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
      await ensureUser(sql, shooter)
      await sql`
        INSERT INTO public.posts (
          id, shooter, roll_id, frame, film_id, photo_hash, tx_hash,
          r2_public_url, scene, featured, caption
        ) VALUES (
          ${p.id}, ${shooter}, ${p.rollId}, ${p.frame}, ${p.filmId},
          ${p.photoHash}, ${p.txHash ?? null}, ${p.imageDataUrl ?? null},
          ${p.scene ?? 'nature'}, true, ${p.caption}
        )
        ON CONFLICT (photo_hash) DO UPDATE
        SET caption = EXCLUDED.caption,
            r2_public_url = COALESCE(EXCLUDED.r2_public_url, public.posts.r2_public_url)
      `
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
