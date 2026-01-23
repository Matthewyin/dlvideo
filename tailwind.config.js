/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
    "./src/renderer/index.html",
  ],
  theme: {
    extend: {
      colors: {
        // 主色调 - YouTube 红
        primary: {
          DEFAULT: '#FF0000',
          hover: '#CC0000',
          light: '#FFE5E5',
        },
        // 亮色主题背景
        surface: {
          DEFAULT: '#F5F7FA',   // 主背景 - 柔和灰白
          secondary: '#FFFFFF', // 卡片背景
          tertiary: '#EEF2F6',  // 次级区域
          hover: '#E8ECF1',     // 悬停背景
        },
        // 文字颜色
        text: {
          primary: '#1A202C',   // 主文字 - 深灰
          secondary: '#64748B', // 次级文字
          tertiary: '#94A3B8',  // 辅助文字
          inverse: '#FFFFFF',   // 反色文字
        },
        // 边框颜色
        border: {
          DEFAULT: '#E2E8F0',
          hover: '#CBD5E1',
          focus: '#FF0000',
        },
        // 功能色
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0, 0, 0, 0.06)',
        'card': '0 4px 12px rgba(0, 0, 0, 0.08)',
        'elevated': '0 8px 24px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
}

