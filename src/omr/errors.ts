/** Turn a homr-web failure into a sentence that names the missing file. */
export function explainRecognitionFailure(error: string, log: string): string {
  const blob = `${error}\n${log}`
  const file = blob.match(/([A-Za-z0-9_.-]+\.onnx)/)?.[1]
  const located = blob.match(/models\/homr\/[0-9a-f]{8}[^)\s]*/)?.[0]
  const missing = error === 'engine_missing' || /answered 404|fetch-failed/.test(blob)
  if (missing) {
    const name = file ?? '未知文件'
    const where = located ? `（${located}）` : ''
    return `缺少模型文件 ${name}${where}。请确认网站上有这个文件后再试。`
  }
  const detail = log.trim() || error
  return detail
}
