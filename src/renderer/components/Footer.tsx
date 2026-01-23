import React from 'react'
import { Github, Heart } from 'lucide-react'

export const Footer: React.FC = () => {
  return (
    <footer className="px-6 py-3 bg-surface-secondary border-t border-border">
      <div className="flex items-center justify-between text-xs text-text-tertiary">
        <div className="flex items-center gap-4">
          <span>DLYouTube v1.0.0</span>
          <span className="flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-primary" />
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-text-tertiary">
            仅供个人学习使用，请遵守相关法律法规
          </span>
          <a
            href="#"
            className="flex items-center gap-1 hover:text-text-primary transition-colors"
            title="GitHub"
          >
            <Github className="w-4 h-4" />
          </a>
        </div>
      </div>
    </footer>
  )
}

