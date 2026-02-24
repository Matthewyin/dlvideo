import React from 'react'
import { UrlInput } from '../components/UrlInput'
import { VideoPreview } from '../components/VideoPreview'
import { PlaylistPreview } from '../components/PlaylistPreview'
import { DownloadQueue } from '../components/DownloadQueue'
import { useDownloadStore } from '../stores/downloadStore'

export const HomePage: React.FC = () => {
  const currentVideoInfo = useDownloadStore((state) => state.currentVideoInfo)
  const currentPlaylist = useDownloadStore((state) => state.currentPlaylist)
  const parseError = useDownloadStore((state) => state.parseError)
  const isParsing = useDownloadStore((state) => state.isParsing)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* URL 输入 */}
      <UrlInput />

      {/* 解析错误提示 */}
      {parseError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-error text-sm selectable-text">
          {parseError}
        </div>
      )}

      {/* 视频预览或播放列表预览 */}
      <div className="mt-6">
        {currentPlaylist ? (
          <PlaylistPreview />
        ) : currentVideoInfo ? (
          <VideoPreview />
          ) : !isParsing && (
          <div className="bg-surface-secondary rounded-xl p-12 border border-border text-center shadow-soft">
            <p className="text-text-secondary">粘贴视频链接开始下载</p>
            <p className="text-text-tertiary text-sm mt-2">支持单视频和播放列表</p>
          </div>
        )}
      </div>

      {/* 下载队列 */}
      <DownloadQueue />
    </div>
  )
}
