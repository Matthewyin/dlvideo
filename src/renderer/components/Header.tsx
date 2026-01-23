import React from 'react'
import { Settings, History, HelpCircle, Youtube } from 'lucide-react'
import { useDownloadStore } from '../stores/downloadStore'

export const Header: React.FC = () => {
  const { currentPage, setCurrentPage } = useDownloadStore()

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-surface-secondary border-b border-border shadow-soft app-drag-region">
      {/* Logo */}
      <div className="flex items-center gap-3 app-no-drag">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-soft">
          <Youtube className="w-6 h-6 text-text-inverse" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">DLYouTube</h1>
          <p className="text-xs text-text-tertiary">YouTube视频下载工具</p>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex items-center gap-1 app-no-drag">
        <button
          onClick={() => setCurrentPage('home')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentPage === 'home'
              ? 'bg-primary text-text-inverse'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          首页
        </button>
        <button
          onClick={() => setCurrentPage('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            currentPage === 'history'
              ? 'bg-primary text-text-inverse'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          <History className="w-4 h-4" />
          历史
        </button>
        <button
          onClick={() => setCurrentPage('settings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            currentPage === 'settings'
              ? 'bg-primary text-text-inverse'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          <Settings className="w-4 h-4" />
          设置
        </button>
        <button
          className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="帮助"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </nav>
    </header>
  )
}

