# LEoKTV 本地分离 worker

这里记录 Windows 首个高质量分离验证版本的 worker 边界。Windows 发布工作流会用 NumPy/SciPy/ONNX Runtime 和 PyInstaller 打包 `mdx-worker.exe`，模型仍在首次使用时按需下载并校验。Android 暂不包含该 worker，继续使用本地基础预览。

当前 Windows worker 使用 `UVR-MDX-NET-Inst_HQ_4.onnx` 本地 ONNX MDX 2-stem 模型。模型文件按需下载到应用数据目录，下载到 `.partial` 文件，完成 SHA-256 校验后再原子改名。模型、FFmpeg 和 worker 都不接受未经校验的远程文件。

## JSON-lines 协议

输入通过 stdin 逐行发送：

```json
{"id":"job-123","op":"process","root":"C:/Users/.../AppData/Roaming/com.leoktv.app/mdx","input":"C:/Users/.../AppData/Roaming/com.leoktv.app/mdx/input/song.audio"}
```

worker 通过 stdout 返回进度和结果：

```json
{"id":"job-123","event":"progress","value":0.42,"stage":"inference"}
{"id":"job-123","event":"complete","vocals":".../vocals.wav","instrumental":".../instrumental.wav","cached":false}
```

失败、取消和模型缺失都必须返回带 `error` 字段的 JSON 行。路径由 Tauri 侧生成并限制在应用数据目录或临时目录内，worker 不执行任意 shell 字符串。

## 集成顺序

1. 用独立 Windows worker 验证模型效果、分块 overlap-add、缓存和进度。
2. 将 worker 与 FFmpeg 按平台构建并签名，作为 Tauri externalBin 分发。
3. 再将相同协议迁移到 Rust + ONNX Runtime，覆盖 Android arm64 CPU/NNAPI。

本地验证原型需要单独创建 Python 环境并安装 `requirements-worker.txt`。Windows 发布包会把 worker、ONNX Runtime、音频解码库和 FFmpeg 打包进安装程序；模型仍会在第一次点击“AI 伴奏分离”时下载并校验。Android 暂时不包含 MDX worker。
