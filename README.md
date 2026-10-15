# LEoKTV

一个浏览器版私人点歌台。当前 MVP 支持本地音频导入、播放控制、播放进度、音量、歌词滚动和播放队列。

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

音乐文件只在浏览器当前会话中通过 `URL.createObjectURL` 播放，不会上传到服务器。
