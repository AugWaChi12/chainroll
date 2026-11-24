import { isAllowedRemoteImageUrl } from '@/server/security/validate'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type VisualTagResult = {
  tags: string[]
  description: string
  nsfw: boolean
  nsfwReason?: string
  model: string
}

const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const

const COMPACT_PROMPT =
  'Return JSON {"tags":[...],"desc":"...","nsfw":false,"nsfwReason":""}. List 10-14 concise visual search keywords in BOTH Thai and English (objects, place, scenery, lighting, time of day, colors, mood). desc: 1 short Thai+English visual phrase (<=120 chars). Set nsfw=true ONLY for explicit 18+ nudity, sexual content, or graphic violence/gore (normal portraits/beaches/street=false).'

/**
 * Bidirectional Thai <-> English visual synonym groups for zero-token query expansion.
 * Searching any word in a group expands to related visual terms in Postgres without calling any AI API.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['แม่น้ำ', 'river', 'ลำน้ำ', 'คลอง', 'canal', 'เจ้าพระยา', 'chao phraya', 'ริมน้ำ', 'waterfront', 'water', 'น้ำ'],
  ['ทะเล', 'sea', 'ocean', 'beach', 'หาด', 'ชายหาด', 'คลื่น', 'wave', 'เกาะ', 'island'],
  ['ภูเขา', 'mountain', 'hill', 'ดอย', 'เขา', 'ป่า', 'forest', 'ธรรมชาติ', 'nature', 'ต้นไม้', 'tree'],
  ['ท้องฟ้า', 'sky', 'เมฆ', 'cloud', 'พระอาทิตย์ตก', 'sunset', 'พระอาทิตย์ขึ้น', 'sunrise', 'แสงเย็น', 'golden hour'],
  ['กลางคืน', 'night', 'นีออน', 'neon', 'ไฟ', 'lights', 'มืด', 'dark', 'ดึก', 'กลางคืนในเมือง'],
  ['เมือง', 'city', 'urban', 'ตึก', 'building', 'ถนน', 'street', 'สตรีท', 'รถ', 'car', 'รถไฟฟ้า', 'train'],
  ['คาเฟ่', 'cafe', 'coffee', 'กาแฟ', 'ร้านกาแฟ', 'ในร่ม', 'indoor', 'โต๊ะ', 'table', 'หน้าต่าง', 'window'],
  ['อาหาร', 'food', 'ขนม', 'dessert', 'เครื่องดื่ม', 'drink', 'ชา', 'tea', 'ราเมน', 'ก๋วยเตี๋ยว', 'street food'],
  ['คน', 'person', 'people', 'พอร์ตเทรต', 'portrait', 'ผู้หญิง', 'woman', 'ผู้ชาย', 'man', 'ยิ้ม', 'smile'],
  ['แมว', 'cat', 'kitten', 'เหมียว', 'สัตว์เลี้ยง', 'pet'],
  ['หมา', 'สุนัข', 'dog', 'puppy', 'สัตว์เลี้ยง', 'pet'],
  ['วัด', 'temple', 'เจดีย์', 'pagoda', 'พระ', 'buddha', 'สถาปัตยกรรม', 'architecture'],
  ['ดอกไม้', 'flower', 'ดอก', 'สวน', 'garden', 'ใบไม้', 'leaf', 'ต้นไม้', 'plant'],
  ['ฝน', 'rain', 'ฝนตก', 'ร่ม', 'umbrella', 'เปียก', 'wet', 'สะท้อน', 'reflection'],
  ['ขาวดำ', 'black and white', 'bw', 'monochrome', 'mono', 'เงา', 'shadow'],
  ['สะพาน', 'bridge', 'เรือ', 'boat', 'ท่าเรือ', 'pier'],
]

export function expandVisualQuery(raw: string): string[] {
  const cleaned = raw.trim().toLowerCase().slice(0, 80)
  if (!cleaned) return []

  const results = new Set<string>([cleaned])
  const tokens = cleaned
    .split(/[\s,#/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1)

  for (const token of tokens) {
    results.add(token)
    for (const group of SYNONYM_GROUPS) {
      if (group.some((term) => term === token || term === cleaned)) {
        for (const synonym of group) {
          results.add(synonym)
          if (results.size >= 16) return [...results]
        }
      }
    }
  }

  return [...results].slice(0, 16)
}

export function defaultSceneTags(scene: string): string[] {
  switch (scene) {
    case 'nature':
      return ['ธรรมชาติ', 'nature', 'แม่น้ำ', 'river', 'ภูเขา', 'mountain', 'ต้นไม้', 'tree', 'ท้องฟ้า', 'sky', 'แสงเย็น', 'golden hour']
    case 'night':
      return ['กลางคืน', 'night', 'นีออน', 'neon', 'เมือง', 'city', 'ถนน', 'street', 'ไฟ', 'lights']
    case 'portrait':
      return ['พอร์ตเทรต', 'portrait', 'คน', 'person', 'ผู้คน', 'people', 'แสงธรรมชาติ', 'natural light']
    case 'indoor':
      return ['คาเฟ่', 'cafe', 'กาแฟ', 'coffee', 'ในร่ม', 'indoor', 'หน้าต่าง', 'window', 'อบอุ่น', 'warm']
    default:
      return ['ฟิล์ม', 'film', '35mm', 'analog']
  }
}

export function parseGeminiVisualResponse(
  rawText: string,
): { tags: string[]; description: string; nsfw: boolean; nsfwReason?: string } | null {
  const trimmed = rawText.trim()
  if (!trimmed) return null

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      tags?: unknown
      desc?: unknown
      description?: unknown
      nsfw?: unknown
      nsfwReason?: unknown
    }
    const rawTags = Array.isArray(parsed.tags) ? parsed.tags : []
    const seen = new Set<string>()
    const tags: string[] = []

    for (const item of rawTags) {
      if (typeof item !== 'string') continue
      const normalized = item.trim().toLowerCase().replace(/^#+/, '').slice(0, 40)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      tags.push(normalized)
      if (tags.length >= 16) break
    }

    const rawDesc =
      typeof parsed.desc === 'string'
        ? parsed.desc
        : typeof parsed.description === 'string'
          ? parsed.description
          : ''
    const description = rawDesc.trim().slice(0, 200)
    const nsfw = parsed.nsfw === true
    const nsfwReason =
      typeof parsed.nsfwReason === 'string' && parsed.nsfwReason.trim()
        ? parsed.nsfwReason.trim().slice(0, 120)
        : undefined

    if (tags.length === 0 && !description && !nsfw) return null
    return { tags, description, nsfw, nsfwReason }
  } catch {
    return null
  }
}

async function loadImageAsBase64(imageSource: string): Promise<{ mimeType: string; data: string } | null> {
  if (!imageSource) return null

  // 1. Data URL
  if (imageSource.startsWith('data:image/')) {
    const match = imageSource.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match?.[1] || !match[2]) return null
    return { mimeType: match[1], data: match[2] }
  }

  // 2. Local sample file under public/samples/ (explicit allowlist prevents Turbopack dynamic-fs tracing warning)
  if (imageSource.startsWith('/samples/')) {
    const fileName = imageSource.slice('/samples/'.length)
    const ALLOWED_SAMPLES = new Set(['nature.jpg', 'night.jpg', 'portrait.jpg', 'indoor.jpg'])
    if (!ALLOWED_SAMPLES.has(fileName)) return null
    const candidates = [
      path.join(process.cwd(), 'public', 'samples', fileName),
      path.join(process.cwd(), 'apps', 'web', 'public', 'samples', fileName),
    ]
    for (const filePath of candidates) {
      try {
        const buf = await readFile(/*turbopackIgnore: true*/ filePath)
        return { mimeType: 'image/jpeg', data: buf.toString('base64') }
      } catch {
        // try next candidate
      }
    }
    return null
  }

  // 3. Remote HTTPS URL (strictly restricted to our Cloudflare R2 public bucket to prevent SSRF)
  if (imageSource.startsWith('https://')) {
    if (!isAllowedRemoteImageUrl(imageSource)) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8_000)
    try {
      const res = await fetch(imageSource, {
        signal: controller.signal,
        redirect: 'error',
      })
      if (!res.ok) return null
      const len = Number(res.headers.get('content-length') ?? 0)
      if (Number.isFinite(len) && len > 4_500_000) return null
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength === 0 || buf.byteLength > 4_500_000) return null
      const ct = (res.headers.get('content-type') ?? 'image/webp').split(';')[0]!.trim()
      const mimeType = ct.startsWith('image/') ? ct : 'image/webp'
      return { mimeType, data: buf.toString('base64') }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  return null
}

/**
 * Ultra-low-token Gemini Vision tagger (~180 total tokens/photo using MEDIA_RESOLUTION_LOW + Flash-Lite).
 * Never throws; returns null when GEMINI_API_KEY is absent or upstream is unavailable.
 */
export async function tagPhotoWithGemini(
  imageSource: string,
  opts?: { caption?: string },
): Promise<VisualTagResult | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return null

  const img = await loadImageAsBase64(imageSource)
  if (!img) return null

  const prompt = opts?.caption?.trim()
    ? `${COMPACT_PROMPT} Caption hint: "${opts.caption.trim().slice(0, 80)}"`
    : COMPACT_PROMPT

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: img.mimeType, data: img.data } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 180,
      responseMimeType: 'application/json',
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
    },
  }

  for (const model of GEMINI_MODELS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        // Fallback to next model on 404/400/503; stop on 401/403
        if (res.status === 401 || res.status === 403) return null
        continue
      }

      const json = (await res.json()) as {
        promptFeedback?: { blockReason?: string }
        candidates?: {
          finishReason?: string
          safetyRatings?: { category?: string; probability?: string }[]
          content?: { parts?: { text?: string }[] }
        }[]
      }

      // Check Gemini native safety block / sexually explicit rating
      const candidate = json.candidates?.[0]
      const safetyFlagged =
        json.promptFeedback?.blockReason === 'SAFETY' ||
        candidate?.finishReason === 'SAFETY' ||
        Boolean(
          candidate?.safetyRatings?.some(
            (r) =>
              r.category === 'HARM_CATEGORY_SEXUALLY_EXPLICIT' &&
              (r.probability === 'HIGH' || r.probability === 'MEDIUM'),
          ),
        )

      const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      const parsed = parseGeminiVisualResponse(text)
      if (parsed) {
        return {
          tags: parsed.tags,
          description: parsed.description,
          nsfw: parsed.nsfw || safetyFlagged,
          nsfwReason: parsed.nsfwReason ?? (safetyFlagged ? 'Gemini safety filter' : undefined),
          model,
        }
      }
      if (safetyFlagged) {
        return {
          tags: [],
          description: '',
          nsfw: true,
          nsfwReason: 'Gemini safety filter (18+)',
          model,
        }
      }
    } catch {
      // try next model
    } finally {
      clearTimeout(timer)
    }
  }

  return null
}
