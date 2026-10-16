# LEoKTV 开发路线

## 已完成

- React + TypeScript 本地 KTV 交互原型
- 本地音频导入和浏览器播放
- 歌曲搜索、播放队列、歌词展示、进度和音量控制
- 队列记忆和 Space/方向键快捷操作
- 生产构建和本地 Vite 启动检查
- Tauri 2 Windows/Android 外壳和标签发布工作流
- IndexedDB 本地音频与歌词持久化

## 下一步：本地音频核心

1. 抽象分离任务和缓存数据模型。
2. 建立 FFmpeg 音频探测、重采样和导出流程。
3. 集成一个许可证清晰的 ONNX MDX 2-stem 本地分离模型，先实现 Windows CPU 版本。
4. 增加分离进度、取消、失败重试和结果试听。
5. 用固定测试集记录人声残留、伴奏失真、处理速度和内存占用。

第一阶段模型不随安装包捆绑。首次使用时显示模型大小、许可证和预计磁盘空间，下载完成并通过 SHA-256 校验后才允许开始处理。

Windows 首个 AI 验证版本会先用独立 worker + JSON-lines 进度协议，避免把 Python/PyTorch 或模型权重塞进安装包；确认 MDX ONNX 的效果和缓存行为后，再做 Rust/ONNX Runtime 的跨平台实现。

## 跨平台

1. 将音频核心封装成 Rust/C++ 动态库或命令行服务。
2. 在 Android 接入 ONNX Runtime 的 CPU/NNAPI 后端。
3. 将当前界面原型迁移到 Flutter，或通过 Tauri/Android bridge 复用前端。
4. 增加 Android 分区存储、后台任务、通知和缓存空间管理。

当前 GitHub Actions 会在 `v*` 标签上构建 Windows NSIS 安装包和 Android APK，并生成预发布版本。Android 产物暂时是个人侧载测试包，原生构建需要 CI 提供 Rust、JDK、Android SDK 和 NDK。

## 来源适配器

在本地核心稳定后，再实现合规的来源适配器。每个适配器必须有清晰的授权边界、退出登录、缓存清理和禁用选项；不能让第三方平台的登录或网络变化阻塞本地导入和本地分离。
