import { create } from 'zustand'

// 视频格式类型
export interface VideoFormat {
  formatId: string
  ext: string
  resolution: string
  filesize: number | null
  quality: string
  hasAudio: boolean
  hasVideo: boolean
  vcodec?: string
  acodec?: string
  tbr?: number | null
}

// 视频信息类型
export interface VideoInfo {
  id: string
  title: string
  thumbnail: string
  duration: number
  durationFormatted: string
  channel: string
  channelId?: string
  viewCount: number
  uploadDate: string
  description?: string
  formats: VideoFormat[]
  url: string
}

// 下载任务类型
export interface DownloadTask {
  id: string
  videoInfo: VideoInfo
  selectedFormat: VideoFormat
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed'
  progress: number
  speed: string
  eta: string
  error?: string
  filePath?: string
  createdAt: Date
}

// Cookies 来源浏览器类型
export type CookiesBrowser = 'none' | 'chrome' | 'safari'

// 设置类型
export interface Settings {
  downloadPath: string
  defaultFormat: string
  defaultResolution: string
  maxConcurrentDownloads: number
  autoDetectClipboard: boolean
  showNotifications: boolean
  theme: 'light' | 'dark' | 'system'
  proxyEnabled: boolean
  proxyUrl: string
  cookiesBrowser: CookiesBrowser // Cookies 来源浏览器
}

// 历史记录类型（来自数据库）
export interface HistoryItem {
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

// 播放列表信息
export interface PlaylistInfo {
  id: string
  title: string
  channel: string
  thumbnail: string
  videoCount: number
  videos: VideoInfo[]
}

// Store 状态类型
interface DownloadState {
  // 当前输入的URL
  currentUrl: string
  setCurrentUrl: (url: string) => void

  // 当前解析的视频信息
  currentVideoInfo: VideoInfo | null
  setCurrentVideoInfo: (info: VideoInfo | null) => void

  // 当前播放列表信息
  currentPlaylist: PlaylistInfo | null
  setCurrentPlaylist: (playlist: PlaylistInfo | null) => void
  selectedPlaylistVideos: string[] // 选中的视频ID列表
  setSelectedPlaylistVideos: (ids: string[]) => void
  togglePlaylistVideo: (id: string) => void
  selectAllPlaylistVideos: () => void
  deselectAllPlaylistVideos: () => void

  // 解析状态
  isParsing: boolean
  setIsParsing: (parsing: boolean) => void
  parseError: string | null
  setParseError: (error: string | null) => void

  // 下载队列
  downloadQueue: DownloadTask[]
  addToQueue: (task: DownloadTask) => void
  addBatchToQueue: (tasks: DownloadTask[]) => void
  removeFromQueue: (taskId: string) => void
  updateTask: (taskId: string, updates: Partial<DownloadTask>) => void
  clearCompleted: () => void

  // 设置
  settings: Settings
  updateSettings: (settings: Partial<Settings>) => void
  saveSettings: () => Promise<void>

  // 历史记录（从数据库加载）
  historyList: HistoryItem[]
  historyLoading: boolean
  loadHistory: () => Promise<void>
  addToHistory: (item: HistoryItem) => Promise<void>
  removeFromHistory: (id: string) => Promise<void>
  clearAllHistory: () => Promise<void>
  searchHistory: (query: string) => Promise<void>

  // 当前页面
  currentPage: 'home' | 'settings' | 'history'
  setCurrentPage: (page: 'home' | 'settings' | 'history') => void
}

// 获取默认下载路径（从主进程获取，这里先用占位符）
const getInitialDownloadPath = (): string => {
  // 初始值，会在应用启动时从主进程获取真实路径
  return ''
}

// 默认设置
const defaultSettings: Settings = {
  downloadPath: getInitialDownloadPath(),
  defaultFormat: 'mp4',
  defaultResolution: '1080p',
  maxConcurrentDownloads: 3,
  autoDetectClipboard: true,
  showNotifications: true,
  theme: 'dark',
  proxyEnabled: false,
  proxyUrl: '',
  cookiesBrowser: 'chrome', // 默认使用 Chrome 的 cookies
}

// 初始化应用（加载设置和默认下载路径）
export const initializeApp = async (): Promise<void> => {
  if (typeof window === 'undefined' || !window.electronAPI) return

  try {
    // 从数据库加载设置
    const savedSettings = await window.electronAPI.getSettings()

    // 如果没有保存的下载路径，获取默认路径
    let downloadPath = savedSettings.downloadPath
    if (!downloadPath) {
      downloadPath = await window.electronAPI.getDefaultDownloadPath()
    }

    // 合并设置
    useDownloadStore.getState().updateSettings({
      ...savedSettings,
      downloadPath,
    })

    // 加载历史记录
    await useDownloadStore.getState().loadHistory()
  } catch (error) {
    console.error('初始化应用失败:', error)
  }
}

// 向后兼容
export const initializeDownloadPath = initializeApp

// 创建 Store
export const useDownloadStore = create<DownloadState>((set, get) => ({
  currentUrl: '',
  setCurrentUrl: (url) => set({ currentUrl: url }),

  currentVideoInfo: null,
  setCurrentVideoInfo: (info) => set({ currentVideoInfo: info }),

  // 播放列表相关
  currentPlaylist: null,
  setCurrentPlaylist: (playlist) => set({ currentPlaylist: playlist }),
  selectedPlaylistVideos: [],
  setSelectedPlaylistVideos: (ids) => set({ selectedPlaylistVideos: ids }),
  togglePlaylistVideo: (id) => set((state) => ({
    selectedPlaylistVideos: state.selectedPlaylistVideos.includes(id)
      ? state.selectedPlaylistVideos.filter(v => v !== id)
      : [...state.selectedPlaylistVideos, id]
  })),
  selectAllPlaylistVideos: () => set((state) => ({
    selectedPlaylistVideos: state.currentPlaylist?.videos.map(v => v.id) || []
  })),
  deselectAllPlaylistVideos: () => set({ selectedPlaylistVideos: [] }),

  isParsing: false,
  setIsParsing: (parsing) => set({ isParsing: parsing }),
  parseError: null,
  setParseError: (error) => set({ parseError: error }),

  downloadQueue: [],
  addToQueue: (task) => set((state) => ({
    downloadQueue: [...state.downloadQueue, task]
  })),
  addBatchToQueue: (tasks) => set((state) => ({
    downloadQueue: [...state.downloadQueue, ...tasks]
  })),
  removeFromQueue: (taskId) => set((state) => ({
    downloadQueue: state.downloadQueue.filter((t) => t.id !== taskId)
  })),
  updateTask: (taskId, updates) => set((state) => ({
    downloadQueue: state.downloadQueue.map((t) =>
      t.id === taskId ? { ...t, ...updates } : t
    )
  })),
  clearCompleted: () => set((state) => ({
    downloadQueue: state.downloadQueue.filter((t) => t.status !== 'completed')
  })),

  settings: defaultSettings,
  updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  })),

  // 保存设置到数据库
  saveSettings: async () => {
    const { settings } = get()
    try {
      await window.electronAPI.saveSettings(settings)
    } catch (error) {
      console.error('保存设置失败:', error)
    }
  },

  // 历史记录
  historyList: [],
  historyLoading: false,

  loadHistory: async () => {
    set({ historyLoading: true })
    try {
      const history = await window.electronAPI.getHistory(100, 0)
      set({ historyList: history })
    } catch (error) {
      console.error('加载历史记录失败:', error)
    } finally {
      set({ historyLoading: false })
    }
  },

  addToHistory: async (item) => {
    try {
      await window.electronAPI.addHistory(item)
      // 刷新列表
      const history = await window.electronAPI.getHistory(100, 0)
      set({ historyList: history })
    } catch (error) {
      console.error('添加历史记录失败:', error)
    }
  },

  removeFromHistory: async (id) => {
    try {
      await window.electronAPI.deleteHistory(id)
      set((state) => ({
        historyList: state.historyList.filter((h) => h.id !== id)
      }))
    } catch (error) {
      console.error('删除历史记录失败:', error)
    }
  },

  clearAllHistory: async () => {
    try {
      await window.electronAPI.clearHistory()
      set({ historyList: [] })
    } catch (error) {
      console.error('清空历史记录失败:', error)
    }
  },

  searchHistory: async (query) => {
    set({ historyLoading: true })
    try {
      if (query.trim()) {
        const results = await window.electronAPI.searchHistory(query)
        set({ historyList: results })
      } else {
        const history = await window.electronAPI.getHistory(100, 0)
        set({ historyList: history })
      }
    } catch (error) {
      console.error('搜索历史记录失败:', error)
    } finally {
      set({ historyLoading: false })
    }
  },

  currentPage: 'home',
  setCurrentPage: (page) => set({ currentPage: page }),
}))

