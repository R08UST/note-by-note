import { describe, expect, it } from 'vitest'
import { HOMR_MODELS, modelsForBackend } from './models'

describe('modelsForBackend', () => {
  it('uses the fp16 pair on WebGPU and the fp32 pair on WASM, plus the shared decoder', () => {
    const gpu = modelsForBackend('webgpu').map((file) => file.file)
    const wasm = modelsForBackend('wasm').map((file) => file.file)
    expect(gpu.some((name) => name.endsWith('_fp16.onnx'))).toBe(true)
    expect(gpu.some((name) => name.startsWith('segnet') && !name.includes('fp16'))).toBe(false)
    expect(wasm.some((name) => name.includes('_fp16'))).toBe(false)
    expect(wasm.some((name) => name.startsWith('decoder_'))).toBe(true)
    expect(gpu.some((name) => name.startsWith('decoder_'))).toBe(true)
    expect(HOMR_MODELS.some((file) => file.file.includes('PP-OCR'))).toBe(false)
  })
})
