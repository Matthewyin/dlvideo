import React from 'react'
import { ExternalLink } from 'lucide-react'

export const Footer: React.FC = () => {
  return (
    <footer className="px-6 py-3 bg-surface-secondary border-t border-border">
      <div className="flex items-center justify-between text-xs text-text-tertiary">
        <div className="flex items-center gap-4">
          <span>DLVideo v2.0.0</span>
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
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </footer>
  )
}
