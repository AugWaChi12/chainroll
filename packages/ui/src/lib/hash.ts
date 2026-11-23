export function truncateHash(hash: string, head = 6, tail = 4) {
  return hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`
}
