# Cosmix — Project Notes & Runbook

> เก็บไว้ที่ root ของ repo เป็น `PROJECT_NOTES.md` — อัปเดตทุกครั้งที่มี session แก้งานใหญ่
> เป้าหมาย: ให้ใครก็ตาม (รวมถึง Claude คนละ session) อ่านแล้วเข้าใจโครงสร้าง + สถานะงานได้ทันที

---

## 1. Stack & Deploy

| ส่วน | เทคโนโลยี | ที่อยู่ |
|---|---|---|
| Backend | FastAPI + Celery + PostgreSQL + Redis | Railway: `magnificent-growth-production-1b43.up.railway.app` |
| Frontend | React + Vite + TS + Tailwind | Vercel: `cosmix-xi.vercel.app` |
| Repo | GitHub | `SupakornL/cosmix` |
| Local dev | backend `:8000`, frontend `:5173` | |
| Admin | `admin@cosmix.com` / `admin1234` | `/admin` |

**Storage:** Cloudflare R2 (5-day auto-delete)
**Payments:** Stripe — Pro ฿199/mo, 100 jobs/mo, trial 5 วันฟรี
**AI:** AssemblyAI (transcription) + PyThaiNLP/attacut (Thai word tokenization) + Anthropic Claude (suggestions)
**Process management:** supervisord runs web + worker + beat บน Railway

---

## 2. Subtitle Display Modes — ตัวไหนคืออะไร

ทั้งหมดอยู่ใน `frontend/src/pages/VideoEditor.tsx` ฟังก์ชัน render ใหญ่ก้อนเดียว แยกด้วย `if (style.displayMode === '...')`

| `displayMode` id | ชื่อที่ user เห็น | ทำงานยังไง |
|---|---|---|
| `normal` | Normal | แสดงทั้งประโยค (segment) พร้อมกัน แบบ subtitle ปกติ |
| `word_single` | Word (Single) | โชว์ **ทีละคำ** คำเดียวกลางจอ ตาม timestamp ของคำนั้น |
| `word_trail` | Word (Trail) | โชว์ทีละคำ **+ เห็นคำก่อนหน้าด้วย** (เหมือน trail effect) |
| `word_pop` | Word Pop | คำที่กำลังพูด scale ใหญ่ขึ้นแบบ pop (TikTok style) |
| `karaoke` | Karaoke | Highlight ทีละคำในประโยคเดียว (เหมือนคาราโอเกะ) |
| `karaoke_color` | Karaoke Color | เหมือน karaoke แต่เปลี่ยนสีคำที่พูดแทน highlight |
| `scale_pop` | Scale Pop | คำที่พูดอยู่ใหญ่ขึ้น คำอื่นเล็กลง — แสดง **5 คำ** (2 ก่อน + active + 2 หลัง) ป้องกัน overflow |
| `scale_pop_bold` | Scale Pop Bold | เหมือน scale_pop + ตัวหนาตอนพูด |
| `typewriter` | Typewriter | พิมพ์ทีละตัวอักษร |
| `fade_in_out` / `slide_up` / `bounce_in` | — | Animation เข้า-ออกของ segment ปกติ |

**คำที่ใช้เรียกกลุ่ม "word-based modes"** (สำคัญ — มีผลต่อ export):
```ts
const wordModes = ['word_single', 'word_trail', 'word_pop', 'karaoke', 'karaoke_color', 'scale_pop', 'scale_pop_bold']
```
ถ้า `displayMode` อยู่ใน list นี้ → export จะแปลง `words[]` เป็น subtitle ทีละคำ
ถ้าไม่อยู่ (เช่น `normal`) → export ใช้ `segments[]` (ทั้งประโยค)

---

## 3. Data Model สำคัญ

```ts
interface Segment { id: number; start: number; end: number; text: string }
interface WordStamp { word: string; start: number; end: number }
```

- **`segments`** — มาจาก backend `/api/jobs/{id}/subtitle` (SRT format) แต่ละ segment ถูก backend จัดกลุ่มเป็น **4 คำ/segment** (ดู `WORDS_PER_SEGMENT` ใน `ai_service.py`)
- **`words`** — มาจาก backend `/api/jobs/{id}/words` เป็น array ของคำเดี่ยวๆ พร้อม timestamp
  - **`word.start` ใช้เป็น unique key** เวลาแก้/ลบคำ — ห้ามใช้ array index หรือ object reference เพราะ re-render ทำให้ reference เปลี่ยน

### การตัดคำภาษาไทย (สำคัญมาก — ปัญหานี้กลับมาเรื่อยๆ)
AssemblyAI ส่ง timestamp มาเป็น **phrase-level** (ทั้งประโยคติดกัน ไม่มี space) ไม่ใช่ word-level จริง
→ Backend (`ai_service.py`) ใช้ **PyThaiNLP tokenize** แตก phrase เป็นคำ แล้ว**หาร duration ตามสัดส่วนความยาวตัวอักษร** (proportional timing)
→ **timing คำในประโยคเดียวกันเป็น estimate ไม่ใช่ของจริง** — นี่คือ known limitation ที่ยังไม่ได้แก้

---

## 4. Export Pipeline (MP4 + burned subtitle)

`POST /api/jobs/{id}/export` ใน `backend/app/routers/jobs.py`

1. Download วิดีโอจาก R2 → `/tmp/cosmix_exports/{job_id}_input{ext}`
2. `ffprobe` หา resolution จริง (`vid_w`, `vid_h`) — ใช้ตั้ง `PlayResX/Y` ใน ASS
3. Frontend ส่ง `subtitle_style` (จาก `style` state) + `subtitles[]` (segments หรือ words ตาม mode)
4. Backend generate **ASS subtitle file** (ไม่ใช่ SRT แล้ว — เปลี่ยนเพราะ SRT ผ่าน `force_style` ปรับสีไม่ได้ดีพอ)
5. `ffmpeg -i input -vf "ass=..." output_{timestamp}.mp4` — **output path มี timestamp ทุกครั้ง** ป้องกัน cache เก่า
6. Return `FileResponse`

### Thai transcription accuracy + word timing (2026-06-13)
พี่บอสรายงานว่าทั้ง (1) คำที่ transcribe ผิด/สะกดผิด และ (3) timing ของแต่ละคำไม่ตรงกับที่พูดจริง
- (1) แก้เบื้องต้น: ตั้ง `speech_models=["universal-3-pro","universal-2"]` ใน `transcribe_audio()`
  (`backend/app/services/ai_service.py`) — เดิมไม่ได้ระบุ tier ชัดเจน
  ⚠️ **ระวัง**: ตอนแรกใช้ `speech_model=aai.SpeechModel.best` (param เก่า ถูก deprecate แล้ว)
  ทำให้ "Processing failed" ทั้งหมด — แก้เป็น `speech_models` (list) แล้วใน commit a1ffed9
  ถ้าหลังจากนี้ความแม่นยำยังไม่พอ ต้องพิจารณาเปลี่ยน ASR provider (เช่น Whisper)
  ซึ่งเป็นงานใหญ่กว่า ต้องคุยแผนก่อนทำ
- (3) เป็นข้อจำกัดเดิมที่เคยบันทึกไว้ (หัวข้อ 3 — การตัดคำภาษาไทย): AssemblyAI ส่ง
  timestamp ระดับ phrase ไม่ใช่ระดับคำ เราใช้ PyThaiNLP ตัดคำแล้วหาร duration ตาม
  สัดส่วนความยาวตัวอักษร (estimate) — AssemblyAI ไม่มี API ที่ให้ timestamp ต่อคำไทยจริง
  ทางแก้จริงคือ forced-alignment ภายนอก (เช่น wav2vec2-based aligner) ซึ่งเป็นงานใหญ่

### ตัวหนังสือไม่อยู่กึ่งกลาง pill box + box ไม่กลมพอ (แก้แล้ว 2026-06-13)
หลังแก้ width estimate แล้ว ยังมี 2 จุดเหลื่อม:
1. **box_h ต่ำเกินไป** — `line_h = size * 1.2` ไม่พอสำหรับภาษาไทยที่มีสระ/วรรณยุกต์ซ้อนบน-ล่าง
   (ิ ์ ๊ ุ ฯลฯ) ทำให้กล่องเตี้ยกว่าตัวอักษรจริง → แก้เป็น `size * 1.35`
2. **ข้อความไม่ตรงกึ่งกลางกล่อง** — เดิม text dialogue ใช้ alignment/margin ของ style
   (เช่น `\an2` bottom) แยกจาก box ที่คำนวณตำแหน่งเองจาก `box_x/box_y` (estimate) —
   ถ้า estimate คลาดเคลื่อนแม้เล็กน้อย ข้อความจะไม่ตรงกึ่งกลาง box
   → แก้โดยให้ text dialogue ใช้ `\an5\pos(box_center_x, box_center_y)` ชี้ไปจุดกึ่งกลาง
   เดียวกันกับ box เสมอ (ทั้ง custom-pos และ position ปกติ) — การันตีว่าตัวหนังสืออยู่
   กึ่งกลาง box แม้ size estimate จะคลาดเคลื่อนบ้าง

### Pill shape เพี้ยนเป็นกล่องเหลี่ยม + ไม่มีเงาตัวหนังสือ (แก้แล้ว 2026-06-13)
หลังแก้ padding/radius ตาม displayMode (หัวข้อถัดไป) export ดีขึ้นมากแต่ยังมี 2 ปัญหา:
1. **box ไม่กลมเป็น pill** + ช่องว่างรอบตัวอักษรกว้างเกินไป — ต้นเหตุคือ `text_w` estimate
   นับ `len(text)` รวม **สัญลักษณ์วรรณยุกต์/สระลอยของภาษาไทย** (ิ ี ึ ื ุ ู ั ็ ่ ้ ๊ ๋ ์ ํ)
   ซึ่งเป็น combining mark ซ้อนบนตัวพยัญชนะ ไม่กินความกว้างจริง แต่ทำให้ `len()` นับเกิน
   เช่น "ดิเจ๊ง" = 6 chars แต่กว้างจริงแค่ ~4 ตัว → กล่องกว้าง/สูงเกินจริง ~50% ทำให้ radius
   ที่คำนวณ (`min(radius_css*scale, box_w/2, box_h/2)`) ไม่ถึง `box_h/2` เลยไม่กลมเป็น pill
   → แก้โดย strip combining marks ออกก่อนนับ `len()` (`thai_combining` regex ใน
   `backend/app/routers/jobs.py`)
2. **ไม่มีเงาตัวหนังสือ** — `shadow_val` ถูก hardcode เป็น `0` เสมอเมื่อ `use_drawn_box`
   (ลบ ASS Shadow ทิ้งทั้งหมดเพื่อไม่ให้กล่องเดิมของ BorderStyle=4 ไปทับ) แต่ editor มี
   `textShadow` CSS แยกจาก `boxStyle` โดยสิ้นเชิง (ใส่ shadow ได้แม้ตอนมี box)
   → แก้โดยตั้ง `shadow_val = 2 if shadow_on else 0` ก่อนแยก branch, แล้วให้เฉพาะ
   `BorderStyle=4` (solid box / bgOpacity) เท่านั้นที่ override เป็น `0` (เพราะ
   BorderStyle=4 ไม่รองรับ shadow แยกจาก outline)

### Pill/rounded box ขนาด+ความโค้งยังไม่ตรง (ปรับเพิ่ม 2026-06-13)
รอบแรกเดาขนาด padding/radius เป็นสัดส่วนคงที่ของ fontSize ซึ่งไม่ตรงกับ editor จริง
เพราะ editor ใช้ padding/borderRadius เป็น **CSS px คงที่** (ไม่ scale ตาม fontSize)
และค่าต่างกันตาม displayMode:
- word modes (word_single/trail/pop, karaoke, karaoke_color): padding `2px 8px`, radius pill=20/rounded=6
- scale_pop / scale_pop_bold: padding `4px 12px`, radius pill=30/rounded=4
- normal/segment อื่นๆ: padding `4px 16px`, radius pill=30/rounded=8
→ แก้โดยอ่าน `subtitle_style.displayMode` แล้วใช้ค่าตรงตาม mode, คูณด้วย `css_scale = vid_w/previewWidth`
  เหมือนกับที่ใช้ scale fontSize — radius ใช้ `min(radius_css*scale, box_w/2, box_h/2)`
  ให้พฤติกรรมเหมือน CSS border-radius (ถ้า radius ใหญ่กว่าครึ่งกล่อง จะกลายเป็น pill อัตโนมัติ)
→ `text_w` (ความกว้างข้อความ) ยังเป็น estimate (`char_w = fontsize*0.62`) อยู่ — ส่วนนี้ยัง
  เป็นจุดที่อาจคลาดเคลื่อนได้บ้างถ้าตัวอักษรกว้าง/แคบกว่าที่ประมาณ

### Font size/box เล็กกว่า preview + font ผิด (แก้แล้ว 2026-06-13)
2 ปัญหาซ้อนกัน:
1. **fontSize scale** — `style.fontSize` เป็น CSS px ของ `<video>` element ที่ scale ตาม
   ขนาดหน้าจอ (responsive, `maxWidth:100%`) แต่ ASS ใช้ `Fontsize` ตรงกับ `PlayResX = vid_w`
   (ความกว้างวิดีโอจริง เช่น 1080) → ขนาดตัวอักษร/กล่อง ใน export เล็กกว่า preview มาก
   → แก้โดย frontend ส่ง `previewWidth` (`videoRef.current.getBoundingClientRect().width`)
   ไปด้วย แล้ว backend scale: `size *= vid_w / previewWidth`
2. **Font family ไม่ตรง / ไม่มีบน Railway** — `font_map` แมป 'Noto Sans Thai' → 'NotoSansThai'
   (ไม่มี space) แต่ font family จริงในไฟล์ ttf คือ "Noto Sans Thai" (มี space) ทำให้ libass
   หา font ไม่เจอเสมอ แก้ชื่อใน `font_map` ให้ตรงกับ TTF family name จริง (Chakra Petch,
   Bai Jamjuree, Noto Sans Thai มี space ทั้งหมด) + เพิ่มไฟล์ฟอนต์ Kanit/Prompt/Mitr/
   ChakraPetch/BaiJamjuree/NotoSansThai/Inter ใน `backend/nixpacks.toml`
   (ก่อนหน้านี้มีแค่ Sarabun ติดตั้งจริง ฟอนต์อื่นใน dropdown fallback หมด)

### Custom drag position ไม่ตรงกับ export (แก้แล้ว 2026-06-13)
Editor มีปุ่ม "Drag mode" ให้ลากตำแหน่ง subtitle ไปไหนก็ได้ (`posX`/`posY` เป็น % ของเฟรม,
จุดศูนย์กลางของ subtitle อยู่ที่ตำแหน่งนั้นพอดีเพราะ CSS ใช้ `translate(-50%,-50%)`)
แต่ backend export **ไม่เคยอ่าน `posX`/`posY` เลย** — ใช้แค่ `position` (top/middle/bottom)
+ margin_v คงที่ ทำให้ลากไปตรงไหนก็ตาม export ออกมาอยู่ตำแหน่งเดิมเสมอ
→ แก้โดย: ถ้า `posY !== -1` (มีการลากกำหนดเอง) → ตั้ง ASS alignment เป็น `\an5` (middle-center)
  แล้วใส่ `\pos(x,y)` ต่อ dialogue ทุกอัน โดย x,y คำนวณจาก `posX%/posY% * vid_w/vid_h`
  (ตรงกับวิธี CSS ของ editor) — ใช้กับทั้ง text dialogue และ box drawing (สำหรับ pill/rounded)

### Pill/rounded box export (แก้แล้ว 2026-06-13)
ASS `BorderStyle=4` = opaque **rectangle** เท่านั้น ไม่มี rounded corners ในตัว
→ แก้โดย: เมื่อ `boxStyle` เป็น `rounded_solid` หรือ `pill` จะไม่ใช้ `BorderStyle=4` แล้ว
  แทนที่ด้วยการวาด **rounded-rectangle เป็น vector shape (`\p1` drawing + bezier corners)**
  เป็น Dialogue แยก (style `Box`, layer 0) อยู่หลังข้อความ (style `Default`, layer 1)
→ ขนาดกล่อง (`box_w`/`box_h`) เป็นการ **ประมาณจากความยาวข้อความ** (`char_w = fontsize * 0.62`)
  + padding ตาม fontsize — ไม่ใช่ขนาดจริงจาก libass เหมือน BorderStyle=4 เดิม
  → อาจมี padding ซ้าย-ขวาไม่เท่ากันเล็กน้อยถ้าข้อความยาว/สั้นกว่าที่ประมาณไว้ แต่ตำแหน่งกึ่งกลางถูกต้องเสมอ
→ `boxStyle = 'solid'` ยังใช้ `BorderStyle=4` เดิม (สี่เหลี่ยมตรงกับ editor อยู่แล้ว ไม่มีปัญหา)
→ โค้ดอยู่ใน `backend/app/routers/jobs.py` ส่วน export ASS generation (`use_drawn_box`)

### Font บน Railway
ต้องติดตั้ง Thai font เอง (nixpacks ไม่มี default) — โหลด Sarabun ใน `nixpacks.toml` ตอน build:
```toml
"curl -L 'https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Regular.ttf' -o /usr/share/fonts/thai/Sarabun-Regular.ttf"
"fc-cache -fv"
```

---

## 5. Known Issues / Backlog (อัปเดตล่าสุด: 2026-06-14)

| Issue | สถานะ | รายละเอียด |
|---|---|---|
| Export style ไม่ตรง editor (pill → กล่องเหลี่ยม) | ✅ Fixed | วาด rounded-rect ด้วย ASS vector drawing + แก้ width estimate ให้ตัด combining marks ไทย, ดูหัวข้อ 4 |
| Export ไม่มีเงาตัวหนังสือตอนมี pill/rounded box | ✅ Fixed | `shadow_val` เคย hardcode เป็น 0 ตอน `use_drawn_box` — แก้แล้ว ดูหัวข้อ 4 |
| Word timing เป็น proportional ไม่ใช่จริง | 🔴 Open | ข้อจำกัด AssemblyAI ภาษาไทย — ดู note 2026-06-13 (Apollo research 2026-06-14: MMS/wav2vec2 forced-aligner เป็นทางเลือกที่ดูคุ้มที่สุดถ้าจะทำในอนาคต แต่ยังไม่คุ้มตอนนี้ — ต้อง verify ตัวเลขจริงก่อน) |
| Thai transcription ผิด/สะกดผิดบางคำ | 🟡 ปรับ speech_model=best แล้ว | ยังขึ้นกับคุณภาพโมเดล AssemblyAI ภาษาไทย — ถ้ายังไม่พอ ต้องพิจารณา ASR อื่น (Whisper ฯลฯ) |
| Presigned URL (R2) หมดอายุ ~2hr | ✅ Fixed (2026-06-14) | Frontend (`VideoEditor.tsx`) refresh `videoUrl` ทุก 50 นาที (ก่อนหมดอายุ) พร้อม restore playback position/state |
| `seeking to: 0` re-render loop | ✅ Fixed | แก้โดยแยก video event-listener effect |
| Word chip editor accumulate ซ้ำ | ✅ Fixed | ใช้ `word.start` เป็น key, ไม่ rebuild words ใน `updateSeg`/`saveSubtitles` |
| Subtitle segment เยอะเกินจอ (word modes) | ✅ Fixed | จัดกลุ่ม 4 คำ/segment ใน backend |
| Scale Pop ล้นจอ | ✅ Fixed | จำกัดแสดง 5 คำรอบ active word |
| BG opacity ไม่ทำงานทุก mode | ✅ Fixed | |
| Export 404 / ดาวน์โหลดวิดีโอไม่ได้ | ✅ Fixed | export endpoint ต้อง download จาก R2 ก่อน |
| Export `/tmp/cosmix_exports` ไฟล์ค้างไม่ถูกลบ (disk เต็มได้) | ✅ Fixed (2026-06-14) | `jobs.py` ลบ `.ass` + `.mp4` output ผ่าน `BackgroundTasks` (success) หรือ sync (failure, เพราะ `BackgroundTasks` ไม่รันถ้า raise `HTTPException`) |
| Export ไม่เช็ค ffmpeg exit code | ✅ Fixed (2026-06-14) | เช็ค `returncode` ทุก `subprocess.run`, raise 500 แบบ generic ถ้า fail, และข้าม watermark pass ถ้า export หลักล้มเหลว |

### Code review backlog (Argus Panoptes, 2026-06-14 — ยังไม่ทำ)
- `subtitle_style`/`subtitles[]` body ของ `/export` เป็น `dict` ไม่มี validation (เช่น `speed=0` → ZeroDivisionError, subtitle ขาด field → KeyError/500) — ควรทำ Pydantic model + validators
- Export job เดียวกันรันพร้อมกัน 2 ครั้ง อาจ race กันที่ `video_path` ที่ download มา cache ไว้
- `thai_combining` regex (`jobs.py`) range `ิ-ฺ` รวม "ำ" (sara am) ไปด้วย ทั้งที่ "ำ" กินพื้นที่จริง — อาจทำให้กล่อง subtitle แคบไปสำหรับคำที่มี ำ (คำ/นำ/ทำ)
- ถ้า R2 upload ล้มเหลวตอน upload วิดีโอ จะเก็บ local `/tmp` path เป็น `input_s3_key` ถาวร (หายหลัง Railway restart)
- `hex_to_ass` ไม่ validate input color hex (low risk, แค่ visual bug ถ้า input ผิด)

---

## 6. Naming Pitfalls (เคยเสียเวลาเพราะชื่อไม่ตรงกัน)

- **"word by word"** ใน UI = `displayMode: word_single / word_trail / word_pop / karaoke...` (มีหลายแบบ ดูตาราง section 2)
- **"segment"** ในโค้ด ≠ "ประโยค" เสมอ — ตอนนี้ backend group เป็น 4 คำ/segment เพื่อให้ word modes แสดงผลดี
- **`subtitle_style`** (backend, snake_case JSON key) ↔ **`style`** (frontend state, camelCase) — เป็น object เดียวกัน แค่ส่งผ่าน API
- **SRT vs ASS** — ปุ่ม "SRT" ใน UI ยัง export เป็น `.srt` ปกติ (สำหรับเอาไปใช้ที่อื่น), แต่ export MP4 ใช้ `.ass` ภายใน (คนละไฟล์ คนละ purpose)
- **`boxStyle`** (pill/square/none) ≠ **`bgOpacity`** — สองอันนี้แยกกัน: `boxStyle` ใช้กับ word modes (กล่องรอบคำ active), `bgOpacity`+`bgColor` ใช้เป็นพื้นหลังทั่วไปได้ทุก mode

---

## 7. ย้ายไป Claude Code — แนะนำยังไง?

**ควรย้ายครับ** ถ้างานเริ่มซับซ้อนขึ้น เพราะ Claude Code:
- รัน `git`, `railway logs`, ffmpeg ทดสอบได้จริงในเครื่อง ไม่ต้องคัด-วาง code กลับมา-กลับไป
- เห็น error/stack trace ทันที ไม่ต้อง screenshot console
- แก้หลายไฟล์พร้อมกันได้ในคำสั่งเดียว

### Prompt เริ่มต้นที่แนะนำ (วางในโฟลเดอร์ project แล้วเปิด Claude Code)

```
อ่านไฟล์ PROJECT_NOTES.md ในโฟลเดอร์นี้ก่อน — มันคือ runbook ของโปรเจค Cosmix
(AI video editor ภาษาไทย, FastAPI + React, deploy Railway/Vercel)

สิ่งที่ต้องรู้:
- backend/app/routers/jobs.py = export pipeline (ASS subtitle, ffmpeg)
- backend/app/services/ai_service.py = AssemblyAI + Thai tokenization
- frontend/src/pages/VideoEditor.tsx = editor หลัก ทุก subtitle display mode

วันนี้อยากทำ: [ใส่งานที่จะทำ]

หลังแก้เสร็จและ deploy แล้ว ช่วยอัปเดต section "Known Issues / Backlog"
ใน PROJECT_NOTES.md ด้วย (เปลี่ยนสถานะ, เพิ่ม note ใหม่ถ้ามี)
```

### วิธีทำงานต่อเนื่องข้าม session
1. ก่อนปิดงานทุกครั้ง บอก Claude (ไม่ว่า Code หรือ chat) ว่า **"อัปเดต PROJECT_NOTES.md ด้วย"**
2. Section ที่ต้องอัปเดตเสมอ: **Known Issues / Backlog** (ตาราง) — เปลี่ยน 🔴/🟡/✅ และวันที่
3. ถ้าเจอ pattern/bug ที่น่าจะเจอซ้ำ → เพิ่มลง **section 6 (Naming Pitfalls)** หรือเปิด section ใหม่
4. Commit ไฟล์นี้ไปกับ code เปลี่ยนแปลงด้วย (`git add PROJECT_NOTES.md`)

---

*Last updated: 2026-06-13 — session: pill box centering + Thai line-height fix for export*
