import React from 'react'
import { X, RefreshCw } from 'lucide-react'
import { useDownloadStore } from '../stores/downloadStore'

interface UpdateBannerProps {
  version: string
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ version }) => {
  const { setCurrentPage, setYtdlpUpdateAvailable } = useDownloadStore()

  const handleDismiss = () => {
    setYtdlpUpdateAvailable(false)
  }

  const handleUpdate = () => {
    setCurrentPage('settings')
    setYtdlpUpdateAvailable(false)
  }

  return (
    <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-b border-orange-500/30">
      <div className="px-6 py-3">
        <div className="flex items-start gap-4 max-w-4xl mx-auto">
          <div className="flex-shrink-0">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <RefreshCw className="w-5 h-5 text-orange-500" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-orange-500">yt-dlp 有新版本可用</h3>
              <span className="px-2 py-0.5 bg-orange-500/20 rounded text-xs font-medium text-orange-600">
                v{version}
              </span>
            </div>
            <p className="text-sm text-text-secondary">
              建议立即更新以确保兼容最新的 YouTube 变更，避免下载失败（如 403 错误）。
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleUpdate}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg text-sm font-medium text-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              立即更新
            </button>
            <button
              onClick={handleDismiss}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
              title="稍后提醒"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
