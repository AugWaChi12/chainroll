import 'server-only'

import crypto from 'node:crypto'

export type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  publicBucket: string
  privateBucket: string
  publicBaseUrl: string
}

export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const publicBucket = process.env.R2_PUBLIC_BUCKET?.trim()
  const privateBucket = process.env.R2_PRIVATE_BUCKET?.trim()
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim()?.replace(/\/+$/, '')

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicBucket ||
    !privateBucket ||
    !publicBaseUrl
  ) {
    return null
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    publicBucket,
    privateBucket,
    publicBaseUrl,
  }
}

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest()
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/**
 * Generates an AWS Signature Version 4 presigned URL for Cloudflare R2 (PUT or GET).
 * Zero external SDK dependencies — pure Node `crypto`.
 */
export function signR2PresignedUrl(input: {
  config: R2Config
  method: 'PUT' | 'GET' | 'DELETE'
  bucket: string
  key: string
  expiresInSec: number
  contentType?: string
}): string {
  const { config, method, bucket, key, expiresInSec, contentType } = input
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`

  const cleanKey = key.replace(/^\/+/, '')
  const canonicalUri = `/${encodeRfc3986(bucket)}/${cleanKey.split('/').map(encodeRfc3986).join('/')}`

  const signedHeaders = contentType ? 'content-type;host' : 'host'
  const canonicalHeaders = contentType
    ? `content-type:${contentType}\nhost:${host}\n`
    : `host:${host}\n`

  const queryEntries: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresInSec)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ]
  queryEntries.sort(([a], [b]) => a.localeCompare(b))
  const canonicalQuery = queryEntries
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join('&')

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

export function publicFeedKey(photoHash: string): string {
  return `feed/${photoHash.toLowerCase()}.webp`
}

export function privateOriginalKey(photoHash: string): string {
  return `originals/${photoHash.toLowerCase()}.webp`
}

export function publicFeedUrl(config: R2Config, photoHash: string): string {
  return `${config.publicBaseUrl}/${publicFeedKey(photoHash)}`
}
