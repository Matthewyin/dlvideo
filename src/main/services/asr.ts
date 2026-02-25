import { spawn, spawnSync, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import http from 'http'
import https from 'https'
import { app } from 'electron'
import { EventEmitter } from 'events'

export interface AsrOptions {
  filePath: string
  outputDir?: string
  language?: string // 如 zh/en/ja，留空表示自动
  formats?: Array<'txt' | 'srt' | 'vtt'>
  modelPath?: string
}

export interface AsrProgress {
  taskId: string
  stage: 'queued' | 'extracting' | 'transcribing'
  message: string
}

export interface AsrResult {
  taskId: string
  success: boolean
  error?: string
  outputs?: {
    txt?: string
    srt?: string
    vtt?: string
  }
}

export interface AsrModelDownloadProgress {
  taskId: string
  stage: 'starting' | 'downloading'
  downloadedBytes: number
  totalBytes?: number
  percent?: number
  message: string
  targetPath: string
}

export interface AsrModelDownloadResult {
  taskId: string
  success: boolean
  filePath?: string
  error?: string
}

interface PendingAsrTask {
  taskId: string
  options: AsrOptions
  resolve: (result: AsrResult) => void
}

const DEFAULT_WHISPER_MODEL_FILE = 'ggml-medium.bin'
const DEFAULT_VAD_MODEL_FILE = 'ggml-silero-v5.1.2.bin'
const WHISPER_MODEL_DOWNLOAD_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${DEFAULT_WHISPER_MODEL_FILE}`
const VAD_MODEL_DOWNLOAD_URL = `https://huggingface.co/ggml-org/whisper-vad/resolve/main/${DEFAULT_VAD_MODEL_FILE}`

class AsrService extends EventEmitter {
  private pendingQueue: PendingAsrTask[] = []
  private queuedTaskIds: Set<string> = new Set()
  private activeTaskIds: Set<string> = new Set()
  private activeProcesses: Map<string, ChildProcess> = new Map()
  private maxConcurrentTasks = 1
  private modelDownloadInProgress = false
  private currentModelDownloadTaskId: string | null = null
  private ffmpegPath = ''
  private whisperCliPathCandidates: string[] = []

  constructor() {
    super()
    this.setupPaths()
  }

  private setupPaths(): void {
    const platform = process.platform
    const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const whisperCliName = platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
    const whisperMainName = platform === 'win32' ? 'main.exe' : 'main'
    const whisperCppName = platform === 'win32' ? 'whisper-cpp.exe' : 'whisper-cpp'

    if (app.isPackaged) {
      this.ffmpegPath = path.join(process.resourcesPath, 'bin', ffmpegName)
      this.whisperCliPathCandidates = [
        path.join(process.resourcesPath, 'bin', whisperCliName),
        path.join(process.resourcesPath, 'bin', whisperMainName),
        path.join(process.resourcesPath, 'bin', whisperCppName),
      ]
    } else {
      this.ffmpegPath = path.join(app.getAppPath(), 'resources', 'bin', ffmpegName)
      this.whisperCliPathCandidates = [
        path.join(app.getAppPath(), 'resources', 'bin', whisperCliName),
        path.join(app.getAppPath(), 'resources', 'bin', whisperMainName),
        path.join(app.getAppPath(), 'resources', 'bin', whisperCppName),
      ]
    }
  }

  setMaxConcurrentTasks(limit: number): void {
    this.maxConcurrentTasks = Math.max(1, Math.floor(limit || 0))
    this.drainQueue()
  }

  getStatus(modelPathOverride?: string) {
    const resolvedBinary = this.findWhisperBinary()
    const normalizedOverride = modelPathOverride?.trim()
    const overrideExists = normalizedOverride ? fs.existsSync(normalizedOverride) : undefined
    const resolvedModel = normalizedOverride
      ? (overrideExists ? normalizedOverride : null)
      : this.findModelPath()
    const resolvedVadModel = this.findVadModelPath()
    const defaultModelPath = this.getDefaultModelPath()
    const defaultVadModelPath = this.getDefaultVadModelPath()
    return {
      available: Boolean(resolvedBinary && resolvedModel && resolvedVadModel),
      whisperBinary: resolvedBinary,
      modelPath: resolvedModel,
      vadModelPath: resolvedVadModel,
      defaultModelPath,
      defaultVadModelPath,
      modelDownloadInProgress: this.modelDownloadInProgress,
      currentModelDownloadTaskId: this.currentModelDownloadTaskId,
      missing: {
        whisperBinary: !resolvedBinary,
        modelPath: !resolvedModel,
        vadModelPath: !resolvedVadModel,
      },
      error: normalizedOverride && !overrideExists ? '自定义模型路径不存在' : undefined,
    }
  }

  async downloadDefaultModels(taskId: string): Promise<AsrModelDownloadResult> {
    if (this.modelDownloadInProgress) {
      return {
        taskId,
        success: false,
        error: '模型下载任务已在进行中',
      }
    }

    const targetPath = this.getDefaultModelPath()
    const vadTargetPath = this.getDefaultVadModelPath()
    const needWhisperModel = !fs.existsSync(targetPath)
    const needVadModel = !fs.existsSync(vadTargetPath)

    if (!needWhisperModel && !needVadModel) {
      const result: AsrModelDownloadResult = {
        taskId,
        success: true,
        filePath: targetPath,
      }
      this.emit('model-download-complete', result)
      return result
    }

    this.modelDownloadInProgress = true
    this.currentModelDownloadTaskId = taskId

    const tempPath = `${targetPath}.download`
    const vadTempPath = `${vadTargetPath}.download`
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.mkdirSync(path.dirname(vadTargetPath), { recursive: true })

    try {
      if (needWhisperModel) {
        this.emit('model-download-progress', {
          taskId,
          stage: 'starting',
          downloadedBytes: 0,
          message: `开始下载 ASR 模型（${DEFAULT_WHISPER_MODEL_FILE}）...`,
          targetPath,
        } as AsrModelDownloadProgress)

        await this.downloadToFile(
          WHISPER_MODEL_DOWNLOAD_URL,
          tempPath,
          (downloadedBytes, totalBytes) => {
            this.emit('model-download-progress', {
              taskId,
              stage: 'downloading',
              downloadedBytes,
              totalBytes,
              percent: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : undefined,
              message: totalBytes
                ? `正在下载 ASR 模型（medium）... ${Math.round((downloadedBytes / totalBytes) * 100)}%`
                : '正在下载 ASR 模型（medium）...',
              targetPath,
            } as AsrModelDownloadProgress)
          }
        )

        fs.renameSync(tempPath, targetPath)
      }

      if (needVadModel) {
        this.emit('model-download-progress', {
          taskId,
          stage: 'starting',
          downloadedBytes: 0,
          message: `开始下载 VAD 模型（${DEFAULT_VAD_MODEL_FILE}）...`,
          targetPath: vadTargetPath,
        } as AsrModelDownloadProgress)

        await this.downloadToFile(
          VAD_MODEL_DOWNLOAD_URL,
          vadTempPath,
          (downloadedBytes, totalBytes) => {
            this.emit('model-download-progress', {
              taskId,
              stage: 'downloading',
              downloadedBytes,
              totalBytes,
              percent: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : undefined,
              message: totalBytes
                ? `正在下载 VAD 模型... ${Math.round((downloadedBytes / totalBytes) * 100)}%`
                : '正在下载 VAD 模型...',
              targetPath: vadTargetPath,
            } as AsrModelDownloadProgress)
          }
        )

        fs.renameSync(vadTempPath, vadTargetPath)
      }

      const result: AsrModelDownloadResult = {
        taskId,
        success: true,
        filePath: targetPath,
      }
      this.emit('model-download-complete', result)
      return result
    } catch (error) {
      try {
        fs.rmSync(tempPath, { force: true })
      } catch {
        // ignore cleanup error
      }
      try {
        fs.rmSync(vadTempPath, { force: true })
      } catch {
        // ignore cleanup error
      }

      const result: AsrModelDownloadResult = {
        taskId,
        success: false,
        error: error instanceof Error ? error.message : '模型下载失败',
      }
      this.emit('model-download-complete', result)
      return result
    } finally {
      this.modelDownloadInProgress = false
      this.currentModelDownloadTaskId = null
    }
  }

  async startTranscription(taskId: string, options: AsrOptions): Promise<AsrResult> {
    if (this.queuedTaskIds.has(taskId) || this.activeTaskIds.has(taskId) || this.activeProcesses.has(taskId)) {
      return { taskId, success: false, error: '转写任务已存在' }
    }

    this.emit('progress', { taskId, stage: 'queued', message: '已加入转写队列' } as AsrProgress)

    return new Promise((resolve) => {
      this.pendingQueue.push({ taskId, options, resolve })
      this.queuedTaskIds.add(taskId)
      this.drainQueue()
    })
  }

  cancelTranscription(taskId: string): boolean {
    if (this.queuedTaskIds.has(taskId)) {
      const index = this.pendingQueue.findIndex((task) => task.taskId === taskId)
      if (index >= 0) {
        const [task] = this.pendingQueue.splice(index, 1)
        this.queuedTaskIds.delete(taskId)
        const result: AsrResult = { taskId, success: false, error: '已取消' }
        task.resolve(result)
        this.emit('complete', result)
        return true
      }
    }

    const process = this.activeProcesses.get(taskId)
    if (process) {
      try {
        process.kill('SIGTERM')
      } catch {
        // ignore
      }
      return true
    }

    return false
  }

  private drainQueue(): void {
    while (this.activeTaskIds.size < this.maxConcurrentTasks && this.pendingQueue.length > 0) {
      const nextTask = this.pendingQueue.shift()
      if (!nextTask) break
      if (!this.queuedTaskIds.delete(nextTask.taskId)) continue

      this.activeTaskIds.add(nextTask.taskId)
      this.executeTranscription(nextTask.taskId, nextTask.options)
        .then(nextTask.resolve)
        .catch((error) => {
          nextTask.resolve({
            taskId: nextTask.taskId,
            success: false,
            error: error instanceof Error ? error.message : '转写失败',
          })
        })
    }
  }

  private async executeTranscription(taskId: string, options: AsrOptions): Promise<AsrResult> {
    const tempDir = path.join(app.getPath('userData'), 'tmp', 'asr', taskId)
    const tempWavPath = path.join(tempDir, 'input.wav')
    let result: AsrResult

    try {
      if (!fs.existsSync(options.filePath)) {
        throw new Error('源文件不存在')
      }

      const whisperBinary = this.resolveWhisperBinary()
      const modelPath = this.resolveModelPath(options.modelPath)
      const vadModelPath = this.resolveVadModelPath()
      const formats = options.formats?.length ? options.formats : ['txt', 'srt']

      fs.mkdirSync(tempDir, { recursive: true })

      this.emit('progress', {
        taskId,
        stage: 'extracting',
        message: '正在提取音频...',
      } as AsrProgress)

      await this.runCommand(
        taskId,
        this.ffmpegPath,
        [
          '-y',
          '-i', options.filePath,
          '-vn',
          '-af', 'highpass=f=80,lowpass=f=7000,afftdn=nf=-25',
          '-ac', '1',
          '-ar', '16000',
          '-c:a', 'pcm_s16le',
          tempWavPath,
        ],
        'ffmpeg'
      )

      const outputDir = options.outputDir || path.dirname(options.filePath)
      const sourceBaseName = path.basename(options.filePath, path.extname(options.filePath))
      const outputPrefix = path.join(outputDir, `${sourceBaseName}.asr`)

      this.emit('progress', {
        taskId,
        stage: 'transcribing',
        message: '正在语音转文字（VAD + medium）...',
      } as AsrProgress)

      const whisperArgs: string[] = [
        '-m', modelPath,
        '-f', tempWavPath,
        '-of', outputPrefix,
      ]

      // whisper-cli 在未传 -l 时默认使用英文；要显式传入 auto 才会自动识别语言
      const language = options.language?.trim()
      whisperArgs.push('-l', language && language !== '' ? language : 'auto')
      whisperArgs.push('--vad', '--vad-model', vadModelPath, '--suppress-nst')

      if (formats.includes('txt')) whisperArgs.push('-otxt')
      if (formats.includes('srt')) whisperArgs.push('-osrt')
      if (formats.includes('vtt')) whisperArgs.push('-ovtt')

      await this.runCommand(taskId, whisperBinary, whisperArgs, 'whisper')

      const outputs = {
        txt: this.ensureIfExists(`${outputPrefix}.txt`),
        srt: this.ensureIfExists(`${outputPrefix}.srt`),
        vtt: this.ensureIfExists(`${outputPrefix}.vtt`),
      }

      if (!outputs.txt && !outputs.srt && !outputs.vtt) {
        throw new Error('ASR 执行完成，但未生成任何输出文件')
      }

      result = {
        taskId,
        success: true,
        outputs,
      }
    } catch (error) {
      result = {
        taskId,
        success: false,
        error: error instanceof Error ? error.message : '转写失败',
      }
    } finally {
      this.activeTaskIds.delete(taskId)
      this.activeProcesses.delete(taskId)
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
      this.emit('complete', result!)
      this.drainQueue()
    }

    return result
  }

  private ensureIfExists(filePath: string): string | undefined {
    return fs.existsSync(filePath) ? filePath : undefined
  }

  private findWhisperBinary(): string | null {
    for (const candidate of this.whisperCliPathCandidates) {
      if (fs.existsSync(candidate)) return candidate
    }
    if (this.hasWhisperBinaryInPath()) {
      return process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
    }
    return null
  }

  private resolveWhisperBinary(): string {
    const localBinary = this.findWhisperBinary()
    if (localBinary) return localBinary

    // 允许使用 PATH 中的 whisper.cpp CLI
    return process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  }

  private findModelPath(): string | null {
    const home = os.homedir()
    const candidates = [
      path.join(app.getPath('userData'), 'models', 'whisper', DEFAULT_WHISPER_MODEL_FILE),
      path.join(process.resourcesPath, 'models', DEFAULT_WHISPER_MODEL_FILE),
      path.join(app.getAppPath(), 'resources', 'models', DEFAULT_WHISPER_MODEL_FILE),
      path.join(home, '.cache', 'whisper.cpp', DEFAULT_WHISPER_MODEL_FILE),
      path.join('/opt/homebrew/share/whisper', DEFAULT_WHISPER_MODEL_FILE),
      path.join('/usr/local/share/whisper', DEFAULT_WHISPER_MODEL_FILE),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }
    return null
  }

  private resolveModelPath(explicitModelPath?: string): string {
    if (explicitModelPath) {
      if (!fs.existsSync(explicitModelPath)) {
        throw new Error('指定的 ASR 模型文件不存在')
      }
      return explicitModelPath
    }

    const detected = this.findModelPath()
    if (!detected) {
      throw new Error(
        `未找到 whisper.cpp 模型（${DEFAULT_WHISPER_MODEL_FILE}）。请在设置页一键下载模型，或放到用户目录 models/whisper / ~/.cache/whisper.cpp`
      )
    }

    return detected
  }

  private getDefaultModelPath(): string {
    return path.join(app.getPath('userData'), 'models', 'whisper', DEFAULT_WHISPER_MODEL_FILE)
  }

  private findVadModelPath(): string | null {
    const home = os.homedir()
    const candidates = [
      path.join(app.getPath('userData'), 'models', 'whisper', DEFAULT_VAD_MODEL_FILE),
      path.join(process.resourcesPath, 'models', DEFAULT_VAD_MODEL_FILE),
      path.join(app.getAppPath(), 'resources', 'models', DEFAULT_VAD_MODEL_FILE),
      path.join(home, '.cache', 'whisper.cpp', DEFAULT_VAD_MODEL_FILE),
      path.join('/opt/homebrew/share/whisper', DEFAULT_VAD_MODEL_FILE),
      path.join('/usr/local/share/whisper', DEFAULT_VAD_MODEL_FILE),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }
    return null
  }

  private resolveVadModelPath(): string {
    const detected = this.findVadModelPath()
    if (!detected) {
      throw new Error(
        `未找到 whisper.cpp VAD 模型（${DEFAULT_VAD_MODEL_FILE}）。请在设置页一键下载 ASR 模型包（medium + VAD）`
      )
    }
    return detected
  }

  private getDefaultVadModelPath(): string {
    return path.join(app.getPath('userData'), 'models', 'whisper', DEFAULT_VAD_MODEL_FILE)
  }

  private async downloadToFile(
    url: string,
    destinationPath: string,
    onProgress?: (downloadedBytes: number, totalBytes?: number) => void,
    redirectCount = 0
  ): Promise<void> {
    if (redirectCount > 5) {
      throw new Error('模型下载重定向过多')
    }

    return new Promise((resolve, reject) => {
      const requestUrl = new URL(url)
      const client = requestUrl.protocol === 'http:' ? http : https
      const req = client.get(
        requestUrl,
        {
          headers: {
            'User-Agent': 'DLVideo-ASR-Model-Downloader',
          },
        },
        (res) => {
          const statusCode = res.statusCode || 0

          if ([301, 302, 303, 307, 308].includes(statusCode) && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, requestUrl).toString()
            res.resume()
            this.downloadToFile(redirectUrl, destinationPath, onProgress, redirectCount + 1)
              .then(resolve)
              .catch(reject)
            return
          }

          if (statusCode < 200 || statusCode >= 300) {
            res.resume()
            reject(new Error(`模型下载失败（HTTP ${statusCode}）`))
            return
          }

          const totalBytesHeader = res.headers['content-length']
          const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : undefined
          let downloadedBytes = 0

          const fileStream = fs.createWriteStream(destinationPath)

          res.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length
            onProgress?.(downloadedBytes, totalBytes)
          })

          res.on('error', (error) => {
            fileStream.destroy()
            reject(error)
          })

          fileStream.on('error', (error) => {
            res.destroy()
            reject(error)
          })

          fileStream.on('finish', () => {
            fileStream.close()
            resolve()
          })

          res.pipe(fileStream)
        }
      )

      req.on('error', reject)
    })
  }

  private hasWhisperBinaryInPath(): boolean {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const binary = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
    const result = spawnSync(cmd, [binary], { stdio: 'ignore' })
    return result.status === 0
  }

  private async runCommand(
    taskId: string,
    command: string,
    args: string[],
    toolName: 'ffmpeg' | 'whisper'
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args)
      this.activeProcesses.set(taskId, proc)

      let stderrOutput = ''
      let stdoutOutput = ''

      // whisper-cli 会持续向 stdout 输出转写内容/进度。
      // 如果不消费 stdout，长音频时可能因管道写满而阻塞子进程。
      proc.stdout?.on('data', (chunk: Buffer) => {
        if (stdoutOutput.length < 4096) {
          stdoutOutput += chunk.toString()
        }
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stderrOutput += text
        // 只打印到主进程日志，避免渲染层刷屏
        console.error(`[ASR ${toolName}] ${text}`)
      })

      proc.on('close', (code) => {
        this.activeProcesses.delete(taskId)
        if (code === 0) {
          resolve()
          return
        }
        const details = [stderrOutput.trim(), stdoutOutput.trim()].filter(Boolean).join(' | ')
        reject(new Error(`${toolName} 执行失败 (退出码: ${code})${details ? `: ${details}` : ''}`))
      })

      proc.on('error', (error) => {
        this.activeProcesses.delete(taskId)
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && toolName === 'whisper') {
          reject(new Error('未找到 whisper.cpp 命令行工具（whisper-cli）'))
          return
        }
        reject(error)
      })
    })
  }
}

export const asrService = new AsrService()
