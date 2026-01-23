import React, { useState } from 'react'
import { Clock, User, ListVideo, Download, CheckSquare, Square, Music } from 'lucide-react'
import { useDownloadStore, VideoInfo, DownloadTask } from '../stores/downloadStore'

export const PlaylistPreview: React.FC = () => {
  const {
    currentPlaylist,
    selectedPlaylistVideos,
    togglePlaylistVideo,
    selectAllPlaylistVideos,
    deselectAllPlaylistVideos,
    addBatchToQueue,
    updateTask,
    settings,
  } = useDownloadStore()

  const [audioOnly, setAudioOnly] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  if (!currentPlaylist) return null

  const { title, channel, thumbnail, videoCount, videos } = currentPlaylist
  const selectedCount = selectedPlaylistVideos.length
  const allSelected = selectedCount === videoCount

  // 批量下载选中的视频
  const handleBatchDownload = async () => {
    if (selectedCount === 0) return
    setIsDownloading(true)

    const selectedVideos = videos.filter(v => selectedPlaylistVideos.includes(v.id))
    const tasks: DownloadTask[] = []

    for (const video of selectedVideos) {
      const taskId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const safeFilename = video.title
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .substring(0, 100)

      const task: DownloadTask = {
        id: taskId,
        videoInfo: video,
        selectedFormat: {
          formatId: 'best',
          ext: audioOnly ? 'mp3' : 'mp4',
          resolution: audioOnly ? 'Audio' : '1080p',
          filesize: null,
          quality: 'best',
          hasAudio: true,
          hasVideo: !audioOnly,
        },
        status: 'pending',
        progress: 0,
        speed: '0 B/s',
        eta: '等待中...',
        createdAt: new Date(),
      }
      tasks.push(task)

      // 启动下载
      try {
        const downloadOptions = {
          url: video.url,
          outputPath: settings.downloadPath,
          filename: safeFilename,
          audioOnly,
          proxyUrl: settings.proxyEnabled ? settings.proxyUrl : undefined,
        }

        window.electronAPI.startDownload(taskId, downloadOptions).then(result => {
          if (!result.success) {
            updateTask(taskId, { status: 'failed', error: result.error || '启动下载失败' })
          }
        })
      } catch (error) {
        console.error('启动下载失败:', error)
      }
    }

    addBatchToQueue(tasks)
    setIsDownloading(false)
  }

  // 格式化时长
  const formatDuration = (seconds: number): string => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-surface-secondary rounded-xl p-6 border border-border shadow-soft">
      {/* 播放列表信息头部 */}
      <div className="flex gap-6 mb-6">
        <div className="relative flex-shrink-0 w-48 h-28 rounded-lg overflow-hidden bg-surface-tertiary">
          <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
          <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-0.5 rounded text-xs flex items-center gap-1">
            <ListVideo className="w-3 h-3" />
            {videoCount} 个视频
          </div>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
          <p className="text-sm text-text-secondary flex items-center gap-1.5">
            <User className="w-4 h-4" /> {channel}
          </p>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <div className="flex items-center gap-4">
          <button
            onClick={allSelected ? deselectAllPlaylistVideos : selectAllPlaylistVideos}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
            {allSelected ? '取消全选' : '全选'}
          </button>
          <span className="text-sm text-text-tertiary">已选择 {selectedCount}/{videoCount}</span>
          <label className="flex items-center gap-2 cursor-pointer ml-4">
            <input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-surface-tertiary text-primary" />
            <Music className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-secondary">仅音频</span>
          </label>
        </div>
        <button
          onClick={handleBatchDownload}
          disabled={selectedCount === 0 || isDownloading}
          className="px-5 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-text-inverse rounded-lg font-medium transition-all flex items-center gap-2 shadow-soft"
        >
          <Download className="w-4 h-4" />
          下载选中 ({selectedCount})
        </button>
      </div>

      {/* 视频列表 */}
      <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
        {videos.map((video, index) => (
          <VideoItem
            key={video.id}
            video={video}
            index={index + 1}
            selected={selectedPlaylistVideos.includes(video.id)}
            onToggle={() => togglePlaylistVideo(video.id)}
            formatDuration={formatDuration}
          />
        ))}
      </div>
    </div>
  )
}

// 单个视频项组件
interface VideoItemProps {
  video: VideoInfo
  index: number
  selected: boolean
  onToggle: () => void
  formatDuration: (seconds: number) => string
}

const VideoItem: React.FC<VideoItemProps> = ({ video, index, selected, onToggle, formatDuration }) => {
  return (
    <div
      onClick={onToggle}
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        selected ? 'bg-primary-light border border-primary/30' : 'bg-surface-tertiary hover:bg-surface-hover border border-transparent'
      }`}
    >
      <div className="flex-shrink-0 w-6 text-center text-sm text-text-tertiary">
        {selected ? <CheckSquare className="w-5 h-5 text-primary mx-auto" /> : <span>{index}</span>}
      </div>
      <div className="w-20 h-12 rounded overflow-hidden bg-surface flex-shrink-0">
        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary truncate">{video.title}</p>
        <p className="text-xs text-text-tertiary">{video.channel}</p>
      </div>
      <div className="text-xs text-text-tertiary flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {formatDuration(video.duration)}
      </div>
    </div>
  )
}

