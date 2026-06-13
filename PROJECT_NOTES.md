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

## 5. Known Issues / Backlog (อัปเดตล่าสุด: 2026-06-13)

| Issue | สถานะ | รายละเอียด |
|---|---|---|
| Export style ไม่ตรง editor (pill → กล่องเหลี่ยม) | ✅ Fixed | วาด rounded-rect ด้วย ASS vector drawing, ดูหัวข้อ 4 — ขนาดกล่องเป็น estimate ยังไม่ pixel-perfect |
| Word timing เป็น proportional ไม่ใช่จริง | 🔴 Open | ข้อจำกัด AssemblyAI ภาษาไทย |
| Presigned URL (R2) หมดอายุ ~2hr | 🟡 Workaround | user ต้อง refresh หน้าเอง |
| `seeking to: 0` re-render loop | ✅ Fixed | แก้โดยแยก video event-listener effect |
| Word chip editor accumulate ซ้ำ | ✅ Fixed | ใช้ `word.start` เป็น key, ไม่ rebuild words ใน `updateSeg`/`saveSubtitles` |
| Subtitle segment เยอะเกินจอ (word modes) | ✅ Fixed | จัดกลุ่ม 4 คำ/segment ใน backend |
| Scale Pop ล้นจอ | ✅ Fixed | จำกัดแสดง 5 คำรอบ active word |
| BG opacity ไม่ทำงานทุก mode | ✅ Fixed | |
| Export 404 / ดาวน์โหลดวิดีโอไม่ได้ | ✅ Fixed | export endpoint ต้อง download จาก R2 ก่อน |

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

*Last updated: 2026-06-13 — session: pill/rounded box export via ASS vector drawing*
