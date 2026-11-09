# 钢琴练习 Note by Note — 在自己的电脑上运行

这是一个在浏览器里打开的钢琴识谱和节奏练习页。解压后是一组静态文件，不需要安装数据库，也不需要注册账号。

## 怎么打开

1. 把压缩包解压到一个文件夹。
2. 不要直接双击 `index.html`。浏览器会把本地文件当成不安全页面，MIDI 键盘会无法使用。请在这个文件夹里开一个本地服务器。
3. 打开终端，进入解压后的文件夹，任选一种方式：

```bash
npx serve
```

或：

```bash
python3 -m http.server 4317
```

4. 用 **Chrome** 或 **Edge** 打开终端里显示的地址，例如 `http://localhost:3000` 或 `http://localhost:4317`。
5. 插上 MIDI 键盘。点击页面上的 **Enable MIDI**，在浏览器弹出的提示里允许访问 MIDI 设备，然后在列表中选择你的键盘。

Web MIDI 只能在安全环境下使用。本机的 `localhost` / `127.0.0.1` 可以。如果用局域网里的普通 `http://` 地址打开，浏览器不会提供 MIDI。

页面使用相对路径，所以整个文件夹放在网站的子目录里也能打开，不必放在网站根目录。

## 没有 MIDI 键盘时

可以用鼠标点击屏幕上的琴键，也可以用电脑键盘：

- 字母 **Q** 那一行从中央 C（C4）开始
- 字母 **Z** 那一行从 C3 开始
- 这两行之间的按键是黑键

## 怎么练

- **Wait（等待）**：光标停在当前这一拍，弹对了才前进。弹错会提示，但不会跳过，可以再试。
- **Rhythm（节奏）**：先给一小节预备拍和节拍器，光标随时间前进，并记录每个音偏早还是偏晚。

可以调节速度（BPM，以四分音符计）、左右手、模式，以及延迟校准。如果键盘的声音总是偏晚，把 Latency 调大，直到准时弹奏落在中间的绿色区域。

点 **Stop**，或把曲子弹完，页面会给出这次的命中率、平均时差、时值分散程度，以及每一小节的错误数。设置和最近一次成绩保存在这个浏览器里。

## 乐谱

内置三首短曲：Twinkle, Twinkle（右手）、Light Steps（双手）、Sunday Chords（和弦）。也可以在「练习」里打开自己的 `.musicxml`、`.xml` 或 `.mxl` 文件。

页面上方有五个标签：练习、视奏、识谱、记录、设置。地址栏的 `#practice`、`#omr` 等可以直接打开对应标签。

「识谱」在浏览器里用 homr 把乐谱照片转成 MusicXML。模型文件已经放在这个压缩包的 `models/homr/` 里，第一次打开识谱时会缓存到本机，第二次不用重新下载。这一部分使用 AGPL-3.0 许可的 [homr-web](https://github.com/jymen/homr-web)（移植自 [homr](https://github.com/liebharc/homr)）。

如果要用多线程的 WebAssembly，网站需要加上：

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

有 WebGPU 时不依赖这两项。没有的话，识别仍会在单线程 WebAssembly 上运行，只是更慢。
