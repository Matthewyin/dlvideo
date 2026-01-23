import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { ytdlpService } from './services/ytdlp'
import { downloaderService, DownloadOptions } from './services/downloader'
import { databaseService, HistoryItem, AppSettings } from './services/database'

// ESM 兼容 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 开发环境判断
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// 默认下载路径
const DEFAULT_DOWNLOAD_PATH = path.join(os.homedir(), 'Downloads', 'DLYouTube')

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'DLYouTube',
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
app.whenReady().then(() => {
  // 初始化数据库
  databaseService.initialize()

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
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: '选择下载目录',
    defaultPath: DEFAULT_DOWNLOAD_PATH,
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
    // 检测是否为播放列表
    if (ytdlpService.isPlaylistUrl(url)) {
      const playlistInfo = await ytdlpService.getPlaylistInfo(url)
      return { success: true, data: playlistInfo, isPlaylist: true }
    }
    const videoInfo = await ytdlpService.getVideoInfo(url)
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
    const playlistInfo = await ytdlpService.getPlaylistInfo(url)
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
    // 异步启动下载，不等待完成
    downloaderService.startDownload(taskId, options).catch(err => {
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

// IPC 处理器 - 暂停下载
ipcMain.handle('pause-download', (_, taskId: string) => {
  return downloaderService.pauseDownload(taskId)
})

// IPC 处理器 - 恢复下载
ipcMain.handle('resume-download', (_, taskId: string) => {
  return downloaderService.resumeDownload(taskId)
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
