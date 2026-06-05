// Cosmix Design Tokens — Space theme
export const colors = {
  bg: {
    primary: '#080C14',
    secondary: '#0D1322',
    card: '#121A2E',
    overlay: 'rgba(8,12,20,0.85)',
  },
  border: {
    subtle: 'rgba(139,92,246,0.12)',
    default: 'rgba(139,92,246,0.25)',
    strong: 'rgba(139,92,246,0.5)',
  },
  text: {
    primary: '#F8FAFC',
    secondary: '#94A3B8',
    muted: '#475569',
    accent: '#A78BFA',
  },
  brand: {
    purple: '#7C3AED',
    purpleLight: '#A78BFA',
    blue: '#60A5FA',
    teal: '#34D399',
  },
  status: {
    trial: '#F59E0B',
    pro: '#A78BFA',
    admin: '#34D399',
    expired: '#EF4444',
  },
}

export const AI_MODES = [
  {
    id: 'auto_cut',
    label: 'Auto Cut',
    description: 'AI detects and removes silent/filler segments automatically',
    icon: '✂',
  },
  {
    id: 'subtitle_only',
    label: 'Subtitle',
    description: 'Transcribe speech and generate subtitles in chosen language',
    icon: '⌨',
  },
  {
    id: 'suggest_edits',
    label: 'Suggest Edits',
    description: 'AI analyzes content and recommends where to cut or keep',
    icon: '✦',
  },
  {
    id: 'chat_edit',
    label: 'Chat to Edit',
    description: 'Describe your edits in natural language — AI handles the rest',
    icon: '💬',
  },
]

export const SUBTITLE_LANGUAGES = [
  { code: 'auto', label: 'Auto detect' },
  { code: 'th', label: 'Thai / ภาษาไทย' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese / 日本語' },
  { code: 'zh', label: 'Chinese / 中文' },
  { code: 'ko', label: 'Korean / 한국어' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi / हिंदी' },
  { code: 'ru', label: 'Russian' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'id', label: 'Indonesian' },
]
