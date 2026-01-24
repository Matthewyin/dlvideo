import { spawn, ChildProcess } from 'child_process'
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
function detectPlatform(url: string): Platform {
  if (/youtube\.com|youtu\.be/i.test(url)) {
    return 'youtube'
  }
  if (/bilibili\.com|b23\.tv/i.test(url)) {
    return 'bilibili'
  }
  return 'unknown'
}

// Cookies 来源浏览器类型
export type CookiesBrowser = 'none' | 'chrome' | 'safari'

// 下载选项
export interface DownloadOptions {
  url: string
  outputPath: string
  filename: string
  formatId?: string
  audioOnly?: boolean
  subtitles?: boolean
  subtitleLang?: string
  proxyUrl?: string // 代理地址
  convertFormat?: string // 转换目标格式 (mp4, mkv, webm, mp3, m4a)
  cookiesBrowser?: CookiesBrowser // Cookies 来源浏览器
}

// 下载进度
export interface DownloadProgress {
  taskId: string
  percent: number
  speed: string
  eta: string
  totalSize: string
  downloadedSize: string
}

// 下载结果
export interface DownloadResult {
  taskId: string
  success: boolean
  filePath?: string
  error?: string
}

class DownloaderService extends EventEmitter {
  private activeDownloads: Map<string, ChildProcess> = new Map()
  private ytdlpPath: string = ''
  private denoPath: string = ''
  private aria2cPath: string = ''
  private ffmpegPath: string = ''

  constructor() {
    super()
    // 设置二进制文件路径
    this.setupPaths()
  }

  private setupPaths(): void {
    const platform = process.platform
    const ytdlpName = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    const denoName = platform === 'win32' ? 'deno.exe' : 'deno'
    const aria2cName = platform === 'win32' ? 'aria2c.exe' : 'aria2c'
    const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

    // 开发环境和生产环境的路径
    if (app.isPackaged) {
      this.ytdlpPath = path.join(process.resourcesPath, 'bin', ytdlpName)
      this.denoPath = path.join(process.resourcesPath, 'bin', denoName)
      this.aria2cPath = path.join(process.resourcesPath, 'bin', aria2cName)
      this.ffmpegPath = path.join(process.resourcesPath, 'bin', ffmpegName)
    } else {
      this.ytdlpPath = path.join(app.getAppPath(), 'resources', 'bin', ytdlpName)
      this.denoPath = path.join(app.getAppPath(), 'resources', 'bin', denoName)
      this.aria2cPath = path.join(app.getAppPath(), 'resources', 'bin', aria2cName)
      this.ffmpegPath = path.join(app.getAppPath(), 'resources', 'bin', ffmpegName)
    }

    console.log(`Downloader using yt-dlp at: ${this.ytdlpPath}`)
    console.log(`Downloader using deno at: ${this.denoPath}`)
    console.log(`Downloader using aria2c at: ${this.aria2cPath}`)
    console.log(`Downloader using ffmpeg at: ${this.ffmpegPath}`)
  }

  // 取消下载
  cancelDownload(taskId: string): boolean {
    const process = this.activeDownloads.get(taskId)
    if (process) {
      // 先尝试优雅终止
      process.kill('SIGTERM')
      // 500ms 后强制杀死进程
      setTimeout(() => {
        try {
          process.kill('SIGKILL')
        } catch {
          // 进程可能已经退出
        }
      }, 500)
      this.activeDownloads.delete(taskId)
      return true
    }
    return false
  }

  // 获取活动下载数
  getActiveCount(): number {
    return this.activeDownloads.size
  }

  // 生成唯一的文件名（避免重复）
  private getUniqueFilename(outputPath: string, filename: string, ext: string): string {
    let finalFilename = filename
    let counter = 1

    // 检查文件是否存在，如果存在则添加序号
    while (true) {
      const possibleExts = ext ? [ext] : ['mp4', 'webm', 'mkv', 'mp3', 'm4a']
      let exists = false

      for (const e of possibleExts) {
        const filePath = path.join(outputPath, `${finalFilename}.${e}`)
        if (fs.existsSync(filePath)) {
          exists = true
          break
        }
      }

      if (!exists) {
        break
      }

      // 文件存在，添加序号
      finalFilename = `${filename} (${counter})`
      counter++

      // 防止无限循环
      if (counter > 1000) {
        finalFilename = `${filename}_${Date.now()}`
        break
      }
    }

    return finalFilename
  }

  // 解析 yt-dlp 输出的进度信息
  private parseProgress(line: string, taskId: string): DownloadProgress | null {
    // 匹配格式: [download]  45.2% of 150.00MiB at 5.20MiB/s ETA 00:15
    const progressMatch = line.match(
      /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?(\S+)\s+at\s+(\S+)\s+ETA\s+(\S+)/
    )
    
    if (progressMatch) {
      return {
        taskId,
        percent: parseFloat(progressMatch[1]),
        totalSize: progressMatch[2],
        speed: progressMatch[3],
        eta: progressMatch[4],
        downloadedSize: '',
      }
    }

    // 匹配另一种格式: [download]  45.2% of ~150.00MiB at 5.20MiB/s ETA 00:15
    const altMatch = line.match(
      /(\d+\.?\d*)%.*?(\d+\.?\d*\s*\w+).*?(\d+\.?\d*\s*\w+\/s).*?ETA\s*(\S+)/i
    )
    
    if (altMatch) {
      return {
        taskId,
        percent: parseFloat(altMatch[1]),
        totalSize: altMatch[2],
        speed: altMatch[3],
        eta: altMatch[4],
        downloadedSize: '',
      }
    }

    return null
  }

  // 开始下载
  async startDownload(taskId: string, options: DownloadOptions): Promise<void> {
    const { url, outputPath, filename, formatId, audioOnly, subtitles, subtitleLang, proxyUrl, convertFormat, cookiesBrowser } = options

    // 检测平台
    const platform = detectPlatform(url)

    // 确保输出目录存在
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true })
    }

    // 检测重复文件并生成唯一文件名
    const expectedExt = audioOnly ? 'mp3' : (convertFormat || '')
    const uniqueFilename = this.getUniqueFilename(outputPath, filename, expectedExt)

    // 构建输出文件路径
    const outputTemplate = path.join(outputPath, `${uniqueFilename}.%(ext)s`)

    // 构建命令参数
    const args: string[] = [
      url,
      '-o', outputTemplate,
      '--newline', // 每行输出进度
      '--no-colors', // 禁用颜色输出
      '-c', // 断点续传：继续下载部分下载的文件
      '--no-part', // 不使用.part临时文件，直接写入目标文件
      '--no-check-certificates', // 跳过证书检查
      '--concurrent-fragments', '8', // 并行下载8个片段，加速下载
      '--retries', '10', // 重试次数
      '--fragment-retries', '10', // 片段重试次数
      '--no-playlist', // 不处理播放列表，加速单视频下载
      '--no-warnings', // 不显示警告信息
      // ffmpeg 配置：用于合并视频+音频+字幕
      '--ffmpeg-location', this.ffmpegPath,
      // aria2c 高速下载配置
      '--downloader', `aria2c:${this.aria2cPath}`, // 使用内置 aria2c 作为下载器
      '--downloader-args', 'aria2c:-x 16 -s 16 -k 1M --file-allocation=none', // aria2c 参数：16连接、16分段、1M块大小
    ]

    // YouTube 需要 Deno 解决 n parameter challenge，B站不需要
    if (platform === 'youtube') {
      args.push('--js-runtimes', `deno:${this.denoPath}`)
    }

    // B站需要添加 referer
    if (platform === 'bilibili') {
      args.push('--referer', 'https://www.bilibili.com')
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

    // 格式选择
    if (audioOnly) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0')
    } else if (formatId) {
      // 选择视频格式 + 最佳音频，然后合并
      args.push('-f', `${formatId}+bestaudio/best`)
    } else {
      args.push('-f', 'bestvideo+bestaudio/best')
    }

    // 默认下载字幕并嵌入到视频文件中（如果视频有字幕的话）
    if (!audioOnly) {
      args.push(
        '--write-subs', // 下载字幕
        '--write-auto-subs', // 也下载自动生成的字幕
        '--sub-lang', subtitleLang || 'en,zh-Hans,zh-Hant', // 默认下载英文和中文字幕
        '--embed-subs', // 将字幕嵌入到视频文件中
        '--embed-thumbnail', // 将缩略图嵌入到视频文件中
        '--embed-metadata', // 将元数据嵌入到视频文件中
      )
    }

    // 代理设置
    if (proxyUrl) {
      args.push('--proxy', proxyUrl)
    }

    // 格式转换（默认输出 mp4 以确保兼容性和字幕嵌入）
    if (!audioOnly) {
      args.push('--merge-output-format', 'mp4') // 强制输出 mp4 格式
      if (convertFormat && convertFormat !== 'mp4') {
        args.push('--recode-video', convertFormat)
      }
    }

    // 启动下载进程
    const process = spawn(this.ytdlpPath, args)
    this.activeDownloads.set(taskId, process)

    let outputFilePath = ''
    let stderrBuffer = '' // 收集错误信息

    // 处理标准输出
    process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {
        // 解析进度
        const progress = this.parseProgress(line, taskId)
        if (progress) {
          this.emit('progress', progress)
        }

        // 捕获最终文件路径
        const destMatch = line.match(/\[download\] Destination: (.+)/)
        if (destMatch) {
          outputFilePath = destMatch[1]
        }

        // 合并完成
        const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/)
        if (mergeMatch) {
          outputFilePath = mergeMatch[1]
        }
      }
    })

    // 处理标准错误
    process.stderr?.on('data', (data: Buffer) => {
      const errStr = data.toString()
      console.error(`[yt-dlp stderr] ${errStr}`)
      stderrBuffer += errStr
    })

    // 处理进程结束
    return new Promise((resolve, reject) => {
      process.on('close', (code) => {
        this.activeDownloads.delete(taskId)

        if (code === 0) {
          this.emit('complete', {
            taskId,
            success: true,
            filePath: outputFilePath,
          } as DownloadResult)
          resolve()
        } else {
          // 提取更有意义的错误信息
          let error = `下载失败，退出码: ${code}`
          const errorMatch = stderrBuffer.match(/ERROR:\s*(.+?)(?:\n|$)/)
          if (errorMatch) {
            error = errorMatch[1].trim()
          }
          this.emit('complete', {
            taskId,
            success: false,
            error,
          } as DownloadResult)
          reject(new Error(error))
        }
      })

      process.on('error', (err) => {
        this.activeDownloads.delete(taskId)
        this.emit('complete', {
          taskId,
          success: false,
          error: err.message,
        } as DownloadResult)
        reject(err)
      })
    })
  }
}

export const downloaderService = new DownloaderService()

