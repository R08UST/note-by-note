import { unzipSync } from 'fflate'

function decode(data: Uint8Array): string {
  return new TextDecoder().decode(data)
}

/** Unpack a compressed .mxl score to MusicXML text. */
export function unpackMxl(data: Uint8Array): string {
  const files = unzipSync(data)
  const container = files['META-INF/container.xml']
  if (container) {
    const path = decode(container).match(/full-path="([^"]+)"/)?.[1]
    if (path && files[path]) return decode(files[path])
  }
  const fallback = Object.entries(files).find(
    ([name]) => name.toLowerCase().endsWith('.xml') && !name.includes('META-INF'),
  )
  if (!fallback) throw new Error('The .mxl archive does not contain a score.')
  return decode(fallback[1])
}

export async function readScoreFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.mxl')) {
    return unpackMxl(new Uint8Array(await file.arrayBuffer()))
  }
  return file.text()
}
