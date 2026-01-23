import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { EventEmitter } from 'events'

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
  private pausedDownloads: Map<string, DownloadOptions> = new Map()
  private ytdlpPath: string = '/opt/homebrew/bin/yt-dlp' // macOS Homebrew 路径

  constructor() {
    super()
    // 尝试找到 yt-dlp 的正确路径
    this.findYtdlpPath()
  }

  private findYtdlpPath(): void {
    const possiblePaths = [
      '/opt/homebrew/bin/yt-dlp',  // macOS Homebrew (Apple Silicon)
      '/usr/local/bin/yt-dlp',     // macOS Homebrew (Intel) / Linux
      '/usr/bin/yt-dlp',           // Linux 系统安装
      'yt-dlp',                    // PATH 中的 yt-dlp
    ]

    for (const p of possiblePaths) {
      try {
        const fs = require('fs')
        if (p === 'yt-dlp' || fs.existsSync(p)) {
          this.ytdlpPath = p
          console.log(`Downloader using yt-dlp at: ${p}`)
          return
        }
      } catch {
        // 继续尝试
      }
    }
  }

  // 暂停下载
  pauseDownload(taskId: string): boolean {
    const process = this.activeDownloads.get(taskId)
    if (process) {
      process.kill('SIGSTOP')
      return true
    }
    return false
  }

  // 恢复下载
  resumeDownload(taskId: string): boolean {
    const process = this.activeDownloads.get(taskId)
    if (process) {
      process.kill('SIGCONT')
      return true
    }
    return false
  }

  // 取消下载
  cancelDownload(taskId: string): boolean {
    const process = this.activeDownloads.get(taskId)
    if (process) {
      process.kill('SIGTERM')
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
    ]

    // 根据设置添加 cookies 参数
    if (cookiesBrowser && cookiesBrowser !== 'none') {
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

    // 字幕
    if (subtitles) {
      args.push('--write-subs', '--sub-lang', subtitleLang || 'en')
    }

    // 代理设置
    if (proxyUrl) {
      args.push('--proxy', proxyUrl)
    }

    // 格式转换
    if (convertFormat && !audioOnly) {
      args.push('--recode-video', convertFormat)
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

