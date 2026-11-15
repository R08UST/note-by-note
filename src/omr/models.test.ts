import { describe, expect, it } from 'vitest'
import { modelsForBackend } from './models'

describe('modelsForBackend', () => {
  it('uses the fp16 pair on WebGPU and the fp32 pair on WASM, plus the shared decoder', () => {
    const gpu = modelsForBackend('webgpu').map((file) => file.file)
    const wasm = modelsForBackend('wasm').map((file) => file.file)
    expect(gpu.some((name) => name.endsWith('_fp16.onnx'))).toBe(true)
    expect(gpu.some((name) => name.startsWith('segnet') && !name.includes('fp16'))).toBe(false)
    expect(wasm.some((name) => name.includes('_fp16'))).toBe(false)
    expect(wasm.some((name) => name.startsWith('decoder_'))).toBe(true)
    expect(gpu.some((name) => name.startsWith('decoder_') && !name.includes('web_fp16'))).toBe(true)
    expect(gpu.some((name) => name.includes('web_fp16'))).toBe(false)
    expect(wasm.some((name) => name === 'PP-OCRv6_rec_small.onnx')).toBe(true)
    expect(gpu.some((name) => name === 'PP-OCRv6_det_small.onnx')).toBe(true)
  })

  it('leaves the RapidOCR and tablature files to the engine when OCR is off', () => {
    const off = modelsForBackend('webgpu', { ocr: false }).map((file) => file.file)
    expect(off.some((name) => name.includes('PP-OCRv6'))).toBe(false)
    expect(off.some((name) => name.includes('ppocr'))).toBe(false)
    expect(off).not.toContain('tab-digits-037fac028e12.onnx')
    expect(off.some((name) => name.startsWith('segnet'))).toBe(true)
    expect(off.some((name) => name.startsWith('decoder_'))).toBe(true)
  })
})
