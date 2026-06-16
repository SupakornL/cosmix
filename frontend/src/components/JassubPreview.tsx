import { useEffect, useRef } from 'react'
import JASSUB from 'jassub'
// @ts-ignore - vite-specific query suffixes resolve to URLs at build time
import workerUrl from 'jassub/dist/worker/worker.js?worker&url'
// @ts-ignore
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url'
// @ts-ignore
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url'

const AVAILABLE_FONTS: Record<string, string> = {
  'sarabun': 'https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Regular.ttf',
  'kanit': 'https://github.com/google/fonts/raw/main/ofl/kanit/Kanit-Regular.ttf',
  'prompt': 'https://github.com/google/fonts/raw/main/ofl/prompt/Prompt-Regular.ttf',
  'mitr': 'https://github.com/google/fonts/raw/main/ofl/mitr/Mitr-Regular.ttf',
  'chakra petch': 'https://github.com/google/fonts/raw/main/ofl/chakrapetch/ChakraPetch-Regular.ttf',
  'bai jamjuree': 'https://github.com/google/fonts/raw/main/ofl/baijamjuree/BaiJamjuree-Regular.ttf',
  'noto sans thai': 'https://github.com/google/fonts/raw/main/ofl/notosansthai/NotoSansThai%5Bwdth,wght%5D.ttf',
  'pridi': 'https://github.com/google/fonts/raw/main/ofl/pridi/Pridi-Regular.ttf',
  'inter': 'https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf',
}

const EMPTY_ASS = `[Script Info]
ScriptType: v4.00+
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Sarabun,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>
  assContent: string
}

export default function JassubPreview({ videoRef, assContent }: Props) {
  const instRef = useRef<JASSUB | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Create canvas imperatively so JASSUB's destroy() → canvas.remove() doesn't
    // conflict with React's DOM reconciliation (React never owns this element).
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:18'
    video.parentElement?.appendChild(canvas)

    let inst: JASSUB | null = null
    let destroyed = false

    try {
      inst = new JASSUB({
        video,
        canvas,
        subContent: assContent || EMPTY_ASS,
        workerUrl,
        wasmUrl,
        modernWasmUrl,
        availableFonts: AVAILABLE_FONTS,
        fonts: [AVAILABLE_FONTS['sarabun']],
        fallbackFont: 'sarabun',
        prescaleFactor: 1,
      } as any)

      if (!destroyed) {
        instRef.current = inst
      } else {
        inst.destroy()
      }
    } catch (e) {
      console.error('JASSUB init failed:', e)
      canvas.remove()
    }

    return () => {
      destroyed = true
      instRef.current = null
      try { inst?.destroy() } catch (_) { canvas.remove() }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!instRef.current || !assContent) return
    try {
      instRef.current.renderer.setTrack(assContent)
      instRef.current.resize()
    } catch (_) {}
  }, [assContent])

  // Canvas is managed imperatively above — nothing to render here.
  return null
}
