import React, { useState, useEffect } from 'react'
import { Clock, User, Eye, Calendar, Download, Music, Subtitles, RefreshCw } from 'lucide-react'
import { useDownloadStore, VideoFormat, DownloadTask } from '../stores/downloadStore'

// 常用字幕语言
const SUBTITLE_LANGUAGES = [
  { code: 'zh-Hans', name: '简体中文' },
  { code: 'zh-Hant', name: '繁体中文' },
  { code: 'en', name: '英语' },
  { code: 'ja', name: '日语' },
  { code: 'ko', name: '韩语' },
  { code: 'es', name: '西班牙语' },
  { code: 'fr', name: '法语' },
  { code: 'de', name: '德语' },
]

// 视频转换格式
const VIDEO_CONVERT_FORMATS = [
  { code: '', name: '不转换' },
  { code: 'mp4', name: 'MP4' },
  { code: 'mkv', name: 'MKV' },
  { code: 'webm', name: 'WebM' },
  { code: 'avi', name: 'AVI' },
  { code: 'mov', name: 'MOV' },
]

export const VideoPreview: React.FC = () => {
  const { currentVideoInfo, addToQueue, parseError, settings, updateTask } = useDownloadStore()
  const [selectedFormat, setSelectedFormat] = useState<string>('mp4')
  const [selectedResolution, setSelectedResolution] = useState<string>('')
  const [audioOnly, setAudioOnly] = useState(false)
  const [downloadSubtitles, setDownloadSubtitles] = useState(false)
  const [subtitleLang, setSubtitleLang] = useState('zh-Hans')
  const [convertFormat, setConvertFormat] = useState<string>('')

  // 当视频信息更新时，自动选择最佳分辨率
  useEffect(() => {
    if (currentVideoInfo?.formats) {
      const videoFormats = currentVideoInfo.formats.filter(f => f.hasVideo)
      if (videoFormats.length > 0) {
        // 选择最高分辨率
        const bestFormat = videoFormats[0]
        setSelectedResolution(bestFormat.resolution)
      }
    }
  }, [currentVideoInfo])

  if (parseError) {
    return (
      <div className="bg-dark-700 rounded-xl p-6 border border-error/30">
        <div className="flex items-center gap-3 text-error">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-medium">解析失败</p>
            <p className="text-sm text-gray-400">{parseError}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!currentVideoInfo) {
    return (
      <div className="bg-dark-700 rounded-xl p-12 border border-dark-500 border-dashed">
        <div className="text-center text-gray-500">
          <Download className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">粘贴YouTube链接开始下载</p>
          <p className="text-sm mt-2">支持视频、短视频、播放列表</p>
        </div>
      </div>
    )
  }

  const { title, thumbnail, durationFormatted, channel, viewCount, uploadDate, formats, url } = currentVideoInfo

  // 获取可用分辨率
  const resolutions = [...new Set(formats.filter(f => f.hasVideo).map(f => f.resolution))]
  const audioFormats = formats.filter(f => f.hasAudio && !f.hasVideo)

  // 格式化观看次数
  const formatViewCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
    return count.toString()
  }

  // 开始下载
  const handleDownload = async () => {
    const format = audioOnly
      ? audioFormats[0]
      : formats.find(f => f.resolution === selectedResolution) || formats[0]

    if (!format) {
      console.error('未找到合适的格式')
      return
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // 生成安全的文件名
    const safeFilename = title
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100)

    const task: DownloadTask = {
      id: taskId,
      videoInfo: currentVideoInfo,
      selectedFormat: format,
      status: 'pending',
      progress: 0,
      speed: '0 B/s',
      eta: '计算中...',
      createdAt: new Date(),
    }

    addToQueue(task)

    // 调用主进程开始下载
    try {
      const downloadOptions = {
        url: url,
        outputPath: settings.downloadPath,
        filename: safeFilename,
        formatId: format.formatId,
        audioOnly: audioOnly,
        subtitles: downloadSubtitles,
        subtitleLang: downloadSubtitles ? subtitleLang : undefined,
        proxyUrl: settings.proxyEnabled ? settings.proxyUrl : undefined,
        convertFormat: convertFormat || undefined,
      }

      const result = await window.electronAPI.startDownload(taskId, downloadOptions)

      if (!result.success) {
        updateTask(taskId, {
          status: 'failed',
          error: result.error || '启动下载失败'
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '启动下载失败'
      updateTask(taskId, { status: 'failed', error: errorMessage })
    }
  }

  // 格式化文件大小
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '未知'
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const currentFormat = formats.find(f => f.resolution === selectedResolution)

  return (
    <div className="bg-surface-secondary rounded-xl p-6 border border-border shadow-card">
      <div className="flex gap-6">
        {/* 缩略图 */}
        <div className="relative flex-shrink-0 w-64 h-36 rounded-lg overflow-hidden bg-surface-tertiary">
          <img src={thumbnail} alt={title} className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect fill="%23E2E8F0" width="16" height="9"/></svg>' }}
          />
          <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-0.5 rounded text-sm font-mono">
            {durationFormatted}
          </div>
        </div>

        {/* 视频信息 */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-text-primary truncate mb-3">{title}</h3>
          <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4" /> {channel}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> {durationFormatted}
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="w-4 h-4" /> {formatViewCount(viewCount)} 次观看
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> {uploadDate}
            </span>
          </div>
        </div>
      </div>

      {/* 下载配置 */}
      <div className="mt-6 pt-6 border-t border-border">
        <div className="flex items-center gap-4 flex-wrap">
          {/* 格式选择 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">格式</span>
            <select value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value)}
              disabled={audioOnly} className="bg-surface-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-50">
              <option value="mp4">MP4</option>
              <option value="mkv">MKV</option>
              <option value="webm">WebM</option>
            </select>
          </div>

          {/* 分辨率选择 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">分辨率</span>
            <select value={selectedResolution} onChange={(e) => setSelectedResolution(e.target.value)}
              disabled={audioOnly} className="bg-surface-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-50">
              {resolutions.map(res => (
                <option key={res} value={res}>{res}</option>
              ))}
            </select>
          </div>

          {/* 仅音频 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-surface-tertiary text-primary focus:ring-primary focus:ring-offset-0" />
            <Music className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-secondary">仅下载音频</span>
          </label>
        </div>

        {/* 字幕和格式转换选项 */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={downloadSubtitles} onChange={(e) => setDownloadSubtitles(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-surface-tertiary text-primary focus:ring-primary focus:ring-offset-0" />
            <Subtitles className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-secondary">下载字幕</span>
          </label>

          {downloadSubtitles && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">语言</span>
              <select value={subtitleLang} onChange={(e) => setSubtitleLang(e.target.value)}
                className="bg-surface-tertiary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary">
                {SUBTITLE_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 格式转换 */}
          {!audioOnly && (
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-text-secondary" />
              <span className="text-sm text-text-secondary">转换为</span>
              <select value={convertFormat} onChange={(e) => setConvertFormat(e.target.value)}
                className="bg-surface-tertiary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary">
                {VIDEO_CONVERT_FORMATS.map(fmt => (
                  <option key={fmt.code} value={fmt.code}>{fmt.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 预估大小 */}
          <span className="text-sm text-text-tertiary ml-auto">
            预估大小: {formatFileSize(currentFormat?.filesize)}
          </span>

          {/* 下载按钮 */}
          <button onClick={handleDownload}
            className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-text-inverse rounded-lg font-medium shadow-soft transition-all btn-press flex items-center gap-2">
            <Download className="w-5 h-5" />
            开始下载
          </button>
        </div>
      </div>
    </div>
  )
}

