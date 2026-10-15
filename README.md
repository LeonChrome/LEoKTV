# LEoKTV

一个浏览器版私人点歌台。当前 MVP 支持本地音频导入、播放控制、播放进度、音量、歌词滚动、播放队列和键盘快捷键。

## 开发

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

## Windows / Android 预览版

项目使用 Tauri 2 包装桌面和移动端。推送 `v*` 标签后，GitHub Actions 会构建 Windows NSIS 安装包和 Android debug APK，并自动创建一个预发布版本。Android APK 使用 CI 的 debug keystore，适合个人侧载测试；正式分发前需要固定 Android keystore 和 Windows 签名证书。

本地查看原生构建依赖：

```bash
npm run tauri info
```

音乐文件只在浏览器当前会话中通过 `URL.createObjectURL` 播放，不会上传到服务器。

种子歌曲用于演示界面和队列交互，没有内置音频文件；导入本地音频后会使用浏览器的本地播放器。按 `Space` 播放/暂停，使用左右方向键快进或回退 5 秒。

导入立体声音频后，播放器会提供“生成基础伴奏”操作。它使用本机 Web Audio 做中心声道抵消，适合快速预览，效果取决于原曲混音，不等同于 AI 人声分离。

## 后续方向

Windows 与 Android 版本会复用这套界面原型，并将音频处理抽到独立的本地核心：FFmpeg 负责解码与导出，ONNX Runtime 负责调用经过授权的本地人声分离模型。模型处理不会在浏览器演示层中伪造，接入前会单独验证模型权重和依赖许可证。
