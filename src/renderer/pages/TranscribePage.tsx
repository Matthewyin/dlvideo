import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileAudio2, Loader2, Mic, FileText, FolderOpen } from 'lucide-react'
import { useDownloadStore } from '../stores/downloadStore'

type LocalAsrState =
  | { status: 'idle' }
  | { status: 'running'; message: string }
  | { status: 'success'; message: string; outputs?: { txt?: string; srt?: string; vtt?: string } }
  | { status: 'failed'; message: string }

export const TranscribePage: React.FC = () => {
  const setCurrentPage = useDownloadStore((state) => state.setCurrentPage)
  const currentPage = useDownloadStore((state) => state.currentPage)
  const settings = useDownloadStore((state) => state.settings)
  const [selectedFilePath, setSelectedFilePath] = useState<string>('')
  const [asrAvailabilityMessage, setAsrAvailabilityMessage] = useState<string>('')
  const [asrAvailable, setAsrAvailable] = useState(false)
  const [taskState, setTaskState] = useState<LocalAsrState>({ status: 'idle' })
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)

  const selectedFileName = useMemo(
    () => (selectedFilePath ? selectedFilePath.split(/[\\/]/).pop() || selectedFilePath : ''),
    [selectedFilePath]
  )

  const refreshAsrStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.getAsrStatus()
      setAsrAvailable(status.available)
      if (status.available) {
        setAsrAvailabilityMessage('')
        return
      }

      const tips: string[] = []
      if (status.missing?.whisperBinary) tips.push('缺少 whisper-cli')
      if (status.missing?.modelPath) tips.push('缺少 ASR 模型（ggml-medium.bin）')
      if (status.missing?.vadModelPath) tips.push('缺少 VAD 模型（ggml-silero-v5.1.2.bin）')
      setAsrAvailabilityMessage(status.error || tips.join('，') || 'ASR 环境未就绪')
    } catch (error) {
      setAsrAvailable(false)
      setAsrAvailabilityMessage(error instanceof Error ? error.message : 'ASR 状态检查失败')
    }
  }, [settings.asrModelPath])

  useEffect(() => {
    refreshAsrStatus().catch(() => {
      // handled above
    })
  }, [refreshAsrStatus])

  useEffect(() => {
    if (currentPage !== 'transcribe') return
    refreshAsrStatus().catch(() => {
      // handled above
    })
  }, [currentPage, refreshAsrStatus])

  useEffect(() => {
    const unsubModelComplete = window.electronAPI.onAsrModelDownloadComplete(() => {
      refreshAsrStatus().catch(() => {
        // handled above
      })
    })

    return () => {
      unsubModelComplete()
    }
  }, [refreshAsrStatus])

  useEffect(() => {
    const unsubProgress = window.electronAPI.onAsrProgress((progress) => {
      if (!activeTaskId || progress.taskId !== activeTaskId) return
      setTaskState({ status: 'running', message: progress.message })
    })

    const unsubComplete = window.electronAPI.onAsrComplete((result) => {
      if (!activeTaskId || result.taskId !== activeTaskId) return

      if (result.success) {
        setTaskState({ status: 'success', message: '转写完成', outputs: result.outputs })
      } else {
        setTaskState({ status: 'failed', message: result.error || '转写失败' })
      }
      setActiveTaskId(null)
    })

    return () => {
      unsubProgress()
      unsubComplete()
    }
  }, [activeTaskId])

  const handlePickFile = async () => {
    const filePath = await window.electronAPI.selectAsrMediaFile()
    if (!filePath) return
    setSelectedFilePath(filePath)
    setTaskState({ status: 'idle' })
  }

  const handleStartTranscribe = async () => {
    if (!selectedFilePath) {
      setTaskState({ status: 'failed', message: '请先选择一个视频/音频文件' })
      return
    }

    const taskId = `asr-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setActiveTaskId(taskId)
    setTaskState({ status: 'running', message: '正在提交转写任务...' })

    const result = await window.electronAPI.startAsr(taskId, {
      filePath: selectedFilePath,
      language: settings.asrLanguage,
      formats: (settings.asrOutputFormats?.length ? settings.asrOutputFormats : ['txt', 'srt']) as Array<'txt' | 'srt' | 'vtt'>,
      modelPath: settings.asrModelPath?.trim() || undefined,
    })

    if (!result.success) {
      setActiveTaskId(null)
      setTaskState({ status: 'failed', message: result.error || '转写失败' })
    }
  }

  const outputPath =
    taskState.status === 'success'
      ? taskState.outputs?.srt || taskState.outputs?.txt || taskState.outputs?.vtt
      : undefined

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => setCurrentPage('home')}
          className="p-2 rounded-lg bg-surface-secondary border border-border hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </button>
        <h1 className="text-2xl font-bold text-text-primary">文本转写</h1>
      </div>

      {!asrAvailable && (
        <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          ASR 环境未就绪：{asrAvailabilityMessage || '请先在设置页完成 ASR 环境配置'}
        </div>
      )}

      <div className="bg-surface-secondary rounded-xl p-6 border border-border shadow-soft space-y-5">
        <div>
          <p className="text-sm text-text-secondary mb-3">
            选择本地视频或音频文件，使用平衡档（预处理 + VAD）与 medium 模型转写，结果将直接生成到原文件同目录（`.asr.txt / .asr.srt / .asr.vtt`）。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handlePickFile}
              className="px-4 py-2.5 rounded-lg bg-surface-tertiary hover:bg-surface-hover border border-border text-text-primary text-sm transition-colors inline-flex items-center gap-2"
            >
              <FileAudio2 className="w-4 h-4" />
              选择本地文件
            </button>

            {selectedFilePath && (
              <button
                onClick={() => window.electronAPI.showItemInFolder(selectedFilePath)}
                className="px-4 py-2.5 rounded-lg bg-surface-tertiary hover:bg-surface-hover border border-border text-text-secondary hover:text-text-primary text-sm transition-colors inline-flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                打开所在目录
              </button>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-surface-tertiary border border-border p-4">
          <div className="text-xs text-text-tertiary mb-2">已选文件</div>
          {selectedFilePath ? (
            <>
              <div className="text-sm text-text-primary font-medium truncate">{selectedFileName}</div>
              <div className="text-xs text-text-tertiary mt-1 break-all">{selectedFilePath}</div>
            </>
          ) : (
            <div className="text-sm text-text-secondary">尚未选择文件</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleStartTranscribe}
            disabled={!selectedFilePath || !asrAvailable || taskState.status === 'running'}
            className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-text-inverse font-medium transition-colors inline-flex items-center gap-2"
          >
            {taskState.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
            {taskState.status === 'running' ? '转写中...' : '开始转写'}
          </button>

          {outputPath && (
            <button
              onClick={() => window.electronAPI.showItemInFolder(outputPath)}
              className="px-4 py-2.5 rounded-lg bg-surface-tertiary hover:bg-surface-hover border border-border text-text-secondary hover:text-text-primary text-sm transition-colors inline-flex items-center gap-2"
              title="打开转写文件"
            >
              <FileText className="w-4 h-4" />
              打开转写文件
            </button>
          )}
        </div>

        {taskState.status !== 'idle' && (
          <div
            className={`rounded-lg border p-4 text-sm ${
              taskState.status === 'failed'
                ? 'border-red-200 bg-red-50 text-red-700'
                : taskState.status === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-blue-200 bg-blue-50 text-blue-700'
            }`}
          >
            ASR · {taskState.message}
          </div>
        )}
      </div>
    </div>
  )
}
