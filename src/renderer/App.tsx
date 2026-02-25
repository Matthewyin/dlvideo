import React, { useEffect } from 'react'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { UpdateBanner } from './components/UpdateBanner'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import { HistoryPage } from './pages/HistoryPage'
import { TranscribePage } from './pages/TranscribePage'
import { useDownloadStore, initializeApp } from './stores/downloadStore'

const App: React.FC = () => {
  const currentPage = useDownloadStore((state) => state.currentPage)
  const setCurrentPage = useDownloadStore((state) => state.setCurrentPage)
  const updateTask = useDownloadStore((state) => state.updateTask)
  const addToHistory = useDownloadStore((state) => state.addToHistory)
  const clearCompleted = useDownloadStore((state) => state.clearCompleted)
  const ytdlpUpdateAvailable = useDownloadStore((state) => state.ytdlpUpdateAvailable)
  const ytdlpLatestVersion = useDownloadStore((state) => state.ytdlpLatestVersion)
  const setYtdlpUpdateAvailable = useDownloadStore((state) => state.setYtdlpUpdateAvailable)
  const setYtdlpLatestVersion = useDownloadStore((state) => state.setYtdlpLatestVersion)

  // 全局快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

      // Cmd/Ctrl + , 打开设置
      if (cmdOrCtrl && e.key === ',') {
        e.preventDefault()
        setCurrentPage('settings')
      }
      // Cmd/Ctrl + H 打开历史
      else if (cmdOrCtrl && e.key === 'h') {
        e.preventDefault()
        setCurrentPage('history')
      }
      // Cmd/Ctrl + 1 返回首页
      else if (cmdOrCtrl && e.key === '1') {
        e.preventDefault()
        setCurrentPage('home')
      }
      // Cmd/Ctrl + V 自动粘贴并解析（在首页时）
      else if (cmdOrCtrl && e.key === 'v' && currentPage === 'home') {
        // 让默认粘贴行为执行，UrlInput 会处理
      }
      // Cmd/Ctrl + Shift + C 清除已完成任务
      else if (cmdOrCtrl && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        clearCompleted()
      }
      // Esc 返回首页
      else if (e.key === 'Escape' && currentPage !== 'home') {
        e.preventDefault()
        setCurrentPage('home')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPage, setCurrentPage, clearCompleted])

  // 初始化应用
  useEffect(() => {
    // 初始化应用（加载设置和历史）
    initializeApp()
  }, [])

  // 监听下载与更新事件
  useEffect(() => {
    // 监听下载进度
    const unsubProgress = window.electronAPI.onDownloadProgress((progress) => {
      updateTask(progress.taskId, {
        status: 'downloading',
        progress: progress.percent,
        speed: progress.speed,
        eta: progress.eta,
      })
    })

    // 监听下载完成
    const unsubComplete = window.electronAPI.onDownloadComplete((result) => {
      if (result.success) {
        updateTask(result.taskId, {
          status: 'completed',
          progress: 100,
          filePath: result.filePath,
          speed: '0 B/s',
          eta: '已完成',
        })

        // 保存到历史记录
        const task = useDownloadStore.getState().downloadQueue.find(t => t.id === result.taskId)
        if (task) {
          addToHistory({
            id: task.id,
            videoId: task.videoInfo.id,
            title: task.videoInfo.title,
            thumbnail: task.videoInfo.thumbnail,
            channel: task.videoInfo.channel,
            duration: task.videoInfo.duration,
            durationFormatted: task.videoInfo.durationFormatted,
            formatId: task.selectedFormat.formatId,
            resolution: task.selectedFormat.resolution,
            ext: task.selectedFormat.ext,
            filePath: result.filePath || '',
            fileSize: task.selectedFormat.filesize,
            downloadedAt: new Date().toISOString(),
            url: task.videoInfo.url,
          })
        }

        // 可选：下载完成后自动转写（ASR）
        const currentSettings = useDownloadStore.getState().settings
        if (result.filePath && currentSettings.asrEnabled && currentSettings.asrAutoTranscribe) {
          const autoAsrTaskId = `asr-auto-${result.taskId}`
          const formats = (currentSettings.asrOutputFormats?.length ? currentSettings.asrOutputFormats : ['txt', 'srt']) as Array<'txt' | 'srt' | 'vtt'>

          window.electronAPI.startAsr(autoAsrTaskId, {
            filePath: result.filePath,
            language: currentSettings.asrLanguage,
            formats,
            modelPath: currentSettings.asrModelPath?.trim() || undefined,
          }).then((asrResult) => {
            if (!asrResult.success) {
              console.error(`Auto ASR failed for ${result.taskId}:`, asrResult.error)
            }
          }).catch((error) => {
            console.error(`Auto ASR failed for ${result.taskId}:`, error)
          })
        }
      } else {
        updateTask(result.taskId, {
          status: 'failed',
          error: result.error || '下载失败',
        })
      }
    })

    // 监听 yt-dlp 更新通知
    const unsubUpdate = window.electronAPI.onYtDlpUpdateAvailable((hasUpdate, version) => {
      if (hasUpdate) {
        setYtdlpUpdateAvailable(true)
        setYtdlpLatestVersion(version)
      }
    })

    // 清理监听器
    return () => {
      unsubProgress()
      unsubComplete()
      unsubUpdate()
    }
  }, [updateTask, addToHistory, setYtdlpUpdateAvailable, setYtdlpLatestVersion])

  return (
    <div className="h-screen flex flex-col bg-surface text-text-primary">
      {/* yt-dlp 更新通知 */}
      {ytdlpUpdateAvailable && ytdlpLatestVersion && (
        <UpdateBanner version={ytdlpLatestVersion} />
      )}

      <Header />

      <main className="flex-1 overflow-y-auto">
        <div className={currentPage === 'home' ? 'block' : 'hidden'} aria-hidden={currentPage !== 'home'}>
          <HomePage />
        </div>
        <div className={currentPage === 'history' ? 'block' : 'hidden'} aria-hidden={currentPage !== 'history'}>
          <HistoryPage />
        </div>
        <div className={currentPage === 'settings' ? 'block' : 'hidden'} aria-hidden={currentPage !== 'settings'}>
          <SettingsPage />
        </div>
        <div className={currentPage === 'transcribe' ? 'block' : 'hidden'} aria-hidden={currentPage !== 'transcribe'}>
          <TranscribePage />
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default App
