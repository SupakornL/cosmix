/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#04060D',
          900: '#080C14',
          800: '#0D1322',
          700: '#121A2E',
          600: '#1A2540',
        },
        nebula: {
          purple: '#7C3AED',
          'purple-light': '#A78BFA',
          blue: '#3B82F6',
          teal: '#14B8A6',
        },
        star: {
          white: '#F8FAFC',
          dim: '#94A3B8',
          muted: '#475569',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      backgroundImage: {
        'cosmos': 'radial-gradient(ellipse at top, #1A2540 0%, #080C14 60%)',
      },
    },
  },
  plugins: [],
}
