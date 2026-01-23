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
  theme: 'light' | 'dark' | 'system'
  proxyEnabled: boolean
  proxyUrl: string
  cookiesBrowser: CookiesBrowser
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

  // 暂停下载
  pauseDownload: (taskId: string) => ipcRenderer.invoke('pause-download', taskId),

  // 恢复下载
  resumeDownload: (taskId: string) => ipcRenderer.invoke('resume-download', taskId),

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

  // 平台信息
  platform: process.platform,
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
      pauseDownload: (taskId: string) => Promise<boolean>
      resumeDownload: (taskId: string) => Promise<boolean>
      cancelDownload: (taskId: string) => Promise<boolean>
      onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
      onDownloadComplete: (callback: (result: DownloadResult) => void) => () => void
      // 数据库相关
      getSettings: () => Promise<Partial<AppSettings>>
      saveSettings: (settings: AppSettings) => Promise<{ success: boolean; error?: string }>
      getHistory: (limit?: number, offset?: number) => Promise<HistoryItem[]>
      searchHistory: (query: string) => Promise<HistoryItem[]>
      addHistory: (item: HistoryItem) => Promise<{ success: boolean; error?: string }>
      deleteHistory: (id: string) => Promise<{ success: boolean; error?: string }>
      clearHistory: () => Promise<{ success: boolean; error?: string }>
      getHistoryCount: () => Promise<number>
      platform: NodeJS.Platform
    }
  }
}

