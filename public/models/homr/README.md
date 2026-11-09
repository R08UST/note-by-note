# homr model files

These weights are not stored in git. `npm run fetch-models` downloads them into this directory as `public/models/homr/<sha256>/<filename>`, which Vite copies to `dist/models/homr/`.

homr-web fetches `${baseUrl}/${sha256}/${filename}` and checks the SHA-256. The app's base URL is `models/homr/` relative to the page, so a site served from a subfolder still finds them.

`recognizePage` is called with `ocr: false`, so chord and title text are not read. The tab guard can still download `PP-OCRv6_rec_small.onnx` when a five-line staff has marks it wants to check. The detector and classifier are fetched only if a system is treated as tablature. All three are listed so that path does not 404.

The default WebGPU catalog keeps the decoder on the CPU and uses the shared fp32 file below. It does **not** request `decoder_pytorch_model_396-…_web_fp16.onnx` (`253172b0…`, about 94 MB, homr-web release `models-homr0.7.0`). That file is only for `WEBGPU_DECODER_CATALOG`, which this app does not use.

| SHA-256 | File | Used on | Bytes |
| --- | --- | --- | --- |
| `60f495496cb41473c0521d0811d8f44b9d5cff892d287974a8aebb3eaee2fa83` | `segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f_fp16.onnx` | WebGPU | 28667207 |
| `9db62d5a6a13c8df2df321af3bcf72c7f81a95d4f876d4f0c202b28f8658087e` | `encoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903_fp16.onnx` | WebGPU | 26466256 |
| `6ed36640db4ef5d223098b6d5efe4eda97c66b24a2c72faab8a018c749003a8d` | `segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx` | WebAssembly | 57311361 |
| `4c16df852b3789f2676b0d49f0545dab0740e4005f7b472c5252add642f5d5eb` | `encoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903.onnx` | WebAssembly | 52861122 |
| `3e10fd5ae52d0b86792721922fcd954c283a7ed365de7446425bdabe38f3e57d` | `decoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903.onnx` | both | 47299551 |
| `037fac028e121b4d133e5f6bcd1099a1914e692e68ed90f7d3e1bb94d5bdcda3` | `tab-digits-037fac028e12.onnx` | tab frets | 471919 |
| `090f04abcd9d9a7498bc4ebf677e4cb9bdce1fe4197ddb7e529f1ef44e1ff94f` | `PP-OCRv6_det_small.onnx` | OCR detect | 9929594 |
| `6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884` | `PP-OCRv6_rec_small.onnx` | OCR recognise | 21234383 |
| `e47acedf663230f8863ff1ab0e64dd2d82b838fceb5957146dab185a89d6215c` | `ch_ppocr_mobile_v2.0_cls_mobile.onnx` | OCR direction | 585532 |

The five homr files come zipped from [homr `onnx_checkpoints`](https://github.com/liebharc/homr/releases/tag/onnx_checkpoints). The tab-digit file comes from the [homr-web `models-homr0.7.0` release](https://github.com/jymen/homr-web/releases/tag/models-homr0.7.0). The three RapidOCR files (Apache-2.0) come from ModelScope `RapidAI/RapidOCR` `v3.9.2`: `onnx/PP-OCRv6/det/`, `onnx/PP-OCRv6/rec/`, and `onnx/PP-OCRv4/cls/`. `scripts/fetch-homr-models.mjs` checks each hash before saving.

Music models are about 213 MB. The three OCR files add about 32 MB.
