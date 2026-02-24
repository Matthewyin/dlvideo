import React, { useState } from 'react'
import { Settings, History, HelpCircle, PlayCircle, X } from 'lucide-react'
import { useDownloadStore } from '../stores/downloadStore'

export const Header: React.FC = () => {
  const currentPage = useDownloadStore((state) => state.currentPage)
  const setCurrentPage = useDownloadStore((state) => state.setCurrentPage)
  const [showHelp, setShowHelp] = useState(false)

  return (
    <>
      <header className="flex items-center justify-between pl-20 pr-6 py-4 bg-surface-secondary border-b border-border shadow-soft app-drag-region">
        {/* Logo */}
        <div className="flex items-center gap-3 app-no-drag">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-soft">
            <PlayCircle className="w-6 h-6 text-text-inverse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">DLVideo</h1>
            <p className="text-xs text-text-tertiary">视频下载工具</p>
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
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="帮助"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </nav>
      </header>

      {/* 帮助弹窗 */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
          <div className="bg-surface-secondary rounded-xl p-6 max-w-md w-full mx-4 shadow-lg border border-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">使用帮助</h2>
              <button onClick={() => setShowHelp(false)} className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 text-sm text-text-secondary">
              <div>
                <h3 className="font-medium text-text-primary mb-1">粘贴链接</h3>
                <p>在输入框粘贴视频链接，支持多个链接（每行一个）</p>
              </div>
              <div>
                <h3 className="font-medium text-text-primary mb-1">单个视频</h3>
                <p>选择视频格式、分辨率，可选下载字幕或仅音频，点击"开始下载"</p>
              </div>
              <div>
                <h3 className="font-medium text-text-primary mb-1">播放列表</h3>
                <p>勾选要下载的视频，支持全选/取消，点击"下载选中"批量下载</p>
              </div>
              <div>
                <h3 className="font-medium text-text-primary mb-1">设置</h3>
                <p>可修改下载路径、配置代理服务器</p>
              </div>
              <div>
                <h3 className="font-medium text-text-primary mb-1">历史</h3>
                <p>查看下载历史记录，支持打开文件所在目录</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
