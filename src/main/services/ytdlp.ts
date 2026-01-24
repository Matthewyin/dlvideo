import YTDlpWrapModule from 'yt-dlp-wrap'
// 处理 ESM/CJS 兼容性问题
const YTDlpWrap = (YTDlpWrapModule as any).default || YTDlpWrapModule
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { EventEmitter } from 'events'

// Cookies 文件路径
const YOUTUBE_COOKIES_FILE_PATH = path.join(app.getPath('userData'), 'youtube_cookies.txt')
const BILIBILI_COOKIES_FILE_PATH = path.join(app.getPath('userData'), 'bilibili_cookies.txt')

// 平台类型
export type Platform = 'youtube' | 'bilibili' | 'unknown'

// 检测 URL 对应的平台
export function detectPlatform(url: string): Platform {
  if (/youtube\.com|youtu\.be/i.test(url)) {
    return 'youtube'
  }
  if (/bilibili\.com|b23\.tv/i.test(url)) {
    return 'bilibili'
  }
  return 'unknown'
}

// 视频格式信息
export interface VideoFormat {
  formatId: string
  ext: string
  resolution: string
  filesize: number | null
  quality: string
  hasAudio: boolean
  hasVideo: boolean
  vcodec: string
  acodec: string
  tbr: number | null
}

// 视频信息
export interface VideoInfo {
  id: string
  title: string
  thumbnail: string
  duration: number
  durationFormatted: string
  channel: string
  channelId: string
  viewCount: number
  uploadDate: string
  description: string
  formats: VideoFormat[]
  url: string
  platform: Platform
  isPlaylist?: boolean
  playlistTitle?: string
  playlistIndex?: number
  playlistCount?: number
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

// 下载进度信息
export interface DownloadProgress {
  percent: number
  totalSize: string
  currentSpeed: string
  eta: string
}

class YtdlpService extends EventEmitter {
  private ytdlp: YTDlpWrap | null = null
  private binaryPath: string
  private denoPath: string

  constructor() {
    super()
    // 根据平台确定二进制文件路径
    const platform = process.platform
    const binaryName = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    const denoName = platform === 'win32' ? 'deno.exe' : 'deno'

    // 开发环境和生产环境的路径
    if (app.isPackaged) {
      this.binaryPath = path.join(process.resourcesPath, 'bin', binaryName)
      this.denoPath = path.join(process.resourcesPath, 'bin', denoName)
    } else {
      this.binaryPath = path.join(app.getAppPath(), 'resources', 'bin', binaryName)
      this.denoPath = path.join(app.getAppPath(), 'resources', 'bin', denoName)
    }
  }

  // 获取 Deno 路径
  getDenoPath(): string {
    return this.denoPath
  }

  // 初始化 yt-dlp
  async initialize(): Promise<void> {
    // 常见的 yt-dlp 安装路径
    const possiblePaths = [
      '/opt/homebrew/bin/yt-dlp',  // macOS Homebrew (Apple Silicon)
      '/usr/local/bin/yt-dlp',     // macOS Homebrew (Intel) / Linux
      '/usr/bin/yt-dlp',           // Linux 系统安装
      'yt-dlp',                    // PATH 中的 yt-dlp
      this.binaryPath,             // 内置二进制
    ]

    const errors: string[] = []

    for (const ytdlpPath of possiblePaths) {
      try {
        console.log(`Trying yt-dlp at: ${ytdlpPath}`)
        this.ytdlp = new YTDlpWrap(ytdlpPath)
        const version = await this.ytdlp.getVersion()
        console.log(`yt-dlp initialized successfully at: ${ytdlpPath}, version: ${version}`)
        return
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        errors.push(`${ytdlpPath}: ${errMsg}`)
        console.log(`Failed to initialize yt-dlp at ${ytdlpPath}: ${errMsg}`)
      }
    }

    console.error('All yt-dlp paths failed:', errors)
    throw new Error('yt-dlp 未安装。请先安装 yt-dlp: brew install yt-dlp 或 pip install yt-dlp')
  }

  // 格式化时长
  private formatDuration(seconds: number): string {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 解析视频格式
  private parseFormats(formats: any[]): VideoFormat[] {
    if (!formats || !Array.isArray(formats)) return []
    
    return formats
      .filter(f => f.format_id && (f.vcodec !== 'none' || f.acodec !== 'none'))
      .map(f => ({
        formatId: f.format_id,
        ext: f.ext || 'mp4',
        resolution: f.resolution || (f.height ? `${f.height}p` : 'Audio'),
        filesize: f.filesize || f.filesize_approx || null,
        quality: f.format_note || f.quality || '',
        hasAudio: f.acodec !== 'none',
        hasVideo: f.vcodec !== 'none',
        vcodec: f.vcodec || 'none',
        acodec: f.acodec || 'none',
        tbr: f.tbr || null,
      }))
      .sort((a, b) => {
        // 按分辨率排序（从高到低）
        const resA = parseInt(a.resolution) || 0
        const resB = parseInt(b.resolution) || 0
        return resB - resA
      })
  }

  // 获取视频信息
  async getVideoInfo(url: string, cookiesBrowser: string = 'chrome'): Promise<VideoInfo> {
    if (!this.ytdlp) {
      await this.initialize()
    }

    const platform = detectPlatform(url)

    // 构建参数，不使用 -f best（避免 yt-dlp-wrap 自动添加导致的问题）
    const args: string[] = [url, '--dump-json', '--no-warnings', '--no-check-certificates']

    // YouTube 需要 Deno 解决 n parameter challenge，B站不需要
    if (platform === 'youtube') {
      args.push('--js-runtimes', `deno:${this.denoPath}`)
    }

    // 根据平台选择 cookies 文件
    if (platform === 'bilibili' && fs.existsSync(BILIBILI_COOKIES_FILE_PATH)) {
      args.push('--cookies', BILIBILI_COOKIES_FILE_PATH)
    } else if (platform === 'youtube' && fs.existsSync(YOUTUBE_COOKIES_FILE_PATH)) {
      args.push('--cookies', YOUTUBE_COOKIES_FILE_PATH)
    } else if (cookiesBrowser && cookiesBrowser !== 'none') {
      // 否则使用浏览器 cookies
      args.push('--cookies-from-browser', cookiesBrowser)
    }

    // B站需要添加 referer
    if (platform === 'bilibili') {
      args.push('--referer', 'https://www.bilibili.com')
    }

    // 直接使用 execPromise 避免 yt-dlp-wrap 自动添加 -f best
    const stdout = await this.ytdlp!.execPromise(args)
    const metadata = JSON.parse(stdout)

    return {
      id: metadata.id,
      title: metadata.title,
      thumbnail: metadata.thumbnail || metadata.thumbnails?.[0]?.url || '',
      duration: metadata.duration || 0,
      durationFormatted: this.formatDuration(metadata.duration || 0),
      channel: metadata.channel || metadata.uploader || '',
      channelId: metadata.channel_id || metadata.uploader_id || '',
      viewCount: metadata.view_count || 0,
      uploadDate: metadata.upload_date || '',
      description: metadata.description || '',
      formats: this.parseFormats(metadata.formats),
      url: url,
      platform: platform,
    }
  }

  // 检测是否为播放列表
  isPlaylistUrl(url: string): boolean {
    // YouTube 播放列表
    if (url.includes('list=') || url.includes('/playlist')) {
      return true
    }
    // B站合集/收藏夹
    if (/bilibili\.com\/medialist\/play/i.test(url)) {
      return true
    }
    // B站视频合集（带 p 参数的多P视频不算播放列表，单独处理）
    return false
  }

  // 获取播放列表信息
  async getPlaylistInfo(url: string, cookiesBrowser: string = 'chrome'): Promise<PlaylistInfo> {
    if (!this.ytdlp) {
      await this.initialize()
    }

    const platform = detectPlatform(url)

    // 构建参数
    const args: string[] = [url, '--flat-playlist', '--yes-playlist', '--dump-json', '--no-warnings', '--no-check-certificates']

    // YouTube 需要 Deno 解决 n parameter challenge
    if (platform === 'youtube') {
      args.push('--js-runtimes', `deno:${this.denoPath}`)
    }

    // 根据平台选择 cookies 文件
    if (platform === 'bilibili' && fs.existsSync(BILIBILI_COOKIES_FILE_PATH)) {
      args.push('--cookies', BILIBILI_COOKIES_FILE_PATH)
    } else if (platform === 'youtube' && fs.existsSync(YOUTUBE_COOKIES_FILE_PATH)) {
      args.push('--cookies', YOUTUBE_COOKIES_FILE_PATH)
    } else if (cookiesBrowser && cookiesBrowser !== 'none') {
      // 否则使用浏览器 cookies
      args.push('--cookies-from-browser', cookiesBrowser)
    }

    // B站需要添加 referer
    if (platform === 'bilibili') {
      args.push('--referer', 'https://www.bilibili.com')
    }

    // 直接使用 execPromise 避免 yt-dlp-wrap 自动添加 -f best
    const stdout = await this.ytdlp!.execPromise(args)
    // 播放列表可能返回多行 JSON
    let metadata: any
    try {
      metadata = JSON.parse(stdout)
    } catch {
      // 多行 JSON 的情况
      metadata = JSON.parse('[' + stdout.replace(/\n/g, ',').slice(0, -1) + ']')
      if (Array.isArray(metadata)) {
        // 将数组转换为带数字键的对象
        const obj: any = {}
        metadata.forEach((item, index) => {
          obj[index] = item
        })
        metadata = obj
      }
    }

    // yt-dlp-wrap 在处理播放列表时返回格式异常：
    // - 返回对象的 keys 是数字字符串 ('0', '1', '2', ...)
    // - 标准属性如 title, entries, playlist_count 都是 undefined
    // 需要手动提取数据
    let entries: any[] = metadata.entries || []
    let playlistTitle = metadata.title
    let playlistChannel = metadata.channel || metadata.uploader || ''
    let playlistId = metadata.id
    let playlistThumbnail = metadata.thumbnail

    // 如果 entries 为空，尝试从数字键中提取
    if (entries.length === 0) {
      const keys = Object.keys(metadata)
      const numericKeys = keys.filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b))

      if (numericKeys.length > 0) {
        entries = numericKeys.map(k => metadata[k]).filter(v => v && typeof v === 'object' && v.id)

        // 尝试从第一个条目中提取播放列表元数据
        if (entries.length > 0) {
          const firstEntry = entries[0]
          // 播放列表标题可能在 playlist_title 或需要从 URL 解析
          if (!playlistTitle) {
            // 尝试从 URL 提取播放列表 ID 作为备用标题
            const listMatch = url.match(/list=([\w-]+)/)
            playlistTitle = listMatch ? `播放列表 (${entries.length} 个视频)` : '播放列表'
          }
          if (!playlistChannel && firstEntry.channel) {
            playlistChannel = firstEntry.channel
          }
          if (!playlistId) {
            const listMatch = url.match(/list=([\w-]+)/)
            playlistId = listMatch ? listMatch[1] : ''
          }
          if (!playlistThumbnail && firstEntry.thumbnails?.[0]?.url) {
            playlistThumbnail = firstEntry.thumbnails[0].url
          }
        }
      }
    }

    const videos: VideoInfo[] = []

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry || !entry.id) continue // 跳过无效条目（如已删除的视频）

      // 根据平台生成视频 URL
      let videoUrl = entry.url
      if (!videoUrl) {
        if (platform === 'bilibili') {
          videoUrl = `https://www.bilibili.com/video/${entry.id}`
        } else {
          videoUrl = `https://www.youtube.com/watch?v=${entry.id}`
        }
      }

      videos.push({
        id: entry.id,
        title: entry.title || `Video ${i + 1}`,
        thumbnail: entry.thumbnail || entry.thumbnails?.[0]?.url || '',
        duration: entry.duration || 0,
        durationFormatted: this.formatDuration(entry.duration || 0),
        channel: entry.channel || entry.uploader || playlistChannel || '',
        channelId: entry.channel_id || entry.uploader_id || '',
        viewCount: entry.view_count || 0,
        uploadDate: entry.upload_date || '',
        description: '',
        formats: [],
        url: videoUrl,
        platform: platform,
        isPlaylist: true,
        playlistTitle: playlistTitle,
        playlistIndex: i + 1,
        playlistCount: entries.length,
      })
    }

    return {
      id: playlistId || '',
      title: playlistTitle || '未知播放列表',
      channel: playlistChannel,
      thumbnail: playlistThumbnail || videos[0]?.thumbnail || '',
      videoCount: videos.length,
      videos,
    }
  }
}

export const ytdlpService = new YtdlpService()

