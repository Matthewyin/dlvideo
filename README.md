# DLVideo

一款简洁易用的视频下载工具，支持 YouTube、B站等平台，基于 Electron 构建的桌面应用。

## 功能特性

 - **多平台支持** - 支持 YouTube、B站（Bilibili）等主流视频平台
 - **高速下载** - 内置 aria2c 多线程下载，速度提升 3-5 倍
 - **视频音频合并** - 自动合并视频和音频为单个 MP4 文件
 - **字幕嵌入** - 默认下载并嵌入字幕（英文/中文），支持多语言
 - **元数据嵌入** - 自动嵌入缩略图和视频元数据
 - **播放列表** - 批量下载整个播放列表，支持选择性下载
 - **格式转换** - 支持多种格式转换（MP4、MKV、WebM）
 - **代理支持** - 支持 HTTP/SOCKS 代理配置
 - **下载历史** - 记录下载历史，方便查找
 - **Cookies 管理** - 支持导入 Cookies 用于受限视频下载
 - **yt-dlp 自动更新** - 应用启动时静默检查更新，有新版本时显示通知

## 技术栈

 - **Electron** - 跨平台桌面应用框架
 - **React 18** - 用户界面
 - **TypeScript** - 类型安全
 - **Vite** - 快速构建工具
 - **Tailwind CSS** - 样式框架
 - **Zustand** - 状态管理
 - **yt-dlp** - 视频下载核心（已内置，支持 1000+ 网站）
 - **ffmpeg** - 视频音频处理（已内置）
 - **aria2c** - 高速多线程下载（已内置）
 - **Deno** - JavaScript 运行时（已内置，用于解决 YouTube JS challenge）
 - **better-sqlite3** - 本地数据库

## 安装

### 从 Release 下载

前往 [Releases](https://github.com/Matthewyin/dlvideo/releases) 页面下载最新版本的安装包。

**系统要求：**
 - macOS 10.13 或更高版本（ARM64/Intel）
 - 约 300MB 磁盘空间（包含内置工具）

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/Matthewyin/dlvideo.git
cd dlvideo

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建生产版本
npm run electron:build
```

## 使用方法

1. **粘贴链接** - 在输入框中粘贴视频链接（支持 YouTube、B站）
2. **选择配置** - 选择视频格式、分辨率等下载选项
3. **开始下载** - 点击下载按钮开始下载
4. **查看进度** - 在下载队列中查看下载进度

### 支持的链接格式

**YouTube:**
 - 单个视频：`https://www.youtube.com/watch?v=xxxxx`
 - 短链接：`https://youtu.be/xxxxx`
 - 播放列表：`https://www.youtube.com/playlist?list=xxxxx`
 - Shorts：`https://www.youtube.com/shorts/xxxxx`

**B站 (Bilibili):**
 - 普通视频：`https://www.bilibili.com/video/BVxxxxx`
 - AV号视频：`https://www.bilibili.com/video/avxxxxx`
 - 短链接：`https://b23.tv/xxxxx`
 - 番剧：`https://www.bilibili.com/bangumi/play/ssxxxxx`

## 设置

在「设置」页面可以配置：

 - **下载路径** - 视频保存位置
 - **代理服务器** - HTTP/SOCKS 代理地址（如 `http://127.0.0.1:7890`）
 - **Cookies 来源** - 选择浏览器或手动导入 Cookies 文件
 - **yt-dlp 更新** - 查看当前版本并手动更新

## Cookies 管理

对于受限制的视频（需要登录或年龄验证），可以：

1. **浏览器导入** - 从 Chrome/Safari 自动导入 Cookies
2. **手动导入** - 使用浏览器扩展导出 Cookies 文件后导入

推荐使用 **"Get cookies.txt LOCALLY"** 扩展导出 Cookies。

## 开发

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

## 免责声明

### 个人兴趣项目

本项目是个人兴趣开发的工具，旨在学习和研究视频下载技术。

### 非商用声明

本项目仅供个人学习、研究和非商业用途使用。**严禁用于任何商业目的**，包括但不限于：
 - 商业销售或出租
 - 收费服务
 - 广告或营利活动
 - 任何形式的商业化

### 法律合规

使用本工具时，用户需要：

1. **遵守当地法律** - 确保下载行为符合所在国家/地区的法律法规
2. **尊重平台条款** - 遵守 YouTube、B站等平台的服务条款和使用政策
3. **尊重版权** - 仅下载有权下载的内容，尊重内容创作者的知识产权
4. **个人责任** - 用户对自己的下载行为和后果承担全部责任

### 内容创作者权利

 - 本工具不应用于侵犯他人版权或知识产权
 - 下载的内容应仅供个人使用，不得用于商业目的或二次传播
 - 尊重内容创作者的劳动成果和权益

### 免责条款

本项目开发者不对以下情况承担任何责任：
 - 用户因使用本工具而违反当地法律
 - 用户因使用本工具而侵犯他人版权或知识产权
 - 用户因使用本工具而被平台封禁或受到法律处罚
 - 因使用本工具导致的任何数据丢失或损害

**使用本工具即表示你已理解并同意上述条款。**

## 许可证

MIT License

## 致谢

 - [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 强大的视频下载工具
 - [ffmpeg](https://ffmpeg.org/) - 视频处理工具
 - [aria2](https://aria2.github.io/) - 高速下载工具
 - [Deno](https://deno.com/) - JavaScript 运行时
 - [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
