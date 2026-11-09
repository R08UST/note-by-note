# homr model files

These weights are not stored in git. `npm run fetch-models` downloads them into this directory as `public/models/homr/<sha256>/<filename>`, which Vite copies to `dist/models/homr/`.

homr-web fetches `${baseUrl}/${sha256}/${filename}` and checks the SHA-256. The app's base URL is `models/homr/` relative to the page, so a site served from a subfolder still finds them.

OCR models are not downloaded. The 识谱 tab calls `recognizePage` with `ocr: false`.

| SHA-256 | File | Used on | Bytes |
| --- | --- | --- | --- |
| `60f495496cb41473c0521d0811d8f44b9d5cff892d287974a8aebb3eaee2fa83` | `segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f_fp16.onnx` | WebGPU | 28667207 |
| `9db62d5a6a13c8df2df321af3bcf72c7f81a95d4f876d4f0c202b28f8658087e` | `encoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903_fp16.onnx` | WebGPU | 26466256 |
| `6ed36640db4ef5d223098b6d5efe4eda97c66b24a2c72faab8a018c749003a8d` | `segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx` | WebAssembly | 57311361 |
| `4c16df852b3789f2676b0d49f0545dab0740e4005f7b472c5252add642f5d5eb` | `encoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903.onnx` | WebAssembly | 52861122 |
| `3e10fd5ae52d0b86792721922fcd954c283a7ed365de7446425bdabe38f3e57d` | `decoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903.onnx` | both | 47299551 |
| `037fac028e121b4d133e5f6bcd1099a1914e692e68ed90f7d3e1bb94d5bdcda3` | `tab-digits-037fac028e12.onnx` | tab frets | 471919 |

The five homr files come zipped from [homr `onnx_checkpoints`](https://github.com/liebharc/homr/releases/tag/onnx_checkpoints). The tab-digit file comes from the [homr-web `models-homr0.7.0` release](https://github.com/jymen/homr-web/releases/tag/models-homr0.7.0). `scripts/fetch-homr-models.mjs` checks each hash before saving.

Total about 213 MB. The three OCR files homr-web can also use (about 32 MB) are listed in the homr-web README and are not required here.
