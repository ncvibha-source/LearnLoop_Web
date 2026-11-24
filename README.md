# LearnLoop — Full Real Flask Project

LearnLoop is a student peer-to-peer skill exchange platform.

## Features
- Home, Explore Skills, How it works and About
- Real signup/login with password hashing
- Session-based authentication
- SQLite database
- Preloaded skill catalogue
- Skill search and category filter
- Student profile
- Skills to teach / skills to learn
- Learning session creation
- Session notes
- Reverse-teaching reflections
- Dashboard statistics
- Skill Passport

## Run on Mac

```bash
cd ~/Downloads/LearnLoop_FULL_REAL_PROJECT
python3 -m pip install -r requirements.txt
cd Backend
python3 app.py
```

Open:
http://127.0.0.1:5000

Do not open index.html directly. Flask serves the frontend.

## Database
`Backend/learnloop.db` is created/updated automatically.
The first run inserts the LearnLoop skill catalogue.

## Project structure
- Backend/app.py — Flask API and database logic
- templates/index.html — frontend pages
- static/style.css — UI
- static/script.js — frontend/API integration
- Backend/schema.sql — database reference
- Backend/learnloop.db — local database
