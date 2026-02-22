import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// 下载选项接口
interface DownloadOptions {
  url: string
  outputPath: string
  filename: string
  formatId?: string
  audioOnly?: boolean
  subtitles?: boolean
  subtitleLang?: string
  proxyUrl?: string
  convertFormat?: string // 转换目标格式
}

// 历史记录接口
interface HistoryItem {
  id: string
  videoId: string
  title: string
  thumbnail: string
  channel: string
  duration: number
  durationFormatted: string
  formatId: string
  resolution: string
  ext: string
  filePath: string
  fileSize: number | null
  downloadedAt: string
  url: string
}

// Cookies 来源浏览器类型
type CookiesBrowser = 'none' | 'chrome' | 'safari'

// 设置接口
interface AppSettings {
  downloadPath: string
  defaultFormat: string
  defaultResolution: string
  maxConcurrentDownloads: number
  autoDetectClipboard: boolean
  showNotifications: boolean
  proxyEnabled: boolean
  proxyUrl: string
  cookiesBrowser: CookiesBrowser
  // B站相关设置
  bilibiliCookiesImported: boolean
}

// 下载进度接口
interface DownloadProgress {
  taskId: string
  percent: number
  speed: string
  eta: string
  totalSize: string
  downloadedSize: string
}

// 下载结果接口
interface DownloadResult {
  taskId: string
  success: boolean
  filePath?: string
  error?: string
}

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 选择下载目录
  selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),

  // 获取默认下载路径
  getDefaultDownloadPath: () => ipcRenderer.invoke('get-default-download-path'),

  // 打开文件夹
  openFolder: (path: string) => ipcRenderer.invoke('open-folder', path),

  // 在文件管理器中显示文件
  showItemInFolder: (path: string) => ipcRenderer.invoke('show-item-in-folder', path),

  // 解析视频信息
  parseVideo: (url: string) => ipcRenderer.invoke('parse-video', url),

  // 解析播放列表
  parsePlaylist: (url: string) => ipcRenderer.invoke('parse-playlist', url),

  // 开始下载
  startDownload: (taskId: string, options: DownloadOptions) =>
    ipcRenderer.invoke('start-download', taskId, options),

  // 取消下载
  cancelDownload: (taskId: string) => ipcRenderer.invoke('cancel-download', taskId),

  // 监听下载进度
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const handler = (_event: IpcRendererEvent, progress: DownloadProgress) => callback(progress)
    ipcRenderer.on('download-progress', handler)
    return () => ipcRenderer.removeListener('download-progress', handler)
  },

  // 监听下载完成
  onDownloadComplete: (callback: (result: DownloadResult) => void) => {
    const handler = (_event: IpcRendererEvent, result: DownloadResult) => callback(result)
    ipcRenderer.on('download-complete', handler)
    return () => ipcRenderer.removeListener('download-complete', handler)
  },

  // 监听 yt-dlp 更新通知
  onYtDlpUpdateAvailable: (callback: (hasUpdate: boolean, version: string) => void) => {
    const handler = (_event: IpcRendererEvent, data: { hasUpdate: boolean; version: string }) =>
      callback(data.hasUpdate, data.version)
    ipcRenderer.on('ytdlp-update-available', handler)
    return () => ipcRenderer.removeListener('ytdlp-update-available', handler)
  },

  // ============ 数据库相关 API ============

  // 获取所有设置
  getSettings: () => ipcRenderer.invoke('get-settings'),

  // 保存设置
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('save-settings', settings),

  // 获取历史记录
  getHistory: (limit?: number, offset?: number) =>
    ipcRenderer.invoke('get-history', limit, offset),

  // 搜索历史记录
  searchHistory: (query: string) => ipcRenderer.invoke('search-history', query),

  // 添加历史记录
  addHistory: (item: HistoryItem) => ipcRenderer.invoke('add-history', item),

  // 删除历史记录
  deleteHistory: (id: string) => ipcRenderer.invoke('delete-history', id),

  // 清空历史记录
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // 获取历史记录数量
  getHistoryCount: () => ipcRenderer.invoke('get-history-count'),

  // ============ 登录相关 API ============

  // 打开系统浏览器登录
  openBrowserLogin: () => ipcRenderer.invoke('open-youtube-login'),

  // 导入 Cookies 文件
  importCookiesFile: () => ipcRenderer.invoke('import-cookies-file'),

  // 检查 YouTube 登录状态
  checkYouTubeLogin: () => ipcRenderer.invoke('check-youtube-login'),

  // 登出 YouTube
  logoutYouTube: () => ipcRenderer.invoke('logout-youtube'),

  // 获取 cookies 文件路径
  getCookiesFilePath: () => ipcRenderer.invoke('get-cookies-file-path'),

  // ============ B站 登录相关 API ============

  // 打开系统浏览器登录 B站
  openBilibiliLogin: () => ipcRenderer.invoke('open-bilibili-login'),

  // 导入 B站 Cookies 文件
  importBilibiliCookiesFile: () => ipcRenderer.invoke('import-bilibili-cookies-file'),

  // 检查 B站 登录状态
  checkBilibiliLogin: () => ipcRenderer.invoke('check-bilibili-login'),

  // 登出 B站
  logoutBilibili: () => ipcRenderer.invoke('logout-bilibili'),

  // 平台信息
  platform: process.platform,

  // ============ yt-dlp 更新相关 API ============

  // 获取 yt-dlp 版本
  getYtDlpVersion: () => ipcRenderer.invoke('get-ytdlp-version'),

  // 更新 yt-dlp
  updateYtDlp: () => ipcRenderer.invoke('update-ytdlp'),
})

// TypeScript 类型声明
declare global {
  interface Window {
    electronAPI: {
      selectDownloadPath: () => Promise<string | null>
      getDefaultDownloadPath: () => Promise<string>
      openFolder: (path: string) => Promise<void>
      showItemInFolder: (path: string) => Promise<void>
      parseVideo: (url: string) => Promise<{ success: boolean; data?: any; isPlaylist?: boolean; error?: string }>
      parsePlaylist: (url: string) => Promise<{ success: boolean; data?: any; error?: string }>
      startDownload: (taskId: string, options: DownloadOptions) => Promise<{ success: boolean; error?: string }>
      cancelDownload: (taskId: string) => Promise<boolean>
      onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
      onDownloadComplete: (callback: (result: DownloadResult) => void) => () => void
      onYtDlpUpdateAvailable: (callback: (hasUpdate: boolean, version: string) => void) => () => void
      // 数据库相关
      getSettings: () => Promise<Partial<AppSettings>>
      saveSettings: (settings: AppSettings) => Promise<{ success: boolean; error?: string }>
      getHistory: (limit?: number, offset?: number) => Promise<HistoryItem[]>
      searchHistory: (query: string) => Promise<HistoryItem[]>
      addHistory: (item: HistoryItem) => Promise<{ success: boolean; error?: string }>
      deleteHistory: (id: string) => Promise<{ success: boolean; error?: string }>
      clearHistory: () => Promise<{ success: boolean; error?: string }>
      getHistoryCount: () => Promise<number>
      // YouTube 登录相关
      openYouTubeLogin: () => Promise<{ success: boolean; message?: string }>
      importCookiesFile: () => Promise<{ success: boolean; message?: string }>
      checkYouTubeLogin: () => Promise<{ loggedIn: boolean }>
      logoutYouTube: () => Promise<{ success: boolean; message?: string }>
      getCookiesFilePath: () => Promise<string>
      // B站 登录相关
      openBilibiliLogin: () => Promise<{ success: boolean; message?: string }>
      importBilibiliCookiesFile: () => Promise<{ success: boolean; message?: string }>
      checkBilibiliLogin: () => Promise<{ loggedIn: boolean }>
      logoutBilibili: () => Promise<{ success: boolean; message?: string }>
      platform: NodeJS.Platform
      // yt-dlp 更新相关
      getYtDlpVersion: () => Promise<{ success: boolean; version?: string; error?: string }>
      updateYtDlp: () => Promise<{ success: boolean; message: string; currentVersion?: string; latestVersion?: string }>
    }
  }
}

