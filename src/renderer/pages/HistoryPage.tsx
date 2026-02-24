import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Search, FolderOpen, Trash2, Download, Loader2, FileText } from 'lucide-react'
import { useDownloadStore } from '../stores/downloadStore'

interface AsrUiState {
  status: 'idle' | 'running' | 'success' | 'failed'
  message?: string
  outputs?: {
    txt?: string
    srt?: string
    vtt?: string
  }
}

interface AsrAvailability {
  checked: boolean
  available: boolean
  message: string | null
  missingWhisperBinary?: boolean
  missingModel?: boolean
  defaultModelPath?: string
  modelDownloadInProgress?: boolean
}

export const HistoryPage: React.FC = () => {
  const setCurrentPage = useDownloadStore((state) => state.setCurrentPage)
  const historyList = useDownloadStore((state) => state.historyList)
  const historyLoading = useDownloadStore((state) => state.historyLoading)
  const removeFromHistory = useDownloadStore((state) => state.removeFromHistory)
  const clearAllHistory = useDownloadStore((state) => state.clearAllHistory)
  const settings = useDownloadStore((state) => state.settings)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio'>('all')
  const [asrStates, setAsrStates] = useState<Record<string, AsrUiState>>({})
  const [asrAvailability, setAsrAvailability] = useState<AsrAvailability>({
    checked: false,
    available: false,
    message: null,
  })
  const [asrModelDownloadState, setAsrModelDownloadState] = useState<{
    inProgress: boolean
    percent?: number
    message?: string
  }>({ inProgress: false })

  const getAsrTaskId = (historyId: string) => `asr-${historyId}`
  const asrModelDownloadTaskId = 'asr-model-base'

  const updateAsrState = useCallback((taskId: string, updates: Partial<AsrUiState>) => {
    setAsrStates((prev) => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        status: prev[taskId]?.status || 'idle',
        ...updates,
      },
    }))
  }, [])

  const refreshAsrStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.getAsrStatus()
      if (status.available) {
        setAsrAvailability({
          checked: true,
          available: true,
          message: null,
          missingWhisperBinary: false,
          missingModel: false,
          defaultModelPath: status.defaultModelPath,
          modelDownloadInProgress: status.modelDownloadInProgress,
        })
        return
      }

      const tips: string[] = []
      if (status.missing?.whisperBinary) tips.push('缺少 whisper-cli')
      if (status.missing?.modelPath) tips.push('缺少 ggml-base.bin 模型')

      setAsrAvailability({
        checked: true,
        available: false,
        message: status.error || (tips.length > 0 ? tips.join('，') : 'ASR 不可用'),
        missingWhisperBinary: status.missing?.whisperBinary,
        missingModel: status.missing?.modelPath,
        defaultModelPath: status.defaultModelPath,
        modelDownloadInProgress: status.modelDownloadInProgress,
      })
    } catch (error) {
      setAsrAvailability({
        checked: true,
        available: false,
        message: error instanceof Error ? error.message : 'ASR 状态检查失败',
      })
    }
  }, [])

  // 加载历史记录
  useEffect(() => {
    useDownloadStore.getState().loadHistory()
  }, [])

  useEffect(() => {
    refreshAsrStatus().catch(() => {
      // handled in refresh
    })

    const unsubProgress = window.electronAPI.onAsrProgress((progress) => {
      updateAsrState(progress.taskId, {
        status: 'running',
        message: progress.message,
      })
    })

    const unsubComplete = window.electronAPI.onAsrComplete((result) => {
      if (result.success) {
        updateAsrState(result.taskId, {
          status: 'success',
          message: '转写完成',
          outputs: result.outputs,
        })
      } else {
        updateAsrState(result.taskId, {
          status: 'failed',
          message: result.error || '转写失败',
        })
      }
    })

    const unsubModelProgress = window.electronAPI.onAsrModelDownloadProgress((progress) => {
      if (progress.taskId !== asrModelDownloadTaskId) return
      setAsrModelDownloadState({
        inProgress: true,
        percent: progress.percent,
        message: progress.message,
      })
    })

    const unsubModelComplete = window.electronAPI.onAsrModelDownloadComplete((result) => {
      if (result.taskId !== asrModelDownloadTaskId) return
      setAsrModelDownloadState({
        inProgress: false,
        message: result.success ? '模型下载完成' : (result.error || '模型下载失败'),
      })
      refreshAsrStatus().catch(() => {
        // handled in refresh
      })
    })

    return () => {
      unsubProgress()
      unsubComplete()
      unsubModelProgress()
      unsubModelComplete()
    }
  }, [asrModelDownloadTaskId, refreshAsrStatus, updateAsrState])

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        useDownloadStore.getState().searchHistory(searchQuery)
      } else {
        useDownloadStore.getState().loadHistory()
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // 过滤结果
  const filteredHistory = historyList.filter(item => {
    if (filterType === 'video') return item.ext !== 'mp3'
    if (filterType === 'audio') return item.ext === 'mp3'
    return true
  })

  // 按日期分组
  const groupByDate = useCallback((items: typeof historyList) => {
    const groups: Record<string, typeof historyList> = {}
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()

    items.forEach(item => {
      const date = new Date(item.downloadedAt).toDateString()
      let label: string
      if (date === today) label = '今天'
      else if (date === yesterday) label = '昨天'
      else label = new Date(item.downloadedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })

      if (!groups[label]) groups[label] = []
      groups[label].push(item)
    })
    return groups
  }, [])

  const groupedHistory = groupByDate(filteredHistory)

  const handleStartAsr = async (historyId: string, filePath: string) => {
    const taskId = getAsrTaskId(historyId)

    updateAsrState(taskId, {
      status: 'running',
      message: '正在提交转写任务...',
    })

    const result = await window.electronAPI.startAsr(taskId, {
      filePath,
      language: settings.asrLanguage,
      formats: (settings.asrOutputFormats?.length ? settings.asrOutputFormats : ['txt', 'srt']) as Array<'txt' | 'srt' | 'vtt'>,
      modelPath: settings.asrModelPath?.trim() || undefined,
    })

    if (!result.success) {
      updateAsrState(taskId, {
        status: 'failed',
        message: result.error || '转写失败',
      })
    }
  }

  const handleDownloadAsrModel = async () => {
    setAsrModelDownloadState({
      inProgress: true,
      message: '正在提交模型下载任务...',
    })

    const result = await window.electronAPI.downloadAsrModel(asrModelDownloadTaskId)
    if (!result.success) {
      setAsrModelDownloadState({
        inProgress: false,
        message: result.error || '模型下载失败',
      })
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => setCurrentPage('home')}
          className="p-2 rounded-lg bg-surface-secondary border border-border hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </button>
        <h1 className="text-2xl font-bold text-text-primary">下载历史</h1>
      </div>

      {asrAvailability.checked && !asrAvailability.available && (
        <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm space-y-3">
          <div>
            <span className="font-medium">ASR 功能暂不可用：</span>
            <span>{asrAvailability.message || '环境未就绪'}</span>
          </div>

          {(asrAvailability.missingWhisperBinary || asrAvailability.missingModel) && (
            <div className="text-xs text-amber-700 space-y-1">
              {asrAvailability.missingWhisperBinary && (
                <p>需要先安装 whisper.cpp CLI（命令名 `whisper-cli`，可通过 Homebrew 安装）。</p>
              )}
              {asrAvailability.missingModel && (
                <p>
                  缺少 ASR 模型 `ggml-base.bin`
                  {asrAvailability.defaultModelPath ? `（将下载到：${asrAvailability.defaultModelPath}）` : ''}
                </p>
              )}
            </div>
          )}

          {asrAvailability.missingModel && (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleDownloadAsrModel}
                disabled={asrModelDownloadState.inProgress}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm transition-colors"
              >
                {asrModelDownloadState.inProgress ? '下载模型中...' : '一键下载 base 模型'}
              </button>
              {asrModelDownloadState.message && (
                <span className="text-xs text-amber-800">
                  {asrModelDownloadState.message}
                  {typeof asrModelDownloadState.percent === 'number' ? ` (${asrModelDownloadState.percent}%)` : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 搜索和筛选 */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索视频..."
            className="w-full pl-11 pr-4 py-2.5 bg-surface-secondary border border-border rounded-lg text-text-primary text-sm placeholder-text-tertiary focus:outline-none focus:border-primary shadow-soft"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className="px-4 py-2.5 bg-surface-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary"
        >
          <option value="all">全部</option>
          <option value="video">视频</option>
          <option value="audio">音频</option>
        </select>
        {historyList.length > 0 && (
          <button
            onClick={clearAllHistory}
            className="px-4 py-2.5 bg-surface-secondary hover:bg-red-50 hover:text-error border border-border rounded-lg text-sm text-text-secondary transition-colors"
          >
            清空历史
          </button>
        )}
      </div>

      {/* 历史记录列表 */}
      {historyLoading && historyList.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-16">
          <Download className="w-16 h-16 mx-auto mb-4 text-text-tertiary" />
          <p className="text-text-secondary text-lg">
            {searchQuery ? '没有找到匹配的记录' : '暂无下载历史'}
          </p>
          <p className="text-text-tertiary text-sm mt-2">
            {searchQuery ? '尝试其他关键词' : '完成的下载将显示在这里'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setCurrentPage('home')}
              className="mt-6 px-6 py-2.5 bg-primary hover:bg-primary-hover text-text-inverse rounded-lg font-medium transition-colors shadow-soft"
            >
              开始下载
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedHistory).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              <div className="text-sm text-text-tertiary font-medium mb-3">{dateLabel}</div>
              <div className="space-y-3">
                {items.map(item => (
                  <div key={item.id} className="bg-surface-secondary rounded-xl p-4 border border-border shadow-soft card-hover">
                    <div className="flex items-center gap-4">
                      {/* 缩略图 */}
                      <div className="w-24 h-14 rounded-lg overflow-hidden bg-surface-tertiary flex-shrink-0">
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect fill="%23E2E8F0" width="16" height="9"/></svg>'
                          }}
                        />
                      </div>

                      {/* 信息 */}
                      <div className="flex-1 min-w-0">
                        {(() => {
                          const asrTaskId = getAsrTaskId(item.id)
                          const asrState = asrStates[asrTaskId]
                          return (
                            <>
                        <p className="text-sm font-medium text-text-primary truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-text-tertiary mt-1">
                          {item.ext.toUpperCase()} · {item.resolution} · {item.channel} ·
                          {new Date(item.downloadedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                              {asrState && asrState.status !== 'idle' && asrState.message && (
                                <p className={`text-xs mt-1 ${asrState.status === 'failed' ? 'text-error' : asrState.status === 'success' ? 'text-success' : 'text-info'}`}>
                                  ASR · {asrState.message}
                                </p>
                              )}
                            </>
                          )
                        })()}
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-2">
                        {item.filePath && (
                          (() => {
                            const asrTaskId = getAsrTaskId(item.id)
                            const asrState = asrStates[asrTaskId]
                            const isRunning = asrState?.status === 'running'
                            const outputPath = asrState?.outputs?.srt || asrState?.outputs?.txt || asrState?.outputs?.vtt

                            return (
                              <>
                                <button
                                  onClick={() => handleStartAsr(item.id, item.filePath)}
                                  disabled={isRunning || !asrAvailability.available}
                                  className="p-2 rounded-lg bg-surface-tertiary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-text-secondary transition-colors"
                                  title={asrAvailability.available ? '语音转文字（ASR）' : 'ASR 不可用'}
                                >
                                  {isRunning ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <FileText className="w-4 h-4" />
                                  )}
                                </button>

                                {outputPath && (
                                  <button
                                    onClick={() => window.electronAPI.showItemInFolder(outputPath)}
                                    className="p-2 rounded-lg bg-surface-tertiary hover:bg-surface-hover text-text-secondary transition-colors"
                                    title="打开转写文件"
                                  >
                                    <FileText className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )
                          })()
                        )}
                        {item.filePath && (
                          <button
                            onClick={() => window.electronAPI.showItemInFolder(item.filePath)}
                            className="p-2 rounded-lg bg-surface-tertiary hover:bg-surface-hover text-text-secondary transition-colors"
                            title="打开文件夹"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => removeFromHistory(item.id)}
                          className="p-2 rounded-lg bg-surface-tertiary hover:bg-red-50 text-text-secondary hover:text-error transition-colors"
                          title="删除记录"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
