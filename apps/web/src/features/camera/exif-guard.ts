/**
 * Lightweight zero-dependency EXIF reader for JPEG files.
 * Rejects downloaded/stripped images (missing camera Make/Model or DateTimeOriginal)
 * and photos not captured today in Asia/Bangkok (UTC+7).
 */

export type ExifCheckResult =
  | { ok: true; make: string; model: string; takenAt: string }
  | { ok: false; reason: 'no-exif' | 'not-today' }

function bangkokDateKey(date: Date): string {
  // Format YYYY:MM:DD in Asia/Bangkok (UTC+7)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return parts.replace(/-/g, ':')
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = ''
  const end = Math.min(view.byteLength, offset + length)
  for (let i = offset; i < end; i++) {
    const ch = view.getUint8(i)
    if (ch === 0) break
    out += String.fromCharCode(ch)
  }
  return out.trim()
}

function readStringTag(
  view: DataView,
  tiffStart: number,
  entryOffset: number,
  littleEndian: boolean,
): string | null {
  const type = view.getUint16(entryOffset + 2, littleEndian)
  const count = view.getUint32(entryOffset + 4, littleEndian)
  if (type !== 2 || count === 0) return null
  if (count <= 4) {
    return readAscii(view, entryOffset + 8, count)
  }
  const valueOffset = view.getUint32(entryOffset + 8, littleEndian)
  const abs = tiffStart + valueOffset
  if (abs < 0 || abs >= view.byteLength) return null
  return readAscii(view, abs, count)
}

function parseJpegExif(buf: ArrayBuffer): {
  make?: string
  model?: string
  dateTimeOriginal?: string
  dateTime?: string
} | null {
  if (buf.byteLength < 12) return null
  const view = new DataView(buf)
  if (view.getUint16(0, false) !== 0xffd8) return null // not JPEG

  let pos = 2
  while (pos + 4 <= view.byteLength) {
    const marker = view.getUint16(pos, false)
    pos += 2
    if (marker === 0xffda || marker === 0xffd9) break
    const segLen = view.getUint16(pos, false)
    if (segLen < 2 || pos + segLen > view.byteLength) break

    if (marker === 0xffe1 && pos + 8 < view.byteLength) {
      // Check "Exif\0\0"
      if (
        view.getUint8(pos + 2) === 0x45 &&
        view.getUint8(pos + 3) === 0x78 &&
        view.getUint8(pos + 4) === 0x69 &&
        view.getUint8(pos + 5) === 0x66
      ) {
        const tiffStart = pos + 8
        if (tiffStart + 8 > view.byteLength) return null
        const byteOrder = view.getUint16(tiffStart, false)
        const littleEndian = byteOrder === 0x4949
        if (!littleEndian && byteOrder !== 0x4d4d) return null

        const ifd0Rel = view.getUint32(tiffStart + 4, littleEndian)
        const ifd0 = tiffStart + ifd0Rel
        if (ifd0 + 2 > view.byteLength) return null

        const result: {
          make?: string
          model?: string
          dateTimeOriginal?: string
          dateTime?: string
        } = {}
        let exifIfdOffset: number | null = null

        const entries = view.getUint16(ifd0, littleEndian)
        for (let i = 0; i < entries; i++) {
          const entry = ifd0 + 2 + i * 12
          if (entry + 12 > view.byteLength) break
          const tag = view.getUint16(entry, littleEndian)
          if (tag === 0x010f) result.make = readStringTag(view, tiffStart, entry, littleEndian) ?? undefined
          else if (tag === 0x0110) result.model = readStringTag(view, tiffStart, entry, littleEndian) ?? undefined
          else if (tag === 0x0132) result.dateTime = readStringTag(view, tiffStart, entry, littleEndian) ?? undefined
          else if (tag === 0x8769) exifIfdOffset = tiffStart + view.getUint32(entry + 8, littleEndian)
        }

        if (exifIfdOffset && exifIfdOffset + 2 <= view.byteLength) {
          const subEntries = view.getUint16(exifIfdOffset, littleEndian)
          for (let i = 0; i < subEntries; i++) {
            const entry = exifIfdOffset + 2 + i * 12
            if (entry + 12 > view.byteLength) break
            const tag = view.getUint16(entry, littleEndian)
            if (tag === 0x9003 || tag === 0x9004) {
              const dt = readStringTag(view, tiffStart, entry, littleEndian)
              if (dt && !result.dateTimeOriginal) result.dateTimeOriginal = dt
            }
          }
        }

        return result
      }
    }
    pos += segLen
  }
  return null
}

export async function verifyPhotoTakenToday(file: File): Promise<ExifCheckResult> {
  // Read first 128 KB (EXIF APP1 header always sits at the start of the file)
  const slice = file.slice(0, 128 * 1024)
  const buf = await slice.arrayBuffer()
  const exif = parseJpegExif(buf)

  const takenRaw = exif?.dateTimeOriginal ?? exif?.dateTime
  const hasCamera = Boolean(exif?.make || exif?.model)

  // Downloaded images, screenshots, and web-saved images have no camera EXIF metadata
  if (!exif || !takenRaw || !hasCamera) {
    return { ok: false, reason: 'no-exif' }
  }

  // EXIF date format is "YYYY:MM:DD HH:MM:SS"
  const datePart = takenRaw.slice(0, 10)
  const todayBangkok = bangkokDateKey(new Date())
  if (datePart !== todayBangkok) {
    return { ok: false, reason: 'not-today' }
  }

  return {
    ok: true,
    make: exif.make ?? '',
    model: exif.model ?? '',
    takenAt: takenRaw,
  }
}
