# Cosmix — AI Video Editor

Space-themed AI video editing web app. FastAPI + Celery + PostgreSQL + Redis
backend, React + Vite + TS + Tailwind frontend. Deployed: backend on Railway,
frontend on Vercel (`cosmix-xi.vercel.app`), repo `SupakornL/cosmix`.

**Before doing anything else, read `PROJECT_NOTES.md`** — it has the full
stack/deploy details, subtitle display-mode reference, data model, and
session runbook. Update it after any significant change so future sessions
stay in sync.

## Session wrap-up (ทำทุกครั้งก่อนจบ session)

1. **อัปเดต `PROJECT_NOTES.md`** — อัปเดต Known Issues/Backlog table, เพิ่ม note ใหม่ถ้ามี
2. **อัปเดต Olympus Activity log** — เพิ่ม entry ใหม่ที่ **ด้านบนสุด** ของ `window.OLYMPUS_ACTIVITY` ใน `/Users/macintosh/olympus-system/js/agent-data.js` รูปแบบ:
   ```js
   {
     date: "YYYY-MM-DD",
     title: "Cosmix: <สรุปงานสั้นๆ>",
     desc: "<อธิบายสิ่งที่แก้/เพิ่ม>",
     tags: ["<AgentName>", "Cosmix"],
   },
   ```
   tag ของ agent: `"Hermes"` (code), `"Argus Panoptes"` (review), `"Apollo"` (research), `"Arthur"` (coordination)
3. **Commit ทั้งสองไฟล์** — commit `PROJECT_NOTES.md` ใน repo นี้ก่อน แล้ว commit `agent-data.js` ใน `/Users/macintosh/olympus-system` แยกต่างหาก
