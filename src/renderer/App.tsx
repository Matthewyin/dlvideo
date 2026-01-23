import React, { useEffect } from 'react'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import { HistoryPage } from './pages/HistoryPage'
import { useDownloadStore, initializeApp } from './stores/downloadStore'

const App: React.FC = () => {
  const { currentPage, setCurrentPage, updateTask, addToHistory, clearCompleted } = useDownloadStore()

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
      } else {
        updateTask(result.taskId, {
          status: 'failed',
          error: result.error || '下载失败',
        })
      }
    })

    // 清理监听器
    return () => {
      unsubProgress()
      unsubComplete()
    }
  }, [updateTask, addToHistory])

  const renderPage = () => {
    switch (currentPage) {
      case 'settings':
        return <SettingsPage />
      case 'history':
        return <HistoryPage />
      default:
        return <HomePage />
    }
  }

  return (
    <div className="h-screen flex flex-col bg-surface text-text-primary">
      <Header />

      <main className="flex-1 overflow-y-auto">
        {renderPage()}
      </main>

      <Footer />
    </div>
  )
}

export default App

