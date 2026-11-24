from flask import Flask, request, jsonify, session, render_template, send_from_directory, abort
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3, os, re, html
from werkzeug.utils import secure_filename
from uuid import uuid4

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DATABASE_PATH") or ("/tmp/learnloop.db" if os.environ.get("VERCEL") else os.path.join(BASE_DIR, "learnloop.db"))

app = Flask(__name__, template_folder="../templates", static_folder="../static")
app.secret_key = os.environ.get("SECRET_KEY", "learnloop-local-secret-change-me")
UPLOAD_DIR = os.environ.get("UPLOAD_DIR") or ("/tmp/learnloop-uploads" if os.environ.get("VERCEL") else os.path.join(BASE_DIR, "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "webm", "mov", "m4v"}
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS profiles(
        user_id INTEGER PRIMARY KEY,
        teach_skills TEXT DEFAULT '',
        learn_skills TEXT DEFAULT '',
        bio TEXT DEFAULT '',
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS skills(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        level TEXT DEFAULT 'Beginner',
        owner_id INTEGER,
        kind TEXT DEFAULT 'catalog',
        FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS learning_sessions(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        skill TEXT NOT NULL,
        goal TEXT DEFAULT '',
        status TEXT DEFAULT 'planned',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notes(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS reflections(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS peer_exchanges(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id INTEGER NOT NULL,
        peer_id INTEGER NOT NULL,
        requester_teaches TEXT NOT NULL,
        requester_learns TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(requester_id) REFERENCES users(id),
        FOREIGN KEY(peer_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS exchange_videos(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id INTEGER NOT NULL,
        uploader_id INTEGER NOT NULL,
        skill TEXT NOT NULL,
        title TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(exchange_id) REFERENCES peer_exchanges(id),
        FOREIGN KEY(uploader_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS lesson_completions(user_id INTEGER NOT NULL, lesson_id TEXT NOT NULL, completed_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,lesson_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS exchange_completions(exchange_id INTEGER NOT NULL, user_id INTEGER NOT NULL, completed_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(exchange_id,user_id), FOREIGN KEY(exchange_id) REFERENCES peer_exchanges(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS certificates(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL, certificate_type TEXT NOT NULL, reference_id TEXT NOT NULL, title TEXT NOT NULL, issued_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,certificate_type,reference_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    """)
    count = conn.execute("SELECT COUNT(*) FROM skills WHERE kind='catalog'").fetchone()[0]
    if count == 0:
        skills = [
            ("Python","technology","Programming, automation and problem solving","Beginner"),
            ("Java","technology","Object-oriented programming and application development","Beginner"),
            ("Web Development","technology","HTML, CSS, JavaScript and modern web basics","Beginner"),
            ("React","technology","Build interactive web interfaces with React","Intermediate"),
            ("SQL","technology","Databases, queries and data management","Beginner"),
            ("Cybersecurity","technology","Security fundamentals and safe digital practices","Beginner"),
            ("UI/UX Design","design","User interface design, wireframes and user experience","Beginner"),
            ("Canva","design","Visual design, presentations and social graphics","Beginner"),
            ("Public Speaking","communication","Confidence, presentation and speaking skills","Beginner"),
            ("Content Writing","creative","Writing clear, useful and engaging content","Beginner"),
            ("Video Editing","creative","Edit videos, reels and short-form content","Beginner"),
            ("Photography","creative","Composition, lighting and mobile photography","Beginner"),
            ("Data Analytics","academic","Data cleaning, analysis and visualization","Beginner"),
            ("Machine Learning","academic","Machine learning concepts and practical models","Intermediate"),
            ("App Development","technology","Build mobile applications and interfaces","Beginner")
        ]
        conn.executemany(
            "INSERT INTO skills(name,category,description,level,kind) VALUES(?,?,?,?,?)",
            [(a,b,c,d,"catalog") for a,b,c,d in skills]
        )
    conn.commit()
    conn.close()

def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    conn = db()
    user = conn.execute("SELECT id,name,email FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    return user

@app.route("/")
def home():
    return render_template("index.html")

@app.get("/api/skills")
def skills():
    q = request.args.get("q","").strip().lower()
    category = request.args.get("category","all").strip().lower()
    conn = db()
    rows = conn.execute("""
        SELECT id,name,category,description,level,owner_id,kind
        FROM skills
        WHERE (?='' OR lower(name) LIKE ? OR lower(description) LIKE ?)
          AND (?='all' OR lower(category)=?)
        ORDER BY kind='catalog' DESC, name
    """, (q, f"%{q}%", f"%{q}%", category, category)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


def split_skills(value):
    return [part.strip() for part in (value or "").split(",") if part.strip()]

def skill_matches(items, target):
    target = (target or "").strip().lower()
    return [item for item in items if item.lower() == target or target in item.lower() or item.lower() in target]

@app.get("/api/matches")
def matches():
    user = current_user()
    if not user:
        return jsonify(success=False, message="Please log in to find peers."), 401

    mode = request.args.get("mode", "teach_me").strip().lower()
    query = request.args.get("q", "").strip().lower()
    if mode not in ("teach_me", "mutual", "teach_them"):
        mode = "teach_me"

    conn = db()
    mine = conn.execute("SELECT teach_skills, learn_skills FROM profiles WHERE user_id=?", (user["id"],)).fetchone()
    my_teach = split_skills(mine["teach_skills"] if mine else "")
    my_learn = split_skills(mine["learn_skills"] if mine else "")
    rows = conn.execute("""
        SELECT u.id, u.name, p.teach_skills, p.learn_skills, p.bio
        FROM users u JOIN profiles p ON p.user_id=u.id
        WHERE u.id != ?
        ORDER BY u.name COLLATE NOCASE
    """, (user["id"],)).fetchall()
    conn.close()

    results = []
    for row in rows:
        their_teach = split_skills(row["teach_skills"])
        their_learn = split_skills(row["learn_skills"])
        can_teach_you = []
        want_to_learn_from_you = []
        for wanted in my_learn:
            can_teach_you.extend(skill_matches(their_teach, wanted))
        for offered in my_teach:
            want_to_learn_from_you.extend(skill_matches(their_learn, offered))

        # Remove duplicate skill labels while preserving order.
        can_teach_you = list(dict.fromkeys(can_teach_you))
        want_to_learn_from_you = list(dict.fromkeys(want_to_learn_from_you))
        is_mutual = bool(can_teach_you and want_to_learn_from_you)

        if mode == "teach_me" and not can_teach_you:
            continue
        if mode == "teach_them" and not want_to_learn_from_you:
            continue
        if mode == "mutual" and not is_mutual:
            continue

        if query:
            searchable = " ".join([row["name"], row["bio"] or ""] + their_teach + their_learn).lower()
            if query not in searchable and not any(query in s.lower() for s in can_teach_you + want_to_learn_from_you):
                continue

        results.append({
            "id": row["id"],
            "name": row["name"],
            "teach_skills": their_teach,
            "learn_skills": their_learn,
            "bio": row["bio"] or "",
            "can_teach_you": can_teach_you,
            "want_to_learn_from_you": want_to_learn_from_you,
            "my_teach_match": want_to_learn_from_you,
            "mutual": is_mutual
        })
    return jsonify(success=True, matches=results, my_teach=my_teach, my_learn=my_learn)

@app.post("/api/signup")
def signup():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name","")).strip()
    email = str(data.get("email","")).strip().lower()
    password = str(data.get("password",""))
    if not name or not email or not password:
        return jsonify(success=False,message="Please fill all required fields."),400
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify(success=False,message="Enter a valid email address."),400
    if len(password) < 8:
        return jsonify(success=False,message="Password must contain at least 8 characters."),400
    conn = db()
    if conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
        conn.close()
        return jsonify(success=False,message="An account with this email already exists."),409
    cur = conn.execute("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)",
                       (name,email,generate_password_hash(password)))
    uid = cur.lastrowid
    conn.execute("INSERT INTO profiles(user_id) VALUES(?)",(uid,))
    conn.commit(); conn.close()
    session["user_id"] = uid
    return jsonify(success=True,message="Account created successfully!",user={"id":uid,"name":name,"email":email})

@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email","")).strip().lower()
    password = str(data.get("password",""))
    conn = db()
    user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    conn.close()
    if not user or not check_password_hash(user["password_hash"],password):
        return jsonify(success=False,message="Invalid email or password."),401
    session["user_id"] = user["id"]
    return jsonify(success=True,message="Login successful!",user={"id":user["id"],"name":user["name"],"email":user["email"]})

@app.get("/api/me")
def me():
    user = current_user()
    if not user:
        return jsonify(logged_in=False)
    conn=db()
    profile=conn.execute("SELECT * FROM profiles WHERE user_id=?",(user["id"],)).fetchone()
    conn.close()
    return jsonify(logged_in=True,user=dict(user),profile=dict(profile) if profile else {})

@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(success=True,message="Logged out successfully.")

@app.post("/api/profile")
def save_profile():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    data=request.get_json(silent=True) or {}
    conn=db()
    conn.execute("""INSERT INTO profiles(user_id,teach_skills,learn_skills,bio)
                    VALUES(?,?,?,?)
                    ON CONFLICT(user_id) DO UPDATE SET
                    teach_skills=excluded.teach_skills,
                    learn_skills=excluded.learn_skills,
                    bio=excluded.bio""",
                 (user["id"],str(data.get("teach_skills","")).strip(),
                  str(data.get("learn_skills","")).strip(),str(data.get("bio","")).strip()))
    conn.commit(); conn.close()
    return jsonify(success=True,message="Profile saved successfully.")

@app.post("/api/sessions")
def create_session():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    data=request.get_json(silent=True) or {}
    skill=str(data.get("skill","")).strip()
    goal=str(data.get("goal","")).strip()
    if not skill: return jsonify(success=False,message="Enter a session skill."),400
    conn=db()
    cur=conn.execute("INSERT INTO learning_sessions(user_id,skill,goal) VALUES(?,?,?)",(user["id"],skill,goal))
    conn.commit(); sid=cur.lastrowid; conn.close()
    return jsonify(success=True,message="Learning session created.",id=sid)

@app.post("/api/notes")
def save_note():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    content=str((request.get_json(silent=True) or {}).get("content","")).strip()
    if not content: return jsonify(success=False,message="Write a note first."),400
    conn=db(); conn.execute("INSERT INTO notes(user_id,content) VALUES(?,?)",(user["id"],content)); conn.commit(); conn.close()
    return jsonify(success=True,message="Notes saved successfully.")

@app.post("/api/reflections")
def save_reflection():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    content=str((request.get_json(silent=True) or {}).get("content","")).strip()
    if not content: return jsonify(success=False,message="Write your reflection first."),400
    conn=db(); conn.execute("INSERT INTO reflections(user_id,content) VALUES(?,?)",(user["id"],content)); conn.commit(); conn.close()
    return jsonify(success=True,message="Reflection saved successfully.")

@app.get("/api/dashboard")
def dashboard():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db()
    p=conn.execute("SELECT * FROM profiles WHERE user_id=?",(user["id"],)).fetchone()
    sessions=conn.execute("SELECT COUNT(*) FROM learning_sessions WHERE user_id=?",(user["id"],)).fetchone()[0]
    notes=conn.execute("SELECT COUNT(*) FROM notes WHERE user_id=?",(user["id"],)).fetchone()[0]
    reflections=conn.execute("SELECT COUNT(*) FROM reflections WHERE user_id=?",(user["id"],)).fetchone()[0]
    conn.close()
    teach=[x.strip() for x in (p["teach_skills"] if p else "").split(",") if x.strip()]
    learn=[x.strip() for x in (p["learn_skills"] if p else "").split(",") if x.strip()]
    return jsonify(success=True,name=user["name"],teachCount=len(teach),learnCount=len(learn),
                   sessions=sessions,notes=notes,reflections=reflections,teachSkills=teach,learnSkills=learn)


def exchange_for_user(conn, exchange_id, user_id):
    return conn.execute("""SELECT * FROM peer_exchanges WHERE id=? AND
        (requester_id=? OR peer_id=?)""", (exchange_id,user_id,user_id)).fetchone()

@app.post("/api/exchanges")
def create_exchange():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    data=request.get_json(silent=True) or {}
    try: peer_id=int(data.get("peer_id"))
    except (TypeError,ValueError): return jsonify(success=False,message="Choose a valid peer."),400
    teaches=str(data.get("teaches"," ")).strip()
    learns=str(data.get("learns"," ")).strip()
    if not teaches or not learns: return jsonify(success=False,message="Choose both skills for the exchange."),400
    if peer_id==user["id"]: return jsonify(success=False,message="You cannot start an exchange with yourself."),400
    conn=db()
    peer=conn.execute("SELECT id FROM users WHERE id=?",(peer_id,)).fetchone()
    if not peer: conn.close(); return jsonify(success=False,message="Student not found."),404
    existing=conn.execute("""SELECT id FROM peer_exchanges WHERE
        ((requester_id=? AND peer_id=?) OR (requester_id=? AND peer_id=?)) AND status IN ('pending','accepted')""",
        (user["id"],peer_id,peer_id,user["id"])).fetchone()
    if existing: conn.close(); return jsonify(success=False,message="An exchange request already exists with this student."),409
    cur=conn.execute("INSERT INTO peer_exchanges(requester_id,peer_id,requester_teaches,requester_learns) VALUES(?,?,?,?)",
                     (user["id"],peer_id,teaches,learns))
    conn.commit(); eid=cur.lastrowid; conn.close()
    return jsonify(success=True,message="Skill exchange request sent! The other student must accept before videos can be shared.",id=eid)

@app.get("/api/exchanges")
def list_exchanges():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db()
    rows=conn.execute("""SELECT e.*, a.name AS requester_name, b.name AS peer_name
        FROM peer_exchanges e JOIN users a ON a.id=e.requester_id JOIN users b ON b.id=e.peer_id
        WHERE e.requester_id=? OR e.peer_id=? ORDER BY e.created_at DESC""",(user["id"],user["id"])).fetchall()
    result=[]
    for row in rows:
        item=dict(row); item["is_requester"]=(row["requester_id"]==user["id"])
        vids=conn.execute("SELECT id,uploader_id,skill,title,original_name,created_at FROM exchange_videos WHERE exchange_id=? ORDER BY created_at DESC",(row["id"],)).fetchall()
        item["videos"]=[dict(v) for v in vids]
        result.append(item)
    conn.close(); return jsonify(success=True,exchanges=result)

@app.post("/api/exchanges/<int:exchange_id>/respond")
def respond_exchange(exchange_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    action=str((request.get_json(silent=True) or {}).get("action",""))
    if action not in ("accept","reject"): return jsonify(success=False,message="Choose accept or reject."),400
    conn=db(); ex=conn.execute("SELECT * FROM peer_exchanges WHERE id=?",(exchange_id,)).fetchone()
    if not ex: conn.close(); return jsonify(success=False,message="Exchange not found."),404
    if ex["peer_id"]!=user["id"]: conn.close(); return jsonify(success=False,message="Only the invited student can respond."),403
    if ex["status"]!="pending": conn.close(); return jsonify(success=False,message="This request has already been answered."),409
    status="accepted" if action=="accept" else "rejected"
    conn.execute("UPDATE peer_exchanges SET status=? WHERE id=?",(status,exchange_id)); conn.commit(); conn.close()
    return jsonify(success=True,message="Exchange accepted. You can now share videos." if action=="accept" else "Exchange request declined.")

@app.post("/api/exchanges/<int:exchange_id>/videos")
def upload_exchange_video(exchange_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    video=request.files.get("video")
    title=request.form.get("title","").strip()
    skill=request.form.get("skill","").strip()
    if not video or not video.filename: return jsonify(success=False,message="Choose a video file first."),400
    if not title or not skill: return jsonify(success=False,message="Enter a video title and skill."),400
    original=secure_filename(video.filename)
    ext=original.rsplit(".",1)[-1].lower() if "." in original else ""
    if ext not in ALLOWED_VIDEO_EXTENSIONS: return jsonify(success=False,message="Use MP4, WEBM, MOV or M4V video files."),400
    conn=db(); ex=exchange_for_user(conn,exchange_id,user["id"])
    if not ex: conn.close(); return jsonify(success=False,message="Exchange not found."),404
    if ex["status"]!="accepted": conn.close(); return jsonify(success=False,message="The other student must accept the exchange before videos can be uploaded."),403
    filename=f"exchange_{exchange_id}_{user['id']}_{uuid4().hex}.{ext}"
    try:
        video.save(os.path.join(UPLOAD_DIR,filename))
        conn.execute("INSERT INTO exchange_videos(exchange_id,uploader_id,skill,title,filename,original_name) VALUES(?,?,?,?,?,?)",
                     (exchange_id,user["id"],skill,title,filename,original))
        conn.commit()
    except Exception:
        try: os.remove(os.path.join(UPLOAD_DIR,filename))
        except OSError: pass
        conn.close(); raise
    conn.close(); return jsonify(success=True,message="Video uploaded to your private skill exchange.")

@app.get("/api/exchanges/<int:exchange_id>/videos/<int:video_id>")
def watch_exchange_video(exchange_id,video_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db(); ex=exchange_for_user(conn,exchange_id,user["id"])
    video=conn.execute("SELECT filename FROM exchange_videos WHERE id=? AND exchange_id=?",(video_id,exchange_id)).fetchone() if ex and ex["status"]=="accepted" else None
    conn.close()
    if not video: abort(404)
    return send_from_directory(UPLOAD_DIR,video["filename"],conditional=True)


BASIC_LESSON_IDS = {"html","python","sql","security","passwords","figma","canva","speaking","communication"}
def issue_certificate(conn, uid, ctype, refid, title):
    old=conn.execute("SELECT code FROM certificates WHERE user_id=? AND certificate_type=? AND reference_id=?",(uid,ctype,str(refid))).fetchone()
    if old: return old["code"]
    code="LL-"+uuid.uuid4().hex[:4].upper()+"-"+uuid.uuid4().hex[:4].upper()
    conn.execute("INSERT INTO certificates(code,user_id,certificate_type,reference_id,title) VALUES(?,?,?,?,?)",(code,uid,ctype,str(refid),title))
    return code

@app.post("/api/lessons/<lesson_id>/complete")
def complete_basic_lesson(lesson_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Log in to save certificate progress."),401
    if lesson_id not in BASIC_LESSON_IDS: return jsonify(success=False,message="Unknown lesson."),404
    conn=db(); conn.execute("INSERT OR IGNORE INTO lesson_completions(user_id,lesson_id) VALUES(?,?)",(user["id"],lesson_id)); conn.commit()
    count=conn.execute("SELECT COUNT(*) FROM lesson_completions WHERE user_id=?",(user["id"],)).fetchone()[0]
    code=issue_certificate(conn,user["id"],"basics","all-lessons","LearnLoop Learn Basics Certificate") if count>=len(BASIC_LESSON_IDS) else None
    conn.commit(); conn.close()
    return jsonify(success=True,completed=count,total=len(BASIC_LESSON_IDS),certificate_code=code,message="Lesson progress saved to your account.")

@app.get("/api/certificates")
def my_certificates():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db(); rows=conn.execute("SELECT code,certificate_type,title,issued_at FROM certificates WHERE user_id=? ORDER BY issued_at DESC",(user["id"],)).fetchall()
    count=conn.execute("SELECT COUNT(*) FROM lesson_completions WHERE user_id=?",(user["id"],)).fetchone()[0]; conn.close()
    return jsonify(success=True,certificates=[dict(r) for r in rows],basics_completed=count,total_basics=len(BASIC_LESSON_IDS))

@app.post("/api/exchanges/<int:exchange_id>/complete")
def complete_exchange(exchange_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db(); ex=exchange_for_user(conn,exchange_id,user["id"])
    if not ex or ex["status"]!="accepted": conn.close(); return jsonify(success=False,message="Accepted exchange not found."),404
    contributors=conn.execute("SELECT COUNT(DISTINCT uploader_id) FROM exchange_videos WHERE exchange_id=?",(exchange_id,)).fetchone()[0]
    if contributors<2: conn.close(); return jsonify(success=False,message="Both students must upload a video first."),400
    conn.execute("INSERT OR IGNORE INTO exchange_completions(exchange_id,user_id) VALUES(?,?)",(exchange_id,user["id"])); conn.commit()
    done=conn.execute("SELECT COUNT(*) FROM exchange_completions WHERE exchange_id=?",(exchange_id,)).fetchone()[0]
    if done>=2:
        # Each learner's certificate names the course/skill they learned.
        issue_certificate(conn,ex["requester_id"],"peer_exchange",exchange_id,
                          str(ex["requester_learns"]).strip() + " Course")
        issue_certificate(conn,ex["peer_id"],"peer_exchange",exchange_id,
                          str(ex["requester_teaches"]).strip() + " Course")
    conn.commit(); conn.close()
    return jsonify(success=True,completed_by=done,certificate_ready=done>=2,message="Your completion is recorded. Waiting for the other student." if done<2 else "Both students completed the exchange. Certificates are ready!")

@app.get("/certificate/<code>")
def view_certificate(code):
    conn=db()
    row=conn.execute("SELECT c.*,u.name FROM certificates c JOIN users u ON u.id=c.user_id WHERE c.code=?",(code,)).fetchone()
    conn.close()
    if not row: return "Certificate not found.",404
    name=html.escape(row["name"])
    course=html.escape(row["title"])
    issued=html.escape(str(row["issued_at"]))
    cert_code=html.escape(row["code"])
    verify_url=request.host_url.rstrip("/")+"/verify/"+row["code"]
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LearnLoop Certificate</title>
    <style>
    *{{box-sizing:border-box}}body{{margin:0;padding:34px;background:#f1f1f1;color:#202020;font-family:Georgia,'Times New Roman',serif}}
    .certificate{{position:relative;max-width:1050px;min-height:720px;margin:0 auto;background:#fff;padding:18px;border:1px solid #b8a16a;box-shadow:0 8px 30px rgba(0,0,0,.08)}}
    .inner{{min-height:682px;border:5px double #9b8248;padding:58px 70px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}}
    .brand{{font-family:Arial,sans-serif;font-size:19px;letter-spacing:7px;font-weight:700;color:#34445b;margin-bottom:24px}}
    .rule{{width:120px;border-top:2px solid #b49a5c;margin:12px auto 25px}}
    .eyebrow{{font:12px Arial,sans-serif;letter-spacing:4px;text-transform:uppercase;color:#777}}
    h1{{font-size:49px;font-weight:normal;letter-spacing:1px;color:#26364b;margin:12px 0 24px}}
    .presented{{font-size:17px;color:#555;margin:0 0 16px}}
    .student{{font-size:37px;font-weight:normal;color:#202b3a;border-bottom:1px solid #b49a5c;padding:0 30px 13px;min-width:360px;margin:0 0 24px}}
    .completion{{font-size:17px;color:#555;margin:0 0 12px}}
    .course{{font-size:29px;font-weight:bold;color:#26364b;margin:0 0 30px}}
    .date{{font:13px Arial,sans-serif;color:#666;margin:5px}}
    .certificate-id{{font:12px Arial,sans-serif;color:#444;letter-spacing:1px;margin-top:16px}}
    .verification{{font:11px Arial,sans-serif;color:#777;margin-top:9px;word-break:break-all}}
    button{{display:block;margin:22px auto 0;padding:12px 24px;background:#26364b;color:white;border:0;border-radius:3px;font:14px Arial,sans-serif;cursor:pointer}}
    @media(max-width:650px){{body{{padding:8px}}.certificate{{padding:8px}}.inner{{padding:32px 16px;min-height:620px}}h1{{font-size:35px}}.student{{font-size:28px;min-width:0;width:100%}}.course{{font-size:23px}}}}
    @media print{{body{{background:#fff;padding:0}}.certificate{{max-width:none;min-height:100vh;margin:0;box-shadow:none;border:1px solid #b8a16a;break-inside:avoid}}.inner{{min-height:calc(100vh - 36px)}}button{{display:none}}}}
    </style></head><body><main class="certificate"><section class="inner">
    <div class="brand">LEARNLOOP</div><div class="rule"></div>
    <div class="eyebrow">Certificate of Completion</div><h1>Certificate</h1>
    <p class="presented">This is to certify that</p><div class="student">{name}</div>
    <p class="completion">has successfully completed the course</p><h2 class="course">{course}</h2>
    <div class="rule"></div><p class="date">Date of completion: {issued}</p>
    <div class="certificate-id">CERTIFICATE ID: {cert_code}</div>
    <div class="verification">Verify authenticity: {html.escape(verify_url)}</div>
    </section></main><button onclick="window.print()">Print / Save as PDF</button></body></html>"""
@app.get("/verify/<code>")
def verify_certificate(code):
    conn=db(); row=conn.execute("SELECT c.code,c.title,c.issued_at,u.name FROM certificates c JOIN users u ON u.id=c.user_id WHERE c.code=?",(code,)).fetchone(); conn.close()
    if not row: return jsonify(valid=False,message="Certificate code not found."),404
    return jsonify(valid=True,certificate=dict(row),message="Valid LearnLoop certificate.")

init_db()  # Initialize tables when the serverless function imports this module.

if __name__=="__main__":
    app.run(host="127.0.0.1",port=5000,debug=True)
