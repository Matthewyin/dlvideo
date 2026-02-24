import React from 'react'
import { X, FolderOpen, RotateCcw, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react'
import { useDownloadStore, DownloadTask } from '../stores/downloadStore'

// 单个下载任务项
const DownloadItem: React.FC<{ task: DownloadTask }> = ({ task }) => {
  const { updateTask, removeFromQueue } = useDownloadStore()

  // 重试
  const retry = () => {
    updateTask(task.id, { status: 'pending', progress: 0, error: undefined })
  }

  // 状态图标
  const StatusIcon = () => {
    switch (task.status) {
      case 'pending': return <Clock className="w-5 h-5 text-gray-400" />
      case 'downloading': return <Loader2 className="w-5 h-5 text-info animate-spin" />
      case 'completed': return <CheckCircle className="w-5 h-5 text-success" />
      case 'failed': return <AlertCircle className="w-5 h-5 text-error" />
      default: return <Clock className="w-5 h-5 text-gray-400" />
    }
  }

  // 进度条颜色
  const progressColor = {
    pending: 'bg-gray-500',
    downloading: 'bg-info',
    completed: 'bg-success',
    failed: 'bg-error',
  }[task.status] || 'bg-gray-500'

  return (
    <div className="bg-surface-secondary rounded-lg p-4 border border-border shadow-soft card-hover">
      <div className="flex items-center gap-4">
        <StatusIcon />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {task.videoInfo.title}.{task.selectedFormat.ext}
          </p>

          {/* 进度条 */}
          <div className="mt-2 h-2 bg-surface-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full ${progressColor} transition-all duration-300 ${task.status === 'downloading' ? 'progress-animate' : ''}`}
              style={{ width: `${task.progress}%` }}
            />
          </div>

          {/* 状态信息 */}
          <div className="mt-1.5 flex items-center gap-4 text-xs text-text-secondary">
            <span>{task.progress.toFixed(1)}%</span>
            {task.status === 'downloading' && (
              <>
                <span>{task.speed}</span>
                <span>剩余 {task.eta}</span>
              </>
            )}
            {task.status === 'completed' && <span className="text-success">下载完成</span>}
            {task.status === 'failed' && <span className="text-error">{task.error || '下载失败'}</span>}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          {task.status === 'completed' && task.filePath && (
            <button
              onClick={() => window.electronAPI.showItemInFolder(task.filePath!)}
              className="p-2 rounded-lg bg-surface-tertiary hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
              title="打开文件夹">
              <FolderOpen className="w-4 h-4" />
            </button>
          )}

          {task.status === 'failed' && (
            <button onClick={retry}
              className="p-2 rounded-lg bg-surface-tertiary hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
              title="重试">
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={async () => {
              // 如果正在下载，先取消下载
              if (task.status === 'downloading' || task.status === 'pending') {
                await window.electronAPI.cancelDownload(task.id)
              }
              removeFromQueue(task.id)
            }}
            className="p-2 rounded-lg bg-surface-tertiary hover:bg-red-50 text-text-secondary hover:text-error transition-colors"
            title="删除">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export const DownloadQueue: React.FC = () => {
  const { downloadQueue, clearCompleted } = useDownloadStore()

  const activeCount = downloadQueue.filter(t => t.status === 'downloading' || t.status === 'pending').length
  const completedCount = downloadQueue.filter(t => t.status === 'completed').length

  if (downloadQueue.length === 0) {
    return null
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          下载队列
          {activeCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-50 text-info text-sm rounded-full">{activeCount}</span>
          )}
        </h2>
        {completedCount > 0 && (
          <button onClick={clearCompleted}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            清除已完成 ({completedCount})
          </button>
        )}
      </div>

      <div className="space-y-3">
        {downloadQueue.map(task => (
          <DownloadItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}
