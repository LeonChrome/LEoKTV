# LEoKTV 本地优先架构

LEoKTV 的界面、曲库索引和音频处理应该保持分层。浏览器原型只负责验证交互，Windows 和 Android 版本复用相同的领域模型，并把耗时的音频处理放到本地核心中。

## 分层

```text
UI（Flutter 或当前 React 原型）
  ├── 曲库、队列、歌词、播放控制
  ├── 分离任务列表和进度
  └── 来源适配器（本地文件、用户授权的来源）
本地核心（Rust/C++）
  ├── FFmpeg：解码、重采样、混音、导出
  ├── ONNX Runtime：人声/伴奏分离模型
  ├── SQLite：曲目、任务、处理版本、历史
  └── 内容寻址文件缓存
```

UI 不直接认识模型文件，也不上传音频。它只调用一个本地任务接口：

```text
createSeparationJob(sourceFile, modelProfile) -> jobId
getJob(jobId) -> queued | running | completed | failed
cancelJob(jobId)
getArtifacts(jobId) -> vocals | instrumental | karaokeMix
```

每个处理任务记录输入文件的 SHA-256、模型名称和版本、参数、设备后端以及输出文件。相同输入、相同模型和相同参数可以直接命中缓存；更换模型后则生成新的处理版本。

## 模型适配

第一批候选模型为 Demucs/HTDemucs、MDX 系列和 RoFormer 系列。实际集成前需要分别确认代码许可证、模型权重许可证和再分发条件。模型应通过统一适配器接入，以便在 Windows 上使用 CPU/DirectML/CUDA，在 Android 上使用 CPU/NNAPI/GPU，并提供明确的回退路径。

## 数据边界

- 原始音频、分离结果、歌词和账号会话默认只保存在本机。
- 账号密码不进入 LEoKTV；来源适配器只接收平台允许的授权结果。
- Bilibili 入口只实现平台允许的搜索、历史、收藏或用户主动导入能力；不实现 DRM 绕过、批量抓取或规避访问限制。
- 任何需要联网的功能必须显式标记，纯本地播放和分离不依赖网络。

## 缓存目录

```text
library/<sha256>/source.*
library/<sha256>/vocals.wav
library/<sha256>/instrumental.wav
library/<sha256>/karaoke.m4a
library/<sha256>/metadata.json
```

缓存可以被用户整体清理，也可以按歌曲或模型版本清理。应用升级不能默认删除用户的原始音频和分离结果。
