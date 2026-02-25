import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { ytdlpService } from './services/ytdlp'
import { downloaderService, DownloadOptions } from './services/downloader'
import { asrService, AsrOptions } from './services/asr'
import { databaseService, HistoryItem, AppSettings, CookiesBrowser } from './services/database'

// Cookies 文件路径
const YOUTUBE_COOKIES_FILE_PATH = path.join(app.getPath('userData'), 'youtube_cookies.txt')
const BILIBILI_COOKIES_FILE_PATH = path.join(app.getPath('userData'), 'bilibili_cookies.txt')

// ESM 兼容 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 开发环境判断（打包版必须始终走生产加载路径，避免被外部 NODE_ENV 污染）
const isDev = !app.isPackaged

// 默认下载路径
const DEFAULT_DOWNLOAD_PATH = path.join(os.homedir(), 'Downloads', 'DLVideo')

let mainWindow: BrowserWindow | null = null

function parseMaxConcurrentDownloads(value: unknown): number {
  if (value == null || value === '') {
    return 3
  }

  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value)
          } catch {
            return value
          }
        })()
      : value

  const num = typeof parsed === 'number' ? parsed : Number(parsed)
  if (!Number.isFinite(num) || num <= 0) return 3
  return Math.max(1, Math.floor(num))
}

function syncDownloaderConcurrencyFromSettings(): number {
  const rawValue = databaseService.getSetting('maxConcurrentDownloads')
  const limit = parseMaxConcurrentDownloads(rawValue)
  downloaderService.setMaxConcurrentDownloads(limit)
  return limit
}

// 静默检查 yt-dlp 更新（应用启动时）
async function checkYtDlpUpdates() {
  try {
    const result = await downloaderService.updateYtDlp()
    if (result.success) {
      // 检查是否有新版本（排除"已更新"的情况）
      const hasUpdate =
        (result.message.includes('更新') && !result.message.includes('已更新')) ||
        result.message.includes('Updating')

      if (hasUpdate && result.latestVersion) {
        // 发送更新通知到渲染进程
        mainWindow?.webContents.send('ytdlp-update-available', {
          hasUpdate: true,
          version: result.latestVersion
        })
      }
    }
  } catch (error) {
    // 静默失败，不影响应用启动
    console.error('检查 yt-dlp 更新失败:', error)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'DLVideo',
    backgroundColor: '#0f0f1a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 加载页面
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // 外部链接在浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 应用准备好后创建窗口
app.whenReady().then(async () => {
  // 初始化数据库
  databaseService.initialize()
  // 初始化下载并发限制
  syncDownloaderConcurrencyFromSettings()

  // 检查 yt-dlp 更新（静默检查，不阻塞启动）
  checkYtDlpUpdates()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出时关闭数据库
app.on('before-quit', () => {
  databaseService.close()
})

// IPC 处理器 - 选择下载目录
ipcMain.handle('select-download-path', async () => {
  const properties: Electron.OpenDialogOptions['properties'] = ['openDirectory']

  if (process.platform === 'darwin') {
    properties.push('createDirectory')
  } else if (process.platform === 'win32') {
    properties.push('promptToCreate')
  }

  const result = await dialog.showOpenDialog(mainWindow!, {
    properties,
    title: '选择下载目录',
    defaultPath: DEFAULT_DOWNLOAD_PATH,
  })
  return result.canceled ? null : result.filePaths[0]
})

// IPC 处理器 - 选择 ASR 模型文件
ipcMain.handle('select-asr-model-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    title: '选择 ASR 模型文件 (ggml-*.bin)',
    filters: [
      { name: 'Whisper 模型文件', extensions: ['bin'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  return result.canceled ? null : result.filePaths[0]
})

// IPC 处理器 - 选择本地媒体文件（用于文本转写）
ipcMain.handle('select-asr-media-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    title: '选择要转写的视频/音频文件',
    filters: [
      { name: '媒体文件', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg'] },
      { name: '视频文件', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] },
      { name: '音频文件', extensions: ['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  return result.canceled ? null : result.filePaths[0]
})

// IPC 处理器 - 打开文件夹
ipcMain.handle('open-folder', async (_, folderPath: string) => {
  shell.openPath(folderPath)
})

// IPC 处理器 - 在文件管理器中显示文件
ipcMain.handle('show-item-in-folder', async (_, filePath: string) => {
  shell.showItemInFolder(filePath)
})

// IPC 处理器 - 获取默认下载路径
ipcMain.handle('get-default-download-path', () => {
  return DEFAULT_DOWNLOAD_PATH
})

// IPC 处理器 - 解析视频信息
ipcMain.handle('parse-video', async (_, url: string) => {
  try {
    // 获取 cookies 浏览器设置
    const cookiesBrowser = databaseService.getSetting('cookiesBrowser') || 'chrome'

    // 检测是否为播放列表
    if (ytdlpService.isPlaylistUrl(url)) {
      const playlistInfo = await ytdlpService.getPlaylistInfo(url, cookiesBrowser)
      return { success: true, data: playlistInfo, isPlaylist: true }
    }
    const videoInfo = await ytdlpService.getVideoInfo(url, cookiesBrowser)
    return { success: true, data: videoInfo, isPlaylist: false }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '解析失败'
    }
  }
})

// IPC 处理器 - 获取播放列表信息
ipcMain.handle('parse-playlist', async (_, url: string) => {
  try {
    // 获取 cookies 浏览器设置
    const cookiesBrowser = databaseService.getSetting('cookiesBrowser') || 'chrome'
    const playlistInfo = await ytdlpService.getPlaylistInfo(url, cookiesBrowser)
    return { success: true, data: playlistInfo }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '解析播放列表失败'
    }
  }
})

// IPC 处理器 - 开始下载
ipcMain.handle('start-download', async (_, taskId: string, options: DownloadOptions) => {
  try {
    // 兜底同步一次并发限制，确保设置变更后无需重启即可生效
    syncDownloaderConcurrencyFromSettings()

    // 获取 cookies 浏览器设置并添加到选项中
    const cookiesBrowser = (databaseService.getSetting('cookiesBrowser') || 'chrome') as CookiesBrowser
    const optionsWithCookies = { ...options, cookiesBrowser }

    // 异步启动下载，不等待完成
    downloaderService.startDownload(taskId, optionsWithCookies).catch(err => {
      console.error(`Download ${taskId} failed:`, err)
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '下载启动失败'
    }
  }
})

// IPC 处理器 - 取消下载
ipcMain.handle('cancel-download', (_, taskId: string) => {
  return downloaderService.cancelDownload(taskId)
})

// 监听下载进度并转发到渲染进程
downloaderService.on('progress', (progress) => {
  mainWindow?.webContents.send('download-progress', progress)
})

// 监听下载完成并转发到渲染进程
downloaderService.on('complete', (result) => {
  mainWindow?.webContents.send('download-complete', result)
})

// 监听 ASR 进度并转发到渲染进程
asrService.on('progress', (progress) => {
  mainWindow?.webContents.send('asr-progress', progress)
})

// 监听 ASR 完成并转发到渲染进程
asrService.on('complete', (result) => {
  mainWindow?.webContents.send('asr-complete', result)
})

// 监听 ASR 模型下载进度并转发到渲染进程
asrService.on('model-download-progress', (progress) => {
  mainWindow?.webContents.send('asr-model-download-progress', progress)
})

// 监听 ASR 模型下载完成并转发到渲染进程
asrService.on('model-download-complete', (result) => {
  mainWindow?.webContents.send('asr-model-download-complete', result)
})

// ============ 数据库相关 IPC 处理器 ============

// IPC 处理器 - 获取所有设置
ipcMain.handle('get-settings', () => {
  try {
    return databaseService.getAllSettings()
  } catch (error) {
    console.error('获取设置失败:', error)
    return {}
  }
})

// IPC 处理器 - 保存设置
ipcMain.handle('save-settings', (_, settings: AppSettings) => {
  try {
    databaseService.saveAllSettings(settings)
    downloaderService.setMaxConcurrentDownloads(parseMaxConcurrentDownloads(settings.maxConcurrentDownloads))
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// IPC 处理器 - 获取历史记录
ipcMain.handle('get-history', (_, limit?: number, offset?: number) => {
  try {
    return databaseService.getHistory(limit, offset)
  } catch (error) {
    console.error('获取历史记录失败:', error)
    return []
  }
})

// ============ ASR 相关 IPC 处理器 ============

ipcMain.handle('get-asr-status', () => {
  try {
    const rawModelPath = databaseService.getSetting('asrModelPath')
    let modelPathOverride: string | undefined
    if (rawModelPath) {
      try {
        const parsed = JSON.parse(rawModelPath)
        modelPathOverride = typeof parsed === 'string' ? parsed : undefined
      } catch {
        modelPathOverride = rawModelPath
      }
    }

    return asrService.getStatus(modelPathOverride)
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'ASR 状态检查失败',
    }
  }
})

ipcMain.handle('start-asr', async (_, taskId: string, options: AsrOptions) => {
  try {
    const result = await asrService.startTranscription(taskId, options)
    return result
  } catch (error) {
    return {
      taskId,
      success: false,
      error: error instanceof Error ? error.message : '转写失败',
    }
  }
})

ipcMain.handle('cancel-asr', (_, taskId: string) => {
  return asrService.cancelTranscription(taskId)
})

ipcMain.handle('download-asr-model', async (_, taskId: string) => {
  try {
    return await asrService.downloadDefaultModels(taskId)
  } catch (error) {
    return {
      taskId,
      success: false,
      error: error instanceof Error ? error.message : '模型下载失败',
    }
  }
})

// IPC 处理器 - 搜索历史记录
ipcMain.handle('search-history', (_, query: string) => {
  try {
    return databaseService.searchHistory(query)
  } catch (error) {
    console.error('搜索历史记录失败:', error)
    return []
  }
})

// IPC 处理器 - 添加历史记录
ipcMain.handle('add-history', (_, item: HistoryItem) => {
  try {
    databaseService.addHistory(item)
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// IPC 处理器 - 删除历史记录
ipcMain.handle('delete-history', (_, id: string) => {
  try {
    databaseService.deleteHistory(id)
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// IPC 处理器 - 清空历史记录
ipcMain.handle('clear-history', () => {
  try {
    databaseService.clearHistory()
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// IPC 处理器 - 获取历史记录数量
ipcMain.handle('get-history-count', () => {
  try {
    return databaseService.getHistoryCount()
  } catch (error) {
    console.error('获取历史记录数量失败:', error)
    return 0
  }
})

// ============ YouTube 登录相关 IPC 处理器 ============

// IPC 处理器 - 打开系统浏览器登录 YouTube
ipcMain.handle('open-youtube-login', async () => {
  // 打开系统默认浏览器到 YouTube 登录页面
  shell.openExternal('https://www.youtube.com/')
  return { success: true, message: '已打开浏览器，请登录后导出 Cookies 文件' }
})

// IPC 处理器 - 导入 Cookies 文件
ipcMain.handle('import-cookies-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择 Cookies 文件',
    filters: [
      { name: 'Cookies 文件', extensions: ['txt'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: '未选择文件' }
  }

  try {
    const sourcePath = result.filePaths[0]
    const content = fs.readFileSync(sourcePath, 'utf-8')

    // 验证是否是有效的 Netscape cookies 文件
    if (!content.includes('.youtube.com') && !content.includes('.google.com')) {
      return { success: false, message: 'Cookies 文件中未找到 YouTube 相关的 cookies' }
    }

    // 复制到应用数据目录
    fs.writeFileSync(YOUTUBE_COOKIES_FILE_PATH, content, 'utf-8')
    console.log(`Imported cookies from ${sourcePath} to ${YOUTUBE_COOKIES_FILE_PATH}`)

    return { success: true, message: 'Cookies 导入成功' }
  } catch (error) {
    console.error('导入 Cookies 失败:', error)
    return { success: false, message: (error as Error).message }
  }
})

// IPC 处理器 - 检查 YouTube 登录状态
ipcMain.handle('check-youtube-login', async () => {
  try {
    // 检查 cookies 文件是否存在
    if (!fs.existsSync(YOUTUBE_COOKIES_FILE_PATH)) {
      return { loggedIn: false }
    }

    // 检查文件是否有内容
    const content = fs.readFileSync(YOUTUBE_COOKIES_FILE_PATH, 'utf-8')
    const hasCookies = content.includes('youtube.com') && content.split('\n').length > 5

    return { loggedIn: hasCookies }
  } catch (error) {
    console.error('检查登录状态失败:', error)
    return { loggedIn: false }
  }
})

// IPC 处理器 - 登出 YouTube（删除 cookies 文件）
ipcMain.handle('logout-youtube', async () => {
  try {
    // 删除 cookies 文件
    if (fs.existsSync(YOUTUBE_COOKIES_FILE_PATH)) {
      fs.unlinkSync(YOUTUBE_COOKIES_FILE_PATH)
    }
    return { success: true }
  } catch (error) {
    console.error('登出失败:', error)
    return { success: false, message: (error as Error).message }
  }
})

// IPC 处理器 - 获取 YouTube cookies 文件路径
ipcMain.handle('get-cookies-file-path', () => {
  return YOUTUBE_COOKIES_FILE_PATH
})

// ========== B站 Cookies 相关 IPC 处理器 ==========

// IPC 处理器 - 打开系统浏览器登录 B站
ipcMain.handle('open-bilibili-login', async () => {
  shell.openExternal('https://www.bilibili.com/')
  return { success: true, message: '已打开浏览器，请登录后导出 Cookies 文件' }
})

// IPC 处理器 - 导入 B站 Cookies 文件
ipcMain.handle('import-bilibili-cookies-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择 B站 Cookies 文件',
    filters: [
      { name: 'Cookies 文件', extensions: ['txt'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: '未选择文件' }
  }

  try {
    const sourcePath = result.filePaths[0]
    const content = fs.readFileSync(sourcePath, 'utf-8')

    // 验证是否是有效的 B站 cookies 文件
    if (!content.includes('.bilibili.com')) {
      return { success: false, message: 'Cookies 文件中未找到 B站 相关的 cookies' }
    }

    // 复制到应用数据目录
    fs.writeFileSync(BILIBILI_COOKIES_FILE_PATH, content, 'utf-8')
    console.log(`Imported Bilibili cookies from ${sourcePath} to ${BILIBILI_COOKIES_FILE_PATH}`)

    return { success: true, message: 'B站 Cookies 导入成功' }
  } catch (error) {
    console.error('导入 B站 Cookies 失败:', error)
    return { success: false, message: (error as Error).message }
  }
})

// IPC 处理器 - 检查 B站 登录状态
ipcMain.handle('check-bilibili-login', async () => {
  try {
    // 检查 cookies 文件是否存在
    if (!fs.existsSync(BILIBILI_COOKIES_FILE_PATH)) {
      return { loggedIn: false }
    }

    // 检查文件是否有内容
    const content = fs.readFileSync(BILIBILI_COOKIES_FILE_PATH, 'utf-8')
    const hasCookies = content.includes('bilibili.com') && content.split('\n').length > 5

    return { loggedIn: hasCookies }
  } catch (error) {
    console.error('检查 B站 登录状态失败:', error)
    return { loggedIn: false }
  }
})

// IPC 处理器 - 登出 B站（删除 cookies 文件）
ipcMain.handle('logout-bilibili', async () => {
  try {
    // 删除 cookies 文件
    if (fs.existsSync(BILIBILI_COOKIES_FILE_PATH)) {
      fs.unlinkSync(BILIBILI_COOKIES_FILE_PATH)
    }
    return { success: true }
  } catch (error) {
    console.error('B站 登出失败:', error)
    return { success: false, message: (error as Error).message }
  }
})

// ============ yt-dlp 更新相关 IPC 处理器 ============

// IPC 处理器 - 获取 yt-dlp 版本
ipcMain.handle('get-ytdlp-version', async () => {
  try {
    const result = await downloaderService.getYtDlpVersion()
    return result
  } catch (error) {
    console.error('获取 yt-dlp 版本失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// IPC 处理器 - 更新 yt-dlp
ipcMain.handle('update-ytdlp', async () => {
  try {
    const result = await downloaderService.updateYtDlp()
    return result
  } catch (error) {
    console.error('更新 yt-dlp 失败:', error)
    return { success: false, message: (error as Error).message }
  }
})
