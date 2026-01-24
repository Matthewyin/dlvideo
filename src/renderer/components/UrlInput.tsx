import React, { useState, useEffect } from 'react'
import { Link, Loader2, Search } from 'lucide-react'
import { useDownloadStore } from '../stores/downloadStore'

export const UrlInput: React.FC = () => {
  const {
    currentUrl, setCurrentUrl, isParsing, setIsParsing,
    setCurrentVideoInfo, setParseError,
    setCurrentPlaylist, setSelectedPlaylistVideos,
    addToQueue, updateTask
  } = useDownloadStore()
  const [inputValue, setInputValue] = useState(currentUrl)
  const [isMultiMode, setIsMultiMode] = useState(false) // 多URL模式

  // 验证YouTube URL
  const isValidYouTubeUrl = (url: string): boolean => {
    const patterns = [
      /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
      /^(https?:\/\/)?youtu\.be\/[\w-]+/,
      /^(https?:\/\/)?(www\.)?youtube\.com\/playlist\?list=[\w-]+/,
    ]
    return patterns.some(pattern => pattern.test(url))
  }

  // 验证B站 URL
  const isValidBilibiliUrl = (url: string): boolean => {
    const patterns = [
      /^(https?:\/\/)?(www\.)?bilibili\.com\/video\/BV[\w]+/i,        // BV号视频
      /^(https?:\/\/)?(www\.)?bilibili\.com\/video\/av\d+/i,          // AV号视频
      /^(https?:\/\/)?b23\.tv\/[\w]+/i,                               // 短链接
      /^(https?:\/\/)?(www\.)?bilibili\.com\/bangumi\/play\/(ss|ep)\d+/i, // 番剧
      /^(https?:\/\/)?(www\.)?bilibili\.com\/medialist\/play\/\d+/i,  // 收藏夹/合集
    ]
    return patterns.some(pattern => pattern.test(url))
  }

  // 验证视频URL（支持多平台）
  const isValidVideoUrl = (url: string): boolean => {
    return isValidYouTubeUrl(url) || isValidBilibiliUrl(url)
  }

  // 解析URL（支持多URL）
  const handleParse = async () => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput) {
      setParseError('请输入YouTube链接')
      return
    }

    // 检测是否为多URL模式（包含换行符或逗号）
    const hasMultipleUrls = trimmedInput.includes('\n') || trimmedInput.includes('，') || trimmedInput.includes(',')

    if (hasMultipleUrls) {
      // 多URL模式
      await handleMultiUrlParse(trimmedInput)
    } else {
      // 单URL模式
      await handleSingleUrlParse(trimmedInput)
    }
  }

  // 单个URL解析
  const handleSingleUrlParse = async (url: string) => {
    if (!isValidVideoUrl(url)) {
      setParseError('请输入有效的视频链接（支持YouTube、B站）')
      return
    }

    setIsParsing(true)
    setParseError(null)
    setCurrentUrl(url)
    setCurrentVideoInfo(null)
    setCurrentPlaylist(null)
    setSelectedPlaylistVideos([])

    try {
      const result = await window.electronAPI.parseVideo(url)

      if (result.success && result.data) {
        if (result.isPlaylist) {
          setCurrentPlaylist(result.data)
          setSelectedPlaylistVideos(result.data.videos?.map((v: any) => v.id) || [])
        } else {
          setCurrentVideoInfo(result.data)
        }
      } else {
        setParseError(result.error || '解析失败，请检查链接是否正确')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '解析失败，请检查链接是否正确'
      setParseError(errorMessage)
    } finally {
      setIsParsing(false)
    }
  }

  // 延迟函数
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  // 多个URL解析
  const handleMultiUrlParse = async (input: string) => {
    // 分割URL（支持换行符和逗号）
    const urls = input
      .split(/[\n,，]/)
      .map(url => url.trim())
      .filter(url => url.length > 0)

    if (urls.length === 0) {
      setParseError('请输入有效的视频链接（支持YouTube、B站）')
      return
    }

    // 验证所有URL
    const invalidUrls = urls.filter(url => !isValidVideoUrl(url))
    if (invalidUrls.length > 0) {
      setParseError(`以下链接无效：${invalidUrls.slice(0, 3).join(', ')}${invalidUrls.length > 3 ? '...' : ''}`)
      return
    }

    setIsParsing(true)
    setParseError(null)
    setCurrentVideoInfo(null)
    setCurrentPlaylist(null)
    setSelectedPlaylistVideos([])

    let successCount = 0
    let failedUrls: string[] = []

    // 逐个解析URL，添加延迟避免触发 YouTube 限流
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]

      // 从第二个URL开始，每次请求前等待 1.5 秒
      if (i > 0) {
        await delay(1500)
      }

      try {
        const result = await window.electronAPI.parseVideo(url)

        if (result.success && result.data) {
          if (!result.isPlaylist) {
            // 单个视频，添加到队列
            const videoInfo = result.data
            const taskId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

            addToQueue({
              id: taskId,
              title: videoInfo.title,
              url: url,
              status: 'pending',
              progress: 0,
              speed: '',
              eta: '',
              formatId: videoInfo.formats?.[0]?.format_id,
              audioOnly: false,
              subtitles: false,
              subtitleLang: 'en',
              convertFormat: undefined,
              createdAt: new Date().toISOString(),
            })

            successCount++
          }
        } else {
          failedUrls.push(url)
        }
      } catch (error) {
        failedUrls.push(url)
      }
    }

    setIsParsing(false)

    if (successCount > 0) {
      setParseError(null)
      if (failedUrls.length > 0) {
        setParseError(`成功添加 ${successCount} 个视频，${failedUrls.length} 个失败`)
      } else {
        setParseError(null)
      }
    } else {
      setParseError('所有链接解析失败，请检查链接是否正确')
    }

    // 清空输入框
    setInputValue('')
  }

  // 监听粘贴事件
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text')
      if (text) {
        // 检查是否为有效的视频URL
        const urls = text.split(/[\n,，]/).map(u => u.trim()).filter(u => u.length > 0)
        const hasValidUrl = urls.some(url => isValidVideoUrl(url))

        if (hasValidUrl) {
          e.preventDefault()
          // 追加到现有内容，而不是替换
          setInputValue(prev => {
            const newValue = prev.trim() ? prev + '\n' + text : text
            return newValue
          })
        }
      }
    }

    // 使用 capture 阶段监听，确保能拦截粘贴事件
    document.addEventListener('paste', handlePaste, true)
    return () => document.removeEventListener('paste', handlePaste, true)
  }, [])

  // 回车键处理：Cmd+Enter 或 Ctrl+Enter 触发解析，单独 Enter 换行
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isParsing) {
      // Cmd+Enter (Mac) 或 Ctrl+Enter (Windows/Linux) 触发解析
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()
        handleParse()
      }
      // 单独 Enter 允许换行（textarea 默认行为）
    }
  }

  return (
    <div className="w-full">
      <div className="relative flex items-center gap-3">
        <div className="relative flex-1">
          <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="粘贴视频链接（支持YouTube、B站，多个用换行符或逗号分隔）..."
            className="w-full pl-12 pr-4 py-4 bg-surface-secondary border border-border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-soft transition-all resize-none"
            rows={inputValue.includes('\n') ? Math.min(inputValue.split('\n').length + 1, 5) : 1}
            disabled={isParsing}
          />
        </div>
        <button
          onClick={handleParse}
          disabled={isParsing || !inputValue.trim()}
          className="px-6 py-4 bg-primary hover:bg-primary-hover text-text-inverse disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium shadow-soft transition-all btn-press flex items-center gap-2 whitespace-nowrap"
          title="点击解析或按 Cmd+Enter"
        >
          {isParsing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              解析中
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              解析
            </>
          )}
        </button>
      </div>
    </div>
  )
}

