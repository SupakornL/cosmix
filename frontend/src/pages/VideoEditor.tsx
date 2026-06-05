import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

// ─── Types ───────────────────────────────────────────────────
interface Segment { id: number; start: number; end: number; text: string }
interface WordStamp { word: string; start: number; end: number }
interface TextLayer { id: number; text: string; x: number; y: number; fontSize: number; color: string; bold: boolean; start: number; end: number; always: boolean }

interface SubStyle {
  fontFamily: string; fontSize: number; color: string
  highlightColor: string; bgColor: string; bgOpacity: number
  position: 'top' | 'middle' | 'bottom'
  bold: boolean; italic: boolean; outline: boolean
  displayMode: string; showPrev: boolean; allCaps: boolean
  boxStyle: 'none' | 'solid' | 'rounded_solid' | 'pill'
  boxColor: string; shadow: boolean
  posX: number; posY: number  // custom position (%), -1 = use preset
  maxCharsPerLine: number     // auto-split threshold
}

// ─── TikTok Display Modes ─────────────────────────────────────
const DISPLAY_MODES = [
  { id: 'normal',        label: 'Normal',           desc: 'ขึ้นทั้งประโยค',                  icon: '▬' },
  { id: 'word_single',   label: 'Word (Single)',     desc: 'ทีละคำ — คำเดียว',               icon: '◉' },
  { id: 'word_trail',    label: 'Word (Trail)',      desc: 'ทีละคำ — เห็นคำก่อนหน้าด้วย',   icon: '◎' },
  { id: 'word_pop',      label: 'Word Pop',          desc: 'คำ scale up ตอนพูด (TikTok)',    icon: '✦' },
  { id: 'karaoke',       label: 'Karaoke',           desc: 'Highlight ทีละคำในประโยค',       icon: '🎤' },
  { id: 'karaoke_color', label: 'Karaoke Color',     desc: 'เปลี่ยนสีทีละคำ',                icon: '🌈' },
  { id: 'typewriter',    label: 'Typewriter',        desc: 'พิมพ์ทีละตัวอักษร',              icon: '⌨' },
  { id: 'fade',          label: 'Fade In/Out',       desc: 'ค่อยๆ ปรากฏ/หาย',               icon: '◌' },
  { id: 'slide_up',      label: 'Slide Up',          desc: 'เลื่อนขึ้นจากล่าง',              icon: '↑' },
  { id: 'bounce',        label: 'Bounce In',         desc: 'เด้งเข้ามา',                     icon: '⬦' },
  { id: 'scale_pop',     label: 'Scale Pop',         desc: 'คำที่พูดใหญ่ขึ้น คำอื่นเล็กลง',  icon: '◎' },
  { id: 'scale_pop_bold',label: 'Scale Pop Bold',    desc: 'Scale Pop + ตัวหนาเมื่อพูด',      icon: '❋' },
]

const FONTS = [
  'Sarabun',        // สะอาด อ่านง่าย
  'Kanit',          // Modern ดูดี
  'Prompt',         // กลม น่ารัก
  'Mitr',           // เป็นมิตร น่ารัก
  'Chakra Petch',   // Tech / Gaming
  'Bai Jamjuree',   // Clean Modern
  'Noto Sans Thai', // Standard
  'Pridi',          // Serif ดูมีสไตล์
  'Arial',
  'Inter',
  'Impact',
]
const COLORS = ['#FFFFFF', '#FFFF00', '#FFD700', '#FF6B6B', '#60A5FA', '#F472B6', '#34D399', '#000000', '#FF4500', '#00FFFF']
const BOX_COLORS = ['#000000', '#7C3AED', '#EF4444', '#F59E0B', '#059669', '#3B82F6', '#EC4899']

const DEFAULT_STYLE: SubStyle = {
  fontFamily: 'Sarabun', fontSize: 26, color: '#FFFFFF', highlightColor: '#FFFF00',
  bgColor: '#000000', bgOpacity: 0.6, position: 'bottom',
  bold: true, italic: false, outline: true, displayMode: 'word_pop',
  showPrev: false, allCaps: false, boxStyle: 'none', boxColor: '#000000', shadow: true,
  posX: 50, posY: -1, maxCharsPerLine: 20,
}

// ─── SRT Parser ──────────────────────────────────────────────
function parseSRT(srt: string): Segment[] {
  return srt.trim().split(/\n\n+/).map(block => {
    const lines = block.trim().split('\n')
    const t = lines[1]?.match(/(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)/)
    if (!t) return null
    return {
      id: parseInt(lines[0]),
      start: +t[1]*3600 + +t[2]*60 + +t[3] + +t[4]/1000,
      end: +t[5]*3600 + +t[6]*60 + +t[7] + +t[8]/1000,
      text: lines.slice(2).join('\n'),
    }
  }).filter(Boolean) as Segment[]
}

function fmtTime(s: number) {
  const m = Math.floor(s/60), sec = Math.floor(s%60), ms = Math.floor((s%1)*10)
  return `${m}:${sec.toString().padStart(2,'0')}.${ms}`
}
function fmtSRT(s: number) {
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60),ms=Math.round((s%1)*1000)
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')},${ms.toString().padStart(3,'0')}`
}

// ─── Word deriver — splits text and distributes timing ───────
function deriveWords(seg: Segment, apiWords?: WordStamp[]): WordStamp[] {
  const text = seg.text.trim()
  if (!text) return []
  const dur = seg.end - seg.start
  if (dur <= 0) return []

  // Use API words if available for this segment (most accurate)
  if (apiWords && apiWords.length > 0) {
    const segApiWords = apiWords.filter(w => w.start >= seg.start - 0.15 && w.end <= seg.end + 0.15)
    if (segApiWords.length > 0) return segApiWords
  }

  // Fallback: split by space (works for English, less accurate for Thai)
  const tokens = text.split(/\s+/).filter(t => t.trim())
  if (!tokens.length) return [{ word: text, start: seg.start, end: seg.end }]

  const lengths = tokens.map(t => Math.max(1, t.length))
  const total = lengths.reduce((a, b) => a + b, 0)
  let pos = seg.start
  return tokens.map((w, i) => {
    const d = dur * (lengths[i] / total)
    const item = { word: w, start: parseFloat(pos.toFixed(3)), end: parseFloat((pos + d).toFixed(3)) }
    pos += d
    return item
  })
}

// ─── Subtitle Renderer ───────────────────────────────────────
function splitLongText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const mid = Math.floor(text.length / 2)
  let splitAt = -1
  for (let i = 0; i <= 15; i++) {
    if (mid + i < text.length && text[mid + i] === ' ') { splitAt = mid + i; break }
    if (mid - i >= 0 && text[mid - i] === ' ') { splitAt = mid - i; break }
  }
  if (splitAt === -1) splitAt = mid
  return text.slice(0, splitAt) + '\n' + text.slice(splitAt + 1)
}

function SubtitleRenderer({ seg, words, currentTime, style, onPositionChange, onDragStart, onDragEnd }: {
  seg: Segment | null; words: WordStamp[]; currentTime: number; style: SubStyle
  onPositionChange?: (x: number, y: number) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  if (!seg) return null

  const presetPos = { top: '8%', middle: '50%', bottom: '85%' }[style.position]
  const useCustomPos = style.posY !== -1
  const topPos = useCustomPos ? style.posY + '%' : presetPos
  const leftPos = useCustomPos ? style.posX + '%' : '50%'
  const pos = topPos
  const progress = Math.max(0, Math.min(1, (currentTime - seg.start) / (seg.end - seg.start)))
  const text = style.allCaps ? seg.text.toUpperCase() : seg.text

  // Use API words when available, fallback to derived
  const segWords: WordStamp[] = deriveWords(seg, words)

  // Apply auto-split to text
  const displayText = style.maxCharsPerLine > 0
    ? splitLongText(style.allCaps ? seg.text.toUpperCase() : seg.text, style.maxCharsPerLine)
    : (style.allCaps ? seg.text.toUpperCase() : seg.text)

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onPositionChange) return
    e.preventDefault()
    e.stopPropagation()
    // Find the video container by traversing up
    let el: HTMLElement | null = e.currentTarget as HTMLElement
    while (el && !el.dataset.videoWrap) el = el.parentElement
    if (!el) {
      // fallback: use closest video element's parent
      const video = document.querySelector('video')
      el = video?.parentElement as HTMLElement || null
    }
    if (!el) return
    const rect = el.getBoundingClientRect()
    const onMove = (me: MouseEvent) => {
      const x = Math.max(5, Math.min(95, ((me.clientX - rect.left) / rect.width) * 100))
      const y = Math.max(3, Math.min(95, ((me.clientY - rect.top) / rect.height) * 100))
      onPositionChange(x, y)
    }
    onDragStart?.()
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      onDragEnd?.()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const baseWrap: React.CSSProperties = {
    position: 'absolute', left: leftPos, top: pos,
    transform: 'translate(-50%, -50%)',
    cursor: onPositionChange ? 'grab' : 'default',
    textAlign: 'center', maxWidth: '82%', width: '82%', wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const, whiteSpace: 'pre-wrap' as const,
    pointerEvents: 'none', zIndex: 10,
    fontFamily: style.fontFamily,
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textShadow: style.shadow ? '2px 2px 4px rgba(0,0,0,0.9), -1px -1px 3px rgba(0,0,0,0.8)' : 'none',
  }

  const wordStyle = (isActive: boolean, isDone: boolean): React.CSSProperties => ({
    display: 'inline-block',
    color: style.boxStyle !== 'none' && isActive ? '#000' : (isActive ? style.highlightColor : isDone ? `${style.color}99` : style.color),
    fontSize: style.fontSize,
    padding: style.boxStyle !== 'none' ? '2px 8px' : '0 3px',
    marginRight: 4,
    background: style.boxStyle !== 'none' ? (isActive ? style.highlightColor : `${style.boxColor}CC`) : 'transparent',
    borderRadius: style.boxStyle === 'pill' ? 20 : style.boxStyle === 'rounded_solid' ? 6 : 2,
    transition: 'transform 0.08s ease, color 0.08s',
    lineHeight: 1.4,
  } as React.CSSProperties)

  // WORD_SINGLE — แสดงทีละคำเดียว
  if (style.displayMode === 'word_single') {
    const active = segWords.find(w => currentTime >= w.start && currentTime <= w.end) || segWords[0]
    if (!active) return null
    const wd = style.allCaps ? active.word.toUpperCase() : active.word
    return (
      <div style={baseWrap}>
        <span style={{ fontSize: style.fontSize * 1.2, color: style.highlightColor, fontWeight: 'bold',
          background: style.boxStyle !== 'none' ? `${style.boxColor}DD` : 'transparent',
          padding: style.boxStyle !== 'none' ? '4px 16px' : undefined,
          borderRadius: style.boxStyle === 'pill' ? 30 : style.boxStyle !== 'none' ? 8 : 0,
          display: 'inline-block' }}>
          {wd}
        </span>
      </div>
    )
  }

  // WORD_TRAIL — ทีละคำ + คำก่อนหน้า
  if (style.displayMode === 'word_trail') {
    const activeIdx = segWords.findIndex(w => currentTime >= w.start && currentTime <= w.end)
    const showFrom = Math.max(0, activeIdx - 2)
    const visible = segWords.slice(showFrom, activeIdx + 1)
    return (
      <div style={baseWrap}>
        {visible.map((w, i) => {
          const isActive = i === visible.length - 1
          const wd = style.allCaps ? w.word.toUpperCase() : w.word
          return <span key={i} style={{ ...wordStyle(isActive, false), opacity: isActive ? 1 : 0.4 + i*0.2 }}>{wd}</span>
        })}
      </div>
    )
  }

  // WORD_POP — TikTok style scale up
  if (style.displayMode === 'word_pop') {
    return (
      <div style={baseWrap}>
        {segWords.map((w, i) => {
          const isActive = currentTime >= w.start && currentTime <= w.end
          const isDone = currentTime > w.end
          const wd = style.allCaps ? w.word.toUpperCase() : w.word
          const scale = isActive ? 1.25 : 1
          return (
            <span key={i} style={{
              ...wordStyle(isActive, isDone),
              transform: `scale(${scale})`,
              display: 'inline-block',
              transition: 'transform 0.08s cubic-bezier(0.34,1.56,0.64,1), color 0.08s',
            }}>{wd}</span>
          )
        })}
      </div>
    )
  }

  // KARAOKE — highlight ทีละคำ ไม่เปลี่ยนสี
  if (style.displayMode === 'karaoke') {
    return (
      <div style={baseWrap}>
        {segWords.map((w, i) => {
          const isActive = currentTime >= w.start && currentTime <= w.end
          const isDone = currentTime > w.end
          const wd = style.allCaps ? w.word.toUpperCase() : w.word
          return (
            <span key={i} style={{
              ...wordStyle(isActive, isDone),
              textShadow: isActive ? `0 0 12px ${style.highlightColor}, 0 0 4px ${style.highlightColor}` : 'inherit',
            }}>{wd}</span>
          )
        })}
      </div>
    )
  }

  // KARAOKE_COLOR — สีเปลี่ยนตาม progress ใช้ gradient
  if (style.displayMode === 'karaoke_color') {
    if (segWords.length === 0) return null
    const activeIdx = segWords.findIndex(w => currentTime >= w.start && currentTime <= w.end)
    const pct = activeIdx >= 0 ? (activeIdx / segWords.length) * 100 : (currentTime > seg.end ? 100 : 0)
    return (
      <div style={baseWrap}>
        <span style={{
          fontSize: style.fontSize,
          background: `linear-gradient(90deg, ${style.highlightColor} ${pct}%, ${style.color} ${pct}%)`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          fontWeight: 'bold',
        }}>
          {style.allCaps ? seg.text.toUpperCase() : seg.text}
        </span>
      </div>
    )
  }

  // TYPEWRITER
  if (style.displayMode === 'typewriter') {
    const chars = Math.floor(progress * text.length)
    return (
      <div style={baseWrap}>
        <span style={{ fontSize: style.fontSize, color: style.color,
          background: style.bgOpacity > 0 ? `${style.bgColor}${Math.round(style.bgOpacity*255).toString(16).padStart(2,'0')}` : 'transparent',
          padding: '4px 12px', borderRadius: 4 }}>
          {text.slice(0, chars)}<span style={{ opacity: Math.floor(Date.now()/400) % 2 === 0 ? 1 : 0 }}>|</span>
        </span>
      </div>
    )
  }

  // FADE
  if (style.displayMode === 'fade') {
    const opacity = Math.min(1, progress * 6) * (progress > 0.85 ? Math.max(0, (1-progress)*7) : 1)
    return (
      <div style={{ ...baseWrap, opacity }}>
        <span style={{ fontSize: style.fontSize, color: style.color,
          background: style.bgOpacity > 0 ? `${style.bgColor}${Math.round(style.bgOpacity*255).toString(16).padStart(2,'0')}` : 'transparent',
          padding: '4px 12px', borderRadius: 4 }}>{text}</span>
      </div>
    )
  }

  // SLIDE_UP
  if (style.displayMode === 'slide_up') {
    const t = Math.min(1, progress * 8)
    return (
      <div style={{ ...baseWrap, transform: `translateX(-50%) translateY(${(1-t)*20}px)`, opacity: t }}>
        <span style={{ fontSize: style.fontSize, color: style.color,
          background: style.bgOpacity > 0 ? `${style.bgColor}${Math.round(style.bgOpacity*255).toString(16).padStart(2,'0')}` : 'transparent',
          padding: '4px 12px', borderRadius: 4 }}>{text}</span>
      </div>
    )
  }

  // BOUNCE
  if (style.displayMode === 'bounce') {
    const t = Math.min(1, progress * 6)
    const scale = t < 0.5 ? 1 + (1-t)*0.3 : 1 + Math.sin(t*Math.PI*3)*0.05
    return (
      <div style={{ ...baseWrap, transform: `translateX(-50%) scale(${scale})`, opacity: Math.min(1, t*3) }}>
        <span style={{ fontSize: style.fontSize, color: style.color,
          background: style.bgOpacity > 0 ? `${style.bgColor}${Math.round(style.bgOpacity*255).toString(16).padStart(2,'0')}` : 'transparent',
          padding: '4px 12px', borderRadius: 4 }}>{text}</span>
      </div>
    )
  }

  // SCALE POP — คำที่พูดอยู่ใหญ่ขึ้น คำอื่นเล็กลง
  if (style.displayMode === 'scale_pop' || style.displayMode === 'scale_pop_bold') {
    const isBold = style.displayMode === 'scale_pop_bold'
    return (
      <div style={{ ...baseWrap, display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'center', alignItems: 'baseline', gap: 2 }}>
        {segWords.map((w, i) => {
          const isActive = currentTime >= w.start && currentTime <= w.end
          const isDone = currentTime > w.end
          const wd = style.allCaps ? w.word.toUpperCase() : w.word
          return (
            <span key={i} style={{
              display: 'inline-block',
              fontSize: isActive ? style.fontSize * 1.6 : style.fontSize * 0.85,
              color: isActive ? style.highlightColor : style.color,
              fontWeight: isActive && isBold ? 'bold' : style.bold ? 'bold' : 'normal',
              opacity: isActive ? 1 : isDone ? 0.5 : 0.65,
              transition: 'font-size 0.12s cubic-bezier(0.34,1.56,0.64,1), opacity 0.12s, color 0.1s',
              padding: '0 3px',
              textShadow: isActive ? '2px 2px 6px rgba(0,0,0,0.9)' : '1px 1px 3px rgba(0,0,0,0.7)',
            }}>{wd}</span>
          )
        })}
      </div>
    )
  }

  // NORMAL (default)
  return (
    <div style={{ ...baseWrap, pointerEvents: onPositionChange ? 'auto' : 'none' }} onMouseDown={handleMouseDown}>
      <span style={{
        fontSize: style.fontSize, color: style.color,
        background: style.bgOpacity > 0 ? `${style.bgColor}${Math.round(style.bgOpacity*255).toString(16).padStart(2,'0')}` : 'transparent',
        padding: '4px 12px', borderRadius: style.boxStyle === 'pill' ? 30 : 4,
        whiteSpace: 'pre-wrap', textAlign: 'center', display: 'block',
        wordBreak: 'break-word', overflowWrap: 'break-word',
        maxWidth: '100%',
      }}>{displayText}</span>
    </div>
  )
}

// ─── Video Filters ───────────────────────────────────────────
interface VideoFilter {
  brightness: number   // 0-200 (100 = normal)
  contrast: number     // 0-200
  saturation: number   // 0-200
  warmth: number       // -100 to 100
  sharpen: number      // 0-100
  vignette: number     // 0-100
  preset: string
}

const DEFAULT_FILTER: VideoFilter = {
  brightness: 100, contrast: 100, saturation: 100,
  warmth: 0, sharpen: 0, vignette: 0, preset: 'none'
}

const FILTER_PRESETS = [
  { id: 'none', label: 'Original', filter: { brightness: 100, contrast: 100, saturation: 100, warmth: 0, sharpen: 0, vignette: 0 } },
  { id: 'vivid', label: 'Vivid', filter: { brightness: 105, contrast: 115, saturation: 140, warmth: 10, sharpen: 20, vignette: 10 } },
  { id: 'cinematic', label: 'Cinematic', filter: { brightness: 95, contrast: 120, saturation: 80, warmth: -10, sharpen: 10, vignette: 30 } },
  { id: 'warm', label: 'Warm', filter: { brightness: 105, contrast: 105, saturation: 110, warmth: 40, sharpen: 0, vignette: 15 } },
  { id: 'cool', label: 'Cool', filter: { brightness: 100, contrast: 110, saturation: 95, warmth: -35, sharpen: 10, vignette: 10 } },
  { id: 'bw', label: 'B&W', filter: { brightness: 100, contrast: 120, saturation: 0, warmth: 0, sharpen: 15, vignette: 20 } },
  { id: 'fade', label: 'Fade', filter: { brightness: 115, contrast: 85, saturation: 75, warmth: 5, sharpen: 0, vignette: 0 } },
  { id: 'drama', label: 'Drama', filter: { brightness: 90, contrast: 140, saturation: 110, warmth: -5, sharpen: 25, vignette: 40 } },
  { id: 'golden', label: 'Golden Hour', filter: { brightness: 108, contrast: 108, saturation: 120, warmth: 60, sharpen: 5, vignette: 20 } },
  { id: 'moody', label: 'Moody', filter: { brightness: 88, contrast: 125, saturation: 70, warmth: -20, sharpen: 10, vignette: 50 } },
]

function buildCSSFilter(f: VideoFilter): string {
  const warm = f.warmth > 0
    ? `sepia(${f.warmth * 0.4}%) saturate(${100 + f.warmth}%)`
    : `hue-rotate(${f.warmth * 0.5}deg)`
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) ${warm}`
}

// ─── Text Layer Renderer ──────────────────────────────────────
function TextLayerRenderer({ layers, currentTime }: { layers: TextLayer[]; currentTime: number }) {
  return (
    <>
      {layers.map(layer => {
        const visible = layer.always || (currentTime >= layer.start && currentTime <= layer.end)
        if (!visible) return null
        return (
          <div key={layer.id} style={{
            position: 'absolute',
            left: `${layer.x}%`, top: `${layer.y}%`,
            transform: 'translate(-50%, -50%)',
            color: layer.color, fontSize: layer.fontSize,
            fontWeight: layer.bold ? 'bold' : 'normal',
            pointerEvents: 'none', zIndex: 11,
            textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
            whiteSpace: 'nowrap',
          }}>{layer.text}</div>
        )
      })}
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function VideoEditor() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const token = useAuthStore(s => s.token)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [segments, setSegments] = useState<Segment[]>([])
  const [words, setWords] = useState<WordStamp[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [style, setStyle] = useState<SubStyle>(DEFAULT_STYLE)
  const [trim, setTrim] = useState({ start: 0, end: 0 })
  const [volume, setVolume] = useState(1)
  const [speed, setSpeed] = useState(1)
  const [textLayers, setTextLayers] = useState<TextLayer[]>([])
  const [filter, setFilter] = useState<VideoFilter>(DEFAULT_FILTER)
  const [activeTab, setActiveTab] = useState<'mode' | 'style' | 'subs' | 'text' | 'filter' | 'suggest' | 'export'>('mode')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [, tick] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [suggestions, setSuggestions] = useState<any>(null)

  const currentSeg = segments.find(s => currentTime >= s.start && currentTime <= s.end) || null

  // Debug: detect re-render loop
  const renderCount = useRef(0)
  renderCount.current += 1

  // Typewriter cursor blink
  useEffect(() => {
    if (style.displayMode === 'typewriter') {
      const t = setInterval(() => tick(n => n + 1), 200)
      return () => clearInterval(t)
    }
  }, [style.displayMode])

  useEffect(() => { if (jobId && token) loadJob() }, [jobId, token])

  async function loadJob() {
    setLoading(true)
    try {
      const srtRes = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/jobs/${jobId}/subtitle``, { headers: { Authorization: `Bearer ${token}` } })
      if (srtRes.ok) setSegments(parseSRT(await srtRes.text()))

      const wordsRes = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/jobs/${jobId}/words``, { headers: { Authorization: `Bearer ${token}` } })
      if (wordsRes.ok) { const d = await wordsRes.json(); setWords(d.words || []) }

      // Load AI suggestions
      const statusRes = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/jobs/${jobId}/status``, { headers: { Authorization: `Bearer ${token}` } })
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        if (statusData.suggestions) setSuggestions(statusData.suggestions)
      }

      setVideoUrl(`/api/jobs/${jobId}/video?token=${token}`)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onTime = () => setCurrentTime(v.currentTime)
    const onMeta = () => {
      setDuration(v.duration)
      setTrim({ start: 0, end: v.duration })
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [videoUrl])

  useEffect(() => { if (videoRef.current) { videoRef.current.volume = volume; videoRef.current.playbackRate = speed } }, [volume, speed])

  function togglePlay() { const v = videoRef.current; if (v) playing ? v.pause() : v.play() }
  function seek(t: number) {
    const v = videoRef.current
    if (!v) return
    const dur = v.duration
    if (!dur || isNaN(dur)) { console.warn('seek: duration invalid', dur); return }
    const target = Math.max(0, Math.min(t, dur))
    console.log('seeking to:', target, 'render#:', renderCount.current)
    v.currentTime = target
  }
  function applyCut(start: number, end: number) {
    // Remove segments that fall entirely within the cut range
    setSegments(s => s.filter(seg => !(seg.start >= start && seg.end <= end)))
    // Trim segments that partially overlap
    setSegments(s => s.map(seg => {
      if (seg.start < start && seg.end > start && seg.end <= end) return { ...seg, end: start }
      if (seg.start >= start && seg.start < end && seg.end > end) return { ...seg, start: end }
      return seg
    }))
  }

  function splitSegment(id: number) {
    const seg = segments.find(s => s.id === id)
    if (!seg) return
    const segWords = words.filter(w => w.start >= seg.start - 0.1 && w.end <= seg.end + 0.1)
    if (segWords.length < 2) return

    const mid = Math.floor(segWords.length / 2)
    const splitTime = segWords[mid].start

    // Split text roughly in half by words
    const textWords = seg.text.split(/\s+/)
    const textMid = Math.floor(textWords.length / 2)
    const text1 = textWords.slice(0, textMid).join(' ') || seg.text.slice(0, Math.floor(seg.text.length / 2))
    const text2 = textWords.slice(textMid).join(' ') || seg.text.slice(Math.floor(seg.text.length / 2))

    const newSeg1: Segment = { ...seg, end: splitTime, text: text1 }
    const newSeg2: Segment = { id: Date.now(), start: splitTime, end: seg.end, text: text2 }

    setSegments(s => s.map(x => x.id === id ? newSeg1 : x).concat(newSeg2).sort((a, b) => a.start - b.start))
  }

  function updateSeg(id: number, changes: Partial<Segment>) {
    setSegments(s => {
      const updated = s.map(x => x.id === id ? { ...x, ...changes } : x)
      // Rebuild words for edited segment if text changed
      if (changes.text !== undefined) {
        setWords(w => {
          const seg = updated.find(x => x.id === id)
          if (!seg) return w
          // Remove old words for this segment
          const filtered = w.filter(x => x.start < seg.start - 0.15 || x.start > seg.end + 0.15)
          // Add new derived words
          const newWords = deriveWords(seg, w)
          return [...filtered, ...newWords].sort((a, b) => a.start - b.start)
        })
      }
      return updated
    })
  }
  function shiftSeg(id: number, d: number) { setSegments(s => s.map(x => x.id === id ? { ...x, start: Math.max(0, x.start+d), end: x.end+d } : x)) }

  function addTextLayer() {
    setTextLayers(l => [...l, { id: Date.now(), text: 'New text', x: 50, y: 20, fontSize: 28, color: '#FFFFFF', bold: true, start: currentTime, end: currentTime + 3, always: false }])
  }

  function exportSRT() {
    return segments.map((s, i) => `${i+1}\n${fmtSRT(s.start)} --> ${fmtSRT(s.end)}\n${s.text}`).join('\n\n')
  }

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/jobs/${jobId}/export``, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitle_style: style, trim, volume, speed, subtitles: segments }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cosmix_output.mp4'; a.click()
      }
    } finally { setExporting(false) }
  }

  if (loading) return <div style={{ ...S.wrap, alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#A78BFA', fontSize: 16 }}>⟳ Loading editor...</div></div>

  return (
    <div style={S.wrap}>
      <style>{CSS}</style>

      <nav style={S.nav}>
        <div style={S.logo} onClick={() => navigate('/editor')}>⬡ COSMIX</div>
        <div style={{ color: '#475569', fontSize: 13 }}>Video Editor</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={S.btnGhost} onClick={() => { const b = new Blob([exportSRT()],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='subtitle.srt'; a.click() }}>⬇ SRT</button>
          <button style={{ ...S.btnPrimary, opacity: exporting ? 0.6 : 1 }} onClick={handleExport} disabled={exporting}>
            {exporting ? '⟳ Exporting...' : '⬇ Export MP4'}
          </button>
        </div>
      </nav>

      <div style={S.body}>

        {/* LEFT PANEL */}
        <div style={S.left}>
          <div style={S.tabs}>
            {[
              { id: 'mode', icon: '✦', label: 'Mode' },
              { id: 'style', icon: '🎨', label: 'Style' },
              { id: 'subs', icon: '⌨', label: 'Subs' },
              { id: 'text', icon: 'T', label: 'Text' },
              { id: 'filter', icon: '🎨', label: 'Filter' },
              { id: 'suggest', icon: '✦', label: 'AI' },
              { id: 'export', icon: '⚙', label: 'More' },
            ].map(t => (
              <button key={t.id} style={{ ...S.tab, ...(activeTab === t.id ? S.tabActive : {}) }} onClick={() => setActiveTab(t.id as any)}>
                <span style={{ display: 'block', fontSize: 13 }}>{t.icon}</span>
                <span style={{ fontSize: 9 }}>{t.label}</span>
              </button>
            ))}
          </div>

          <div style={S.scroll}>

            {/* MODE TAB */}
            {activeTab === 'mode' && (
              <div style={S.panel}>
                <div style={S.ptitle}>Subtitle Display Mode</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {DISPLAY_MODES.map(m => (
                    <button key={m.id} style={{ ...S.modeBtn, ...(style.displayMode === m.id ? S.modeBtnActive : {}) }}
                      onClick={() => setStyle(s => ({ ...s, displayMode: m.id }))}>
                      <span style={{ fontSize: 16, minWidth: 24 }}>{m.icon}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ color: style.displayMode === m.id ? '#A78BFA' : '#94A3B8', fontSize: 12, fontWeight: 500 }}>{m.label}</div>
                        <div style={{ color: '#374151', fontSize: 10 }}>{m.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div style={S.ptitle}>Box Style</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[{id:'none',l:'ไม่มี'},{id:'solid',l:'Box'},{id:'rounded_solid',l:'Rounded'},{id:'pill',l:'Pill'}].map(b => (
                    <button key={b.id} style={{ ...S.chip, ...(style.boxStyle === b.id ? S.chipActive : {}) }}
                      onClick={() => setStyle(s => ({ ...s, boxStyle: b.id as any }))}>{b.l}</button>
                  ))}
                </div>
                {style.boxStyle !== 'none' && (
                  <>
                    <div style={S.ptitle}>Box Color</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {BOX_COLORS.map(c => (
                        <div key={c} onClick={() => setStyle(s => ({ ...s, boxColor: c }))}
                          style={{ width: 22, height: 22, borderRadius: 4, background: c, cursor: 'pointer', border: style.boxColor === c ? '2px solid #A78BFA' : '2px solid transparent' }} />
                      ))}
                    </div>
                  </>
                )}

                <div style={S.ptitle}>Options</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[{k:'bold',l:'Bold'},{k:'allCaps',l:'ALL CAPS'},{k:'outline',l:'Outline'},{k:'shadow',l:'Shadow'}].map(({k,l}) => (
                    <button key={k} style={{ ...S.chip, ...((style as any)[k] ? S.chipActive : {}) }}
                      onClick={() => setStyle(s => ({ ...s, [k]: !(s as any)[k] }))}>{l}</button>
                  ))}
                </div>
              </div>
            )}

            {/* STYLE TAB */}
            {activeTab === 'style' && (
              <div style={S.panel}>
                <div style={S.ptitle}>Font</div>
                <select style={S.select} value={style.fontFamily} onChange={e => setStyle(s => ({ ...s, fontFamily: e.target.value }))}>
                  {FONTS.map(f => <option key={f}>{f}</option>)}
                </select>

                <div style={S.ptitle}>Size — {style.fontSize}px</div>
                <input type="range" min={14} max={60} value={style.fontSize} style={S.range}
                  onChange={e => setStyle(s => ({ ...s, fontSize: +e.target.value }))} />

                <div style={S.ptitle}>Text Color</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setStyle(s => ({ ...s, color: c }))}
                      style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: style.color === c ? '2px solid #A78BFA' : '2px solid rgba(255,255,255,0.1)' }} />
                  ))}
                  <input type="color" value={style.color} onChange={e => setStyle(s => ({ ...s, color: e.target.value }))}
                    style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0 }} />
                </div>

                <div style={S.ptitle}>Highlight Color</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setStyle(s => ({ ...s, highlightColor: c }))}
                      style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: style.highlightColor === c ? '2px solid #A78BFA' : '2px solid rgba(255,255,255,0.1)' }} />
                  ))}
                  <input type="color" value={style.highlightColor} onChange={e => setStyle(s => ({ ...s, highlightColor: e.target.value }))}
                    style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0 }} />
                </div>



                <div style={S.ptitle}>BG Opacity — {Math.round(style.bgOpacity*100)}%</div>
                <input type="range" min={0} max={1} step={0.05} value={style.bgOpacity} style={S.range}
                  onChange={e => setStyle(s => ({ ...s, bgOpacity: +e.target.value }))} />

                <div style={S.ptitle}>Max chars per line — {style.maxCharsPerLine} chars</div>
                <input type="range" min={5} max={50} value={style.maxCharsPerLine} style={S.range}
                  onChange={e => setStyle(s => ({ ...s, maxCharsPerLine: +e.target.value }))} />
                <div style={{ color: '#374151', fontSize: 10, marginBottom: 8 }}>ถ้าข้อความยาวเกินกว่านี้จะตัดเป็น 2 บรรทัด</div>

                <div style={S.ptitle}>Position</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {(['top','middle','bottom'] as const).map(p => (
                    <button key={p} style={{ ...S.chip, ...(style.position === p ? S.chipActive : {}) }}
                      onClick={() => setStyle(s => ({ ...s, position: p, posY: -1 }))}>{p}</button>
                  ))}
                  <button style={{ ...S.chip, ...(style.posY !== -1 ? S.chipActive : {}) }}>
                    {style.posY !== -1 ? `📍 ${Math.round(style.posX)}%, ${Math.round(style.posY)}%` : 'drag to move'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    style={{ ...S.chip, ...(isDragging ? S.chipActive : {}), fontSize: 11 }}
                    onClick={() => setIsDragging(prev => !prev)}>
                    {isDragging ? '🎯 Dragging...' : '✥ Drag mode'}
                  </button>
                  {style.posY !== -1 && (
                    <button style={{ ...S.chip, fontSize: 10 }} onClick={() => setStyle(s => ({ ...s, posY: -1, posX: 50 }))}>
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* SUBS TAB */}
            {activeTab === 'subs' && (
              <div style={S.panel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={S.ptitle}>Subtitles ({segments.length})</div>
                  <button style={S.chip} onClick={() => setSegments(s => [...s, { id: Date.now(), start: currentTime, end: currentTime+2, text: 'New' }].sort((a,b)=>a.start-b.start))}>+ Add</button>
                </div>
                {segments.map(seg => (
                  <div key={seg.id} style={{ ...S.subCard, ...(currentSeg?.id === seg.id ? S.subCardActive : {}) }}>
                    {/* Time controls */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#374151', fontSize: 9, marginBottom: 2 }}>START</div>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button style={S.tBtn} onClick={() => updateSeg(seg.id, { start: Math.max(0, seg.start-0.1) })}>−</button>
                          <input style={S.tInput} type="number" step="0.1" value={seg.start.toFixed(1)}
                            onChange={e => updateSeg(seg.id, { start: +e.target.value })} />
                          <button style={S.tBtn} onClick={() => updateSeg(seg.id, { start: seg.start+0.1 })}>+</button>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#374151', fontSize: 9, marginBottom: 2 }}>END</div>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button style={S.tBtn} onClick={() => updateSeg(seg.id, { end: Math.max(seg.start+0.1, seg.end-0.1) })}>−</button>
                          <input style={S.tInput} type="number" step="0.1" value={seg.end.toFixed(1)}
                            onChange={e => updateSeg(seg.id, { end: +e.target.value })} />
                          <button style={S.tBtn} onClick={() => updateSeg(seg.id, { end: seg.end+0.1 })}>+</button>
                        </div>
                      </div>
                    </div>

                    {/* Shift */}
                    <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ color: '#374151', fontSize: 9, alignSelf: 'center' }}>Shift:</span>
                      {[-1,-0.5,-0.1,+0.1,+0.5,+1].map(d => (
                        <button key={d} style={{ ...S.shiftBtn, color: d > 0 ? '#34D399' : '#F472B6' }}
                          onClick={() => shiftSeg(seg.id, d)}>{d>0?'+':''}{d}s</button>
                      ))}
                    </div>

                    {/* Text */}
                    {editingId === seg.id
                      ? <textarea style={S.textarea} value={seg.text} autoFocus
                          onChange={e => updateSeg(seg.id, { text: e.target.value })}
                          onBlur={() => setEditingId(null)} />
                      : <div style={{ display: 'flex', gap: 6 }}>
                          <div style={{ flex: 1, color: '#94A3B8', fontSize: 12, cursor: 'pointer', lineHeight: 1.5 }}
                            onClick={() => seek(seg.start)} onDoubleClick={() => setEditingId(seg.id)}>
                            {seg.text}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <button style={S.iconBtn} onClick={() => setEditingId(seg.id)} title="Edit">✏</button>
                            <button style={{ ...S.iconBtn, color: '#60A5FA' }} onClick={() => splitSegment(seg.id)} title="Split">✂</button>
                            <button style={{ ...S.iconBtn, color: '#EF4444' }} onClick={() => setSegments(s => s.filter(x => x.id !== seg.id))} title="Delete">✕</button>
                          </div>
                        </div>
                    }
                  </div>
                ))}
              </div>
            )}

            {/* TEXT LAYERS TAB */}
            {activeTab === 'text' && (
              <div style={S.panel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={S.ptitle}>Text Layers</div>
                  <button style={S.chip} onClick={addTextLayer}>+ Add Text</button>
                </div>
                {textLayers.length === 0 && (
                  <div style={{ color: '#374151', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
                    เพิ่ม text layer เช่น title, watermark, CTA
                  </div>
                )}
                {textLayers.map(layer => (
                  <div key={layer.id} style={S.subCard}>
                    <input style={{ ...S.tInput, width: '100%', marginBottom: 8, fontSize: 13 }}
                      value={layer.text} onChange={e => setTextLayers(l => l.map(x => x.id === layer.id ? { ...x, text: e.target.value } : x))} />
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#374151', fontSize: 9 }}>X%</div>
                        <input type="number" min={0} max={100} style={S.tInput} value={layer.x}
                          onChange={e => setTextLayers(l => l.map(x => x.id === layer.id ? { ...x, x: +e.target.value } : x))} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#374151', fontSize: 9 }}>Y%</div>
                        <input type="number" min={0} max={100} style={S.tInput} value={layer.y}
                          onChange={e => setTextLayers(l => l.map(x => x.id === layer.id ? { ...x, y: +e.target.value } : x))} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#374151', fontSize: 9 }}>Size</div>
                        <input type="number" min={10} max={80} style={S.tInput} value={layer.fontSize}
                          onChange={e => setTextLayers(l => l.map(x => x.id === layer.id ? { ...x, fontSize: +e.target.value } : x))} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                      {COLORS.slice(0,6).map(c => (
                        <div key={c} onClick={() => setTextLayers(l => l.map(x => x.id === layer.id ? { ...x, color: c } : x))}
                          style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', border: layer.color === c ? '2px solid #A78BFA' : '2px solid transparent' }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <button style={{ ...S.chip, ...(layer.always ? S.chipActive : {}) }}
                        onClick={() => setTextLayers(l => l.map(x => x.id === layer.id ? { ...x, always: !x.always } : x))}>
                        Always show
                      </button>
                      <button style={{ ...S.iconBtn, color: '#EF4444' }}
                        onClick={() => setTextLayers(l => l.filter(x => x.id !== layer.id))}>✕</button>
                    </div>
                    {!layer.always && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#374151', fontSize: 9 }}>Show from (s)</div>
                          <input type="number" step="0.1" style={S.tInput} value={layer.start.toFixed(1)}
                            onChange={e => setTextLayers(l => l.map(x => x.id === layer.id ? { ...x, start: +e.target.value } : x))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#374151', fontSize: 9 }}>Until (s)</div>
                          <input type="number" step="0.1" style={S.tInput} value={layer.end.toFixed(1)}
                            onChange={e => setTextLayers(l => l.map(x => x.id === layer.id ? { ...x, end: +e.target.value } : x))} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* FILTER TAB */}
            {activeTab === 'filter' && (
              <div style={S.panel}>
                <div style={S.ptitle}>Presets</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, marginBottom: 16 }}>
                  {FILTER_PRESETS.map(p => (
                    <button key={p.id}
                      style={{ ...S.chip, ...(filter.preset === p.id ? S.chipActive : {}), padding: '8px 6px', fontSize: 11, textAlign: 'center' as const }}
                      onClick={() => setFilter({ ...p.filter, preset: p.id })}>
                      {p.label}
                    </button>
                  ))}
                </div>

                <div style={S.ptitle}>Brightness — {filter.brightness}%</div>
                <input type="range" min={0} max={200} value={filter.brightness} style={S.range}
                  onChange={e => setFilter(f => ({ ...f, brightness: +e.target.value, preset: 'custom' }))} />

                <div style={S.ptitle}>Contrast — {filter.contrast}%</div>
                <input type="range" min={0} max={200} value={filter.contrast} style={S.range}
                  onChange={e => setFilter(f => ({ ...f, contrast: +e.target.value, preset: 'custom' }))} />

                <div style={S.ptitle}>Saturation — {filter.saturation}%</div>
                <input type="range" min={0} max={200} value={filter.saturation} style={S.range}
                  onChange={e => setFilter(f => ({ ...f, saturation: +e.target.value, preset: 'custom' }))} />

                <div style={S.ptitle}>Warmth — {filter.warmth > 0 ? `+${filter.warmth}` : filter.warmth}</div>
                <input type="range" min={-100} max={100} value={filter.warmth} style={S.range}
                  onChange={e => setFilter(f => ({ ...f, warmth: +e.target.value, preset: 'custom' }))} />

                <div style={S.ptitle}>Vignette — {filter.vignette}%</div>
                <input type="range" min={0} max={100} value={filter.vignette} style={S.range}
                  onChange={e => setFilter(f => ({ ...f, vignette: +e.target.value, preset: 'custom' }))} />

                <button style={{ ...S.chip, marginTop: 12 }}
                  onClick={() => setFilter(DEFAULT_FILTER)}>Reset filters</button>
              </div>
            )}

            {/* SUGGEST TAB */}
            {activeTab === 'suggest' && (
              <div style={S.panel}>
                {!suggestions ? (
                  <div style={{ color: '#374151', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>✦</div>
                    ไม่มี AI suggestions<br/>
                    <span style={{ fontSize: 11 }}>ต้อง process ด้วย Suggest Edits หรือ Auto Cut mode</span>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    {suggestions.summary && (
                      <div style={{ background: 'rgba(124,58,237,0.08)', borderTop: '1px solid rgba(139,92,246,0.2)', borderLeft: '1px solid rgba(139,92,246,0.2)', borderRight: '1px solid rgba(139,92,246,0.2)', borderBottom: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, color: '#94A3B8', fontSize: 12, lineHeight: 1.6 }}>
                        {suggestions.summary}
                      </div>
                    )}

                    {/* Suggested cuts */}
                    {(suggestions.suggested_cuts?.length > 0 || suggestions.cuts?.length > 0) && (
                      <>
                        <div style={S.ptitle}>✂ ตัดออก ({(suggestions.suggested_cuts || suggestions.cuts || []).length})</div>
                        {(suggestions.suggested_cuts || suggestions.cuts || []).map((cut: any, i: number) => (
                          <div key={i} style={{ background: 'rgba(239,68,68,0.06)', borderTop: '1px solid rgba(239,68,68,0.15)', borderLeft: '1px solid rgba(239,68,68,0.15)', borderRight: '1px solid rgba(239,68,68,0.15)', borderBottom: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: '#FCA5A5', fontSize: 12, fontWeight: 500 }}>
                                {cut.start}s → {cut.end}s
                              </span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button style={{ ...S.chip, fontSize: 10, padding: '2px 8px' }}
                                  onClick={() => seek(cut.start)}>▶ Preview</button>
                                <button style={{ background: 'rgba(239,68,68,0.15)', borderTop: '1px solid rgba(239,68,68,0.3)', borderLeft: '1px solid rgba(239,68,68,0.3)', borderRight: '1px solid rgba(239,68,68,0.3)', borderBottom: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', padding: '2px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}
                                  onClick={() => applyCut(cut.start, cut.end)}>✂ Apply</button>
                              </div>
                            </div>
                            <div style={{ color: '#475569', fontSize: 11 }}>{cut.reason || cut.type}</div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Highlight segments */}
                    {suggestions.highlight_segments?.length > 0 && (
                      <>
                        <div style={{ ...S.ptitle, marginTop: 14 }}>⭐ เก็บไว้ ({suggestions.highlight_segments.length})</div>
                        {suggestions.highlight_segments.map((seg: any, i: number) => (
                          <div key={i} style={{ background: 'rgba(52,211,153,0.06)', borderTop: '1px solid rgba(52,211,153,0.15)', borderLeft: '1px solid rgba(52,211,153,0.15)', borderRight: '1px solid rgba(52,211,153,0.15)', borderBottom: '1px solid rgba(52,211,153,0.15)', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: '#6EE7B7', fontSize: 12, fontWeight: 500 }}>
                                {seg.start}s → {seg.end}s
                              </span>
                              <button style={{ ...S.chip, fontSize: 10, padding: '2px 8px' }}
                                onClick={() => seek(seg.start)}>▶ Preview</button>
                            </div>
                            <div style={{ color: '#475569', fontSize: 11 }}>{seg.reason}</div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Apply all cuts */}
                    {(suggestions.suggested_cuts?.length > 0 || suggestions.cuts?.length > 0) && (
                      <button
                        style={{ ...S.btnPrimary, width: '100%', marginTop: 12, textAlign: 'center' as const }}
                        onClick={() => {
                          const cuts = suggestions.suggested_cuts || suggestions.cuts || []
                          cuts.forEach((cut: any) => applyCut(cut.start, cut.end))
                        }}>
                        ✂ Apply All Cuts
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* MORE TAB */}
            {activeTab === 'export' && (
              <div style={S.panel}>
                <div style={S.ptitle}>Volume — {Math.round(volume*100)}%</div>
                <input type="range" min={0} max={2} step={0.05} value={volume} style={{ ...S.range, marginBottom: 14 }}
                  onChange={e => setVolume(+e.target.value)} />

                <div style={S.ptitle}>Speed</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {[0.5,0.75,1,1.25,1.5,2].map(s => (
                    <button key={s} style={{ ...S.chip, ...(speed === s ? S.chipActive : {}) }} onClick={() => setSpeed(s)}>{s}x</button>
                  ))}
                </div>

                <div style={S.ptitle}>Trim</div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748B', marginBottom: 4 }}>
                    <span>Start: {fmtTime(trim.start)}</span><span>End: {fmtTime(trim.end)}</span>
                  </div>
                  <input type="range" min={0} max={duration} step={0.1} value={trim.start} style={S.range}
                    onChange={e => setTrim(t => ({ ...t, start: Math.min(+e.target.value, t.end-1) }))} />
                  <input type="range" min={0} max={duration} step={0.1} value={trim.end} style={S.range}
                    onChange={e => setTrim(t => ({ ...t, end: Math.max(+e.target.value, t.start+1) }))} />
                </div>
                <div style={{ color: '#A78BFA', fontSize: 12 }}>Output: {fmtTime(trim.end - trim.start)}</div>
              </div>
            )}
          </div>
        </div>

        {/* CENTER */}
        <div style={S.center}>
          <div style={S.videoWrap} data-video-wrap="1">
            <video ref={videoRef} src={videoUrl} style={{ ...S.video, filter: buildCSSFilter(filter) }} onClick={togglePlay} />
            <SubtitleRenderer seg={currentSeg} words={words} currentTime={currentTime} style={style} />
            {/* Drag overlay — transparent layer on top for dragging subtitle */}
            <div
              style={{ position: 'absolute', inset: 0, zIndex: 20, cursor: isDragging ? 'grabbing' : 'crosshair', opacity: 0 }}
              onMouseDown={e => {
                const wrap = e.currentTarget.parentElement
                if (!wrap) return
                const rect = wrap.getBoundingClientRect()
                const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100))
                const y = Math.max(3, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100))
                setStyle(s => ({ ...s, posX: x, posY: y }))
                setIsDragging(true)
              }}
              onMouseMove={e => {
                if (!isDragging) return
                const wrap = e.currentTarget.parentElement
                if (!wrap) return
                const rect = wrap.getBoundingClientRect()
                const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100))
                const y = Math.max(3, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100))
                setStyle(s => ({ ...s, posX: x, posY: y }))
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            />
            {filter.vignette > 0 && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 4,
                background: `radial-gradient(ellipse at center, transparent ${100 - filter.vignette}%, rgba(0,0,0,${filter.vignette/100 * 0.85}) 100%)` }} />
            )}
            <TextLayerRenderer layers={textLayers} currentTime={currentTime} />
            {!videoUrl && (
              <div style={S.noVid}>
                <div style={{ fontSize: 48, opacity: 0.1 }}>🎬</div>
                <div style={{ color: '#374151', marginTop: 10, fontSize: 13 }}>Preview unavailable</div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={S.controls}>
            <button style={S.playBtn} onClick={togglePlay}>{playing ? '⏸' : '▶'}</button>
            <span style={{ color: '#64748B', fontSize: 11, minWidth: 90 }}>{fmtTime(currentTime)} / {fmtTime(duration)}</span>
            <div style={S.seekBar} onClick={e => {
              if (!duration) return
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
              const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
              seek(pct * duration)
            }}>
              <div style={{ position: 'absolute', left: `${(trim.start/duration)*100}%`, width: `${((trim.end-trim.start)/duration)*100}%`, height: '100%', background: 'rgba(167,139,250,0.1)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: 0, width: `${(currentTime/duration)*100}%`, height: '100%', background: 'linear-gradient(90deg,#7C3AED,#A78BFA)', borderRadius: 3, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: `${(currentTime/duration)*100}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: '#A78BFA', boxShadow: '0 0 8px rgba(167,139,250,0.7)', pointerEvents: 'none' }} />
            </div>
            <span style={{ color: '#374151', fontSize: 11 }}>{speed}x</span>
          </div>

          {/* Timeline */}
          <div style={S.timeline} onClick={e => {
            if (!duration) return
            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
            seek(pct * duration)
          }}>
            {duration > 0 && segments.map(seg => (
              <div key={seg.id} onClick={e => { e.stopPropagation(); seek(seg.start) }}
                style={{
                  position: 'absolute',
                  left: `${(seg.start/duration)*100}%`,
                  width: `${Math.max(0.5, (seg.end-seg.start)/duration*100)}%`,
                  top: 4, height: 26,
                  background: currentSeg?.id === seg.id ? 'rgba(167,139,250,0.35)' : 'rgba(124,58,237,0.15)',
                  borderTop: `1px solid ${currentSeg?.id === seg.id ? 'rgba(167,139,250,0.6)' : 'rgba(139,92,246,0.25)'}`, borderLeft: `1px solid ${currentSeg?.id === seg.id ? 'rgba(167,139,250,0.6)' : 'rgba(139,92,246,0.25)'}`, borderRight: `1px solid ${currentSeg?.id === seg.id ? 'rgba(167,139,250,0.6)' : 'rgba(139,92,246,0.25)'}`, borderBottom: `1px solid ${currentSeg?.id === seg.id ? 'rgba(167,139,250,0.6)' : 'rgba(139,92,246,0.25)'}`,
                  borderRadius: 3, cursor: 'pointer', overflow: 'hidden',
                  display: 'flex', alignItems: 'center',
                }}>
                <span style={{ color: '#A78BFA', fontSize: 9, padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{seg.text.slice(0,20)}</span>
              </div>
            ))}
            {duration > 0 && (
              <div style={{ position: 'absolute', left: `${(currentTime/duration)*100}%`, top: 0, bottom: 0, width: 2, background: '#A78BFA', pointerEvents: 'none', boxShadow: '0 0 4px rgba(167,139,250,0.6)' }} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&family=Sarabun:wght@400;700&family=Kanit:wght@400;700&family=Prompt:wght@400;700&family=Mitr:wght@400;700&family=Chakra+Petch:wght@400;700&family=Bai+Jamjuree:wght@400;700&family=Noto+Sans+Thai:wght@400;700&family=Pridi:wght@400;700&display=swap');
  * { box-sizing: border-box; }
  select option { background: #0D1322; color: #E2E8F0; }
  input[type=range] { accent-color: #7C3AED; width: 100%; }
  ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 2px; }
`

const S: Record<string, React.CSSProperties> = {
  wrap: { height: '100vh', background: '#060A12', fontFamily: "'DM Sans',sans-serif", color: '#E2E8F0', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(8,12,20,0.95)', flexShrink: 0 },
  logo: { fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, background: 'linear-gradient(135deg,#A78BFA,#60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', cursor: 'pointer' },
  btnPrimary: { background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', border: 'none', color: '#fff', padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontWeight: 500 },
  btnGhost: { background: 'transparent', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  left: { width: 260, minWidth: 260, borderRight: '1px solid rgba(139,92,246,0.1)', display: 'flex', flexDirection: 'column', background: 'rgba(8,12,20,0.5)', overflow: 'hidden' },
  tabs: { display: 'flex', borderBottom: '1px solid rgba(139,92,246,0.1)', flexShrink: 0 },
  tab: { flex: 1, background: 'transparent', border: 'none', color: '#374151', padding: '8px 2px', fontSize: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'color 0.15s', lineHeight: 1.4 },
  tabActive: { color: '#A78BFA', borderBottom: '2px solid #7C3AED' },
  scroll: { flex: 1, overflowY: 'auto' as const },
  panel: { padding: '12px' },
  ptitle: { color: '#475569', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 6, marginTop: 12 },
  select: { width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6, padding: '6px 8px', color: '#E2E8F0', fontSize: 12, fontFamily: "'DM Sans',sans-serif" },
  range: { width: '100%', marginBottom: 2 },
  chip: { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#64748B', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s' },
  chipActive: { background: 'rgba(139,92,246,0.2)', borderTop: '1px solid rgba(139,92,246,0.5)', borderLeft: '1px solid rgba(139,92,246,0.5)', borderRight: '1px solid rgba(139,92,246,0.5)', borderBottom: '1px solid rgba(139,92,246,0.5)', color: '#A78BFA' },
  modeBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.1)', background: 'transparent', cursor: 'pointer', width: '100%', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s' },
  modeBtnActive: { background: 'rgba(139,92,246,0.1)', borderTop: '1px solid rgba(139,92,246,0.4)', borderLeft: '1px solid rgba(139,92,246,0.4)', borderRight: '1px solid rgba(139,92,246,0.4)', borderBottom: '1px solid rgba(139,92,246,0.4)' },
  subCard: { background: 'rgba(13,19,34,0.8)', border: '1px solid rgba(139,92,246,0.08)', borderRadius: 8, padding: '8px', marginBottom: 6 },
  subCardActive: { borderTop: '1px solid rgba(167,139,250,0.35)', borderLeft: '1px solid rgba(167,139,250,0.35)', borderRight: '1px solid rgba(167,139,250,0.35)', borderBottom: '1px solid rgba(167,139,250,0.35)' },
  tBtn: { background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#A78BFA', width: 20, height: 20, borderRadius: 4, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 },
  tInput: { background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 4, padding: '2px 4px', color: '#E2E8F0', fontSize: 11, fontFamily: 'monospace', textAlign: 'center' as const, flex: 1, minWidth: 0 },
  shiftBtn: { background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', padding: '2px 5px', borderRadius: 4, fontSize: 9, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  textarea: { width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 4, padding: '5px 8px', color: '#E2E8F0', fontSize: 12, fontFamily: "'DM Sans',sans-serif", resize: 'vertical' as const, minHeight: 48 },
  iconBtn: { background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12, padding: '2px' },
  center: { flex: 1, display: 'flex', flexDirection: 'column' as const, background: '#030508', overflow: 'hidden' },
  videoWrap: { flex: 1, position: 'relative' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden', minHeight: 0 },
  video: { maxWidth: '100%', maxHeight: '100%', display: 'block' },
  noVid: { position: 'absolute' as const, inset: 0, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center' },
  controls: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: '1px solid rgba(139,92,246,0.1)', background: 'rgba(8,12,20,0.9)', flexShrink: 0 },
  playBtn: { background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  seekBar: { flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, position: 'relative' as const, cursor: 'pointer' },
  timeline: { height: 36, position: 'relative' as const, background: 'rgba(8,12,20,0.7)', borderTop: '1px solid rgba(139,92,246,0.1)', cursor: 'pointer', flexShrink: 0, overflow: 'hidden' },
}
