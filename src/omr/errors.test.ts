import { describe, expect, it } from 'vitest'
import { explainRecognitionFailure } from './errors'

describe('explainRecognitionFailure', () => {
  it('names the missing onnx file in Chinese', () => {
    const log =
      'ModelError: http://piano.example/models/homr/6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884/PP-OCRv6_rec_small.onnx answered 404 Not Found'
    const text = explainRecognitionFailure('engine_missing', log)
    expect(text).toContain('缺少模型文件 PP-OCRv6_rec_small.onnx')
    expect(text).toContain('models/homr/6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884/PP-OCRv6_rec_small.onnx')
  })
})