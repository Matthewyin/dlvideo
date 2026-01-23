# DLYouTube

一款简洁易用的 YouTube 视频下载工具，基于 Electron 构建的桌面应用。

## ✨ 功能特性

- 🎬 **视频下载** - 支持多种分辨率和格式（MP4、MKV、WebM）
- 🎵 **音频提取** - 仅下载音频，自动转换为 MP3
- 📁 **播放列表** - 批量下载整个播放列表，支持选择性下载
- 📝 **字幕下载** - 支持多语言字幕下载
- 🔄 **格式转换** - 下载后自动转换为指定格式
- 🌐 **代理支持** - 支持 HTTP/SOCKS 代理配置
- 📜 **下载历史** - 记录下载历史，方便查找

## 🛠 技术栈

- **Electron** - 跨平台桌面应用框架
- **React 18** - 用户界面
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **Tailwind CSS** - 样式框架
- **Zustand** - 状态管理
- **yt-dlp** - YouTube 下载核心（已内置）
- **better-sqlite3** - 本地数据库

## 📦 安装

### 从 Release 下载

前往 [Releases](https://github.com/Matthewyin/dlyoutube/releases) 页面下载最新版本的安装包。

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/Matthewyin/dlyoutube.git
cd dlyoutube

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建生产版本
npm run electron:build
```

## 🚀 使用方法

1. **粘贴链接** - 在输入框中粘贴 YouTube 视频或播放列表链接
2. **选择配置** - 选择视频格式、分辨率等下载选项
3. **开始下载** - 点击下载按钮开始下载
4. **查看进度** - 在下载队列中查看下载进度

### 支持的链接格式

- 单个视频：`https://www.youtube.com/watch?v=xxxxx`
- 短链接：`https://youtu.be/xxxxx`
- 播放列表：`https://www.youtube.com/playlist?list=xxxxx`
- Shorts：`https://www.youtube.com/shorts/xxxxx`

## ⚙️ 配置

在「设置」页面可以配置：

- **下载路径** - 视频保存位置
- **代理服务器** - HTTP/SOCKS 代理地址（如 `http://127.0.0.1:7890`）

## 📋 系统要求

- macOS 10.13 或更高版本（当前仅支持 macOS）
- 约 200MB 磁盘空间

## 🔧 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建渲染进程
npm run build:renderer

# 构建主进程
npm run build:main

# 打包应用
npm run electron:build
```

## 📄 许可证

MIT License

## 🙏 致谢

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 强大的视频下载工具
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架

