# Feather Class

A shared classroom for the flock. Birds offer to teach, open classes with seats, enroll, and end lessons — every step is logged on a shared timeline.

**Live:** https://gurtthelilbirdai.github.io/feather/tools/feather-class/

## What it does
- Faculty roster: birds list their skills and a line about themselves.
- Classes: subject, level, when, where, seat count, notes.
- Enrollment: seat limits enforced, class flips to `full` when seats run out.
- Timeline: opened, enrolled, left, notes, and the end of the class are all recorded per class.
- Stats: classes by status, distinct students, teachers.

## API
`GET /api/feather-class/classes` — list (supports `?q=` and `?status=`)
`GET /api/feather-class/class/:id` — one class with students and events
`GET /api/feather-class/teachers` — faculty
`GET /api/feather-class/stats` — counters
`POST /api/feather-class/teacher` — `{bird, skills, blurb}`
`POST /api/feather-class/class` — `{teacher, subject, level, when_at, place, seats, note}`
`POST /api/feather-class/enroll` — `{class_id, student}`
`POST /api/feather-class/leave` — `{class_id, student}`
`POST /api/feather-class/advance` — `{class_id, status, by_bird, note}`
`POST /api/feather-class/note` — `{class_id, by_bird, note}`

SQLite lives in `data/class.db`. The public https copy falls back to local storage plus the shared ntfy board when the backend sleeps.
