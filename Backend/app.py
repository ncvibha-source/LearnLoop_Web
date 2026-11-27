from flask import Flask, request, jsonify, session, render_template, send_from_directory, abort
from werkzeug.security import generate_password_hash, check_password_hash
import os, re, html
import psycopg2
from psycopg2.extras import DictCursor
from werkzeug.utils import secure_filename
from uuid import uuid4

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not configured. Add your Supabase PostgreSQL connection string in Vercel Environment Variables.")

app = Flask(__name__, template_folder="../templates", static_folder="../static")
app.secret_key = os.environ.get("SECRET_KEY")
if not app.secret_key:
    raise RuntimeError("SECRET_KEY is not configured. Add a secure SECRET_KEY in Vercel Environment Variables.")
UPLOAD_DIR = os.environ.get("UPLOAD_DIR") or ("/tmp/learnloop-uploads" if os.environ.get("VERCEL") else os.path.join(BASE_DIR, "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "webm", "mov", "m4v"}
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

class DatabaseConnection:
    """Small compatibility wrapper around PostgreSQL for LearnLoop queries."""
    def __init__(self):
        self.connection = psycopg2.connect(DATABASE_URL, cursor_factory=DictCursor, sslmode="require", connect_timeout=10)

    def execute(self, sql, params=None):
        cursor = self.connection.cursor()
        cursor.execute(sql.replace("?", "%s"), params or ())
        return cursor

    def executemany(self, sql, params):
        cursor = self.connection.cursor()
        cursor.executemany(sql.replace("?", "%s"), params)
        return cursor

    def commit(self):
        self.connection.commit()

    def close(self):
        self.connection.close()


def db():
    return DatabaseConnection()


def init_db():
    # All tables are created once in Supabase using Backend/schema.sql.
    conn = db()
    count = conn.execute("SELECT COUNT(*) FROM ll_skills WHERE kind='catalog'").fetchone()[0]
    if count == 0:
        ll_skills = [
            ("Python","technology","Programming, automation and problem solving","Beginner"),
            ("Java","technology","Object-oriented programming and application development","Beginner"),
            ("Web Development","technology","HTML, CSS, JavaScript and modern web basics","Beginner"),
            ("React","technology","Build interactive web interfaces with React","Intermediate"),
            ("SQL","technology","Databases, queries and data management","Beginner"),
            ("Cybersecurity","technology","Security fundamentals and safe digital practices","Beginner"),
            ("UI/UX Design","design","User interface design, wireframes and user experience","Beginner"),
            ("Canva","design","Visual design, presentations and social graphics","Beginner"),
            ("Public Speaking","communication","Confidence, presentation and speaking ll_skills","Beginner"),
            ("Content Writing","creative","Writing clear, useful and engaging content","Beginner"),
            ("Video Editing","creative","Edit videos, reels and short-form content","Beginner"),
            ("Photography","creative","Composition, lighting and mobile photography","Beginner"),
            ("Data Analytics","academic","Data cleaning, analysis and visualization","Beginner"),
            ("Machine Learning","academic","Machine learning concepts and practical models","Intermediate"),
            ("App Development","technology","Build mobile applications and interfaces","Beginner")
        ]
        conn.executemany(
            "INSERT INTO ll_skills(name,category,description,level,kind) VALUES(?,?,?,?,?)",
            [(a,b,c,d,"catalog") for a,b,c,d in ll_skills]
        )
    conn.commit()
    conn.close()


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    conn = db()
    user = conn.execute("SELECT id,name,email FROM ll_users WHERE id=?", (uid,)).fetchone()
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
        FROM ll_skills
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
    mine = conn.execute("SELECT teach_skills, learn_skills FROM ll_profiles WHERE user_id=?", (user["id"],)).fetchone()
    my_teach = split_skills(mine["teach_skills"] if mine else "")
    my_learn = split_skills(mine["learn_skills"] if mine else "")
    rows = conn.execute("""
        SELECT u.id, u.name, p.teach_skills, p.learn_skills, p.bio
        FROM ll_users u JOIN ll_profiles p ON p.user_id=u.id
        WHERE u.id != ?
        ORDER BY LOWER(u.name)
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
    if conn.execute("SELECT id FROM ll_users WHERE email=?", (email,)).fetchone():
        conn.close()
        return jsonify(success=False,message="An account with this email already exists."),409
    cur = conn.execute("INSERT INTO ll_users(name,email,password_hash) VALUES(?,?,?) RETURNING id",
                       (name,email,generate_password_hash(password)))
    uid = cur.fetchone()[0]
    conn.execute("INSERT INTO ll_profiles(user_id) VALUES(?)",(uid,))
    conn.commit(); conn.close()
    session["user_id"] = uid
    return jsonify(success=True,message="Account created successfully!",user={"id":uid,"name":name,"email":email})

@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email","")).strip().lower()
    password = str(data.get("password",""))
    conn = db()
    user = conn.execute("SELECT * FROM ll_users WHERE email=?", (email,)).fetchone()
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
    profile=conn.execute("SELECT * FROM ll_profiles WHERE user_id=?",(user["id"],)).fetchone()
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
    conn.execute("""INSERT INTO ll_profiles(user_id,teach_skills,learn_skills,bio)
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
    cur=conn.execute("INSERT INTO ll_learning_sessions(user_id,skill,goal) VALUES(?,?,?) RETURNING id",(user["id"],skill,goal))
    sid=cur.fetchone()[0]
    conn.commit(); conn.close()
    return jsonify(success=True,message="Learning session created.",id=sid)

@app.post("/api/notes")
def save_note():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    content=str((request.get_json(silent=True) or {}).get("content","")).strip()
    if not content: return jsonify(success=False,message="Write a note first."),400
    conn=db(); conn.execute("INSERT INTO ll_notes(user_id,content) VALUES(?,?)",(user["id"],content)); conn.commit(); conn.close()
    return jsonify(success=True,message="Notes saved successfully.")

@app.post("/api/reflections")
def save_reflection():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    content=str((request.get_json(silent=True) or {}).get("content","")).strip()
    if not content: return jsonify(success=False,message="Write your reflection first."),400
    conn=db(); conn.execute("INSERT INTO ll_reflections(user_id,content) VALUES(?,?)",(user["id"],content)); conn.commit(); conn.close()
    return jsonify(success=True,message="Reflection saved successfully.")

@app.get("/api/dashboard")
def dashboard():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db()
    p=conn.execute("SELECT * FROM ll_profiles WHERE user_id=?",(user["id"],)).fetchone()
    sessions=conn.execute("SELECT COUNT(*) FROM ll_learning_sessions WHERE user_id=?",(user["id"],)).fetchone()[0]
    ll_notes=conn.execute("SELECT COUNT(*) FROM ll_notes WHERE user_id=?",(user["id"],)).fetchone()[0]
    ll_reflections=conn.execute("SELECT COUNT(*) FROM ll_reflections WHERE user_id=?",(user["id"],)).fetchone()[0]
    conn.close()
    teach=[x.strip() for x in (p["teach_skills"] if p else "").split(",") if x.strip()]
    learn=[x.strip() for x in (p["learn_skills"] if p else "").split(",") if x.strip()]
    return jsonify(success=True,name=user["name"],teachCount=len(teach),learnCount=len(learn),
                   sessions=sessions,ll_notes=ll_notes,ll_reflections=ll_reflections,teachSkills=teach,learnSkills=learn)


def exchange_for_user(conn, exchange_id, user_id):
    return conn.execute("""SELECT * FROM ll_peer_exchanges WHERE id=? AND
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
    if not teaches or not learns: return jsonify(success=False,message="Choose both ll_skills for the exchange."),400
    if peer_id==user["id"]: return jsonify(success=False,message="You cannot start an exchange with yourself."),400
    conn=db()
    peer=conn.execute("SELECT id FROM ll_users WHERE id=?",(peer_id,)).fetchone()
    if not peer: conn.close(); return jsonify(success=False,message="Student not found."),404
    existing=conn.execute("""SELECT id FROM ll_peer_exchanges WHERE
        ((requester_id=? AND peer_id=?) OR (requester_id=? AND peer_id=?)) AND status IN ('pending','accepted')""",
        (user["id"],peer_id,peer_id,user["id"])).fetchone()
    if existing: conn.close(); return jsonify(success=False,message="An exchange request already exists with this student."),409
    cur=conn.execute("INSERT INTO ll_peer_exchanges(requester_id,peer_id,requester_teaches,requester_learns) VALUES(?,?,?,?) RETURNING id",
                     (user["id"],peer_id,teaches,learns))
    eid=cur.fetchone()[0]
    conn.commit(); conn.close()
    return jsonify(success=True,message="Skill exchange request sent! The other student must accept before videos can be shared.",id=eid)

@app.get("/api/exchanges")
def list_exchanges():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db()
    rows=conn.execute("""SELECT e.*, a.name AS requester_name, b.name AS peer_name
        FROM ll_peer_exchanges e JOIN ll_users a ON a.id=e.requester_id JOIN ll_users b ON b.id=e.peer_id
        WHERE e.requester_id=? OR e.peer_id=? ORDER BY e.created_at DESC""",(user["id"],user["id"])).fetchall()
    result=[]
    for row in rows:
        item=dict(row); item["is_requester"]=(row["requester_id"]==user["id"])
        vids=conn.execute("SELECT id,uploader_id,skill,title,original_name,created_at FROM ll_exchange_videos WHERE exchange_id=? ORDER BY created_at DESC",(row["id"],)).fetchall()
        item["videos"]=[]
        for video_row in vids:
            video_item=dict(video_row)
            video_item["is_uploader"]=(video_row["uploader_id"]==user["id"])
            highlights=conn.execute("""SELECT id,timestamp_seconds,title,description FROM ll_video_highlights
                WHERE video_id=? ORDER BY timestamp_seconds,id""",(video_row["id"],)).fetchall()
            video_item["highlights"]=[dict(h) for h in highlights]
            item["videos"].append(video_item)
        result.append(item)
    conn.close(); return jsonify(success=True,exchanges=result)

@app.post("/api/exchanges/<int:exchange_id>/respond")
def respond_exchange(exchange_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    action=str((request.get_json(silent=True) or {}).get("action",""))
    if action not in ("accept","reject"): return jsonify(success=False,message="Choose accept or reject."),400
    conn=db(); ex=conn.execute("SELECT * FROM ll_peer_exchanges WHERE id=?",(exchange_id,)).fetchone()
    if not ex: conn.close(); return jsonify(success=False,message="Exchange not found."),404
    if ex["peer_id"]!=user["id"]: conn.close(); return jsonify(success=False,message="Only the invited student can respond."),403
    if ex["status"]!="pending": conn.close(); return jsonify(success=False,message="This request has already been answered."),409
    status="accepted" if action=="accept" else "rejected"
    conn.execute("UPDATE ll_peer_exchanges SET status=? WHERE id=?",(status,exchange_id)); conn.commit(); conn.close()
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
    existing=conn.execute("SELECT id FROM ll_exchange_videos WHERE exchange_id=? AND uploader_id=?",(exchange_id,user["id"])).fetchone()
    if existing:
        conn.close()
        return jsonify(success=False,message="You have already uploaded your video for this exchange. Each student can upload one video."),409
    filename=f"exchange_{exchange_id}_{user['id']}_{uuid4().hex}.{ext}"
    try:
        video.save(os.path.join(UPLOAD_DIR,filename))
        conn.execute("INSERT INTO ll_exchange_videos(exchange_id,uploader_id,skill,title,filename,original_name) VALUES(?,?,?,?,?,?)",
                     (exchange_id,user["id"],skill,title,filename,original))
        conn.commit()
    except Exception:
        try: os.remove(os.path.join(UPLOAD_DIR,filename))
        except OSError: pass
        conn.close(); raise
    conn.close(); return jsonify(success=True,message="Video uploaded to your private skill exchange.")

@app.post("/api/exchanges/<int:exchange_id>/videos/<int:video_id>/highlights")
def create_video_highlight(exchange_id, video_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    data=request.get_json(silent=True) or {}
    title=str(data.get("title","")).strip()
    description=str(data.get("description","")).strip()
    try: timestamp=int(data.get("timestamp_seconds"))
    except (TypeError,ValueError): return jsonify(success=False,message="Enter a valid timestamp in seconds."),400
    if timestamp<0: return jsonify(success=False,message="Timestamp cannot be negative."),400
    if not title or len(title)>100: return jsonify(success=False,message="Enter a highlight title (up to 100 characters)."),400
    if len(description)>300: return jsonify(success=False,message="Description must be 300 characters or fewer."),400
    conn=db()
    ex=exchange_for_user(conn,exchange_id,user["id"])
    video=conn.execute("SELECT id,uploader_id FROM ll_exchange_videos WHERE id=? AND exchange_id=?",(video_id,exchange_id)).fetchone()
    if not ex or ex["status"]!="accepted" or not video:
        conn.close(); return jsonify(success=False,message="Video not found in an accepted exchange."),404
    if video["uploader_id"]!=user["id"]:
        conn.close(); return jsonify(success=False,message="Only the video uploader can manage its highlights."),403
    cur=conn.execute("""INSERT INTO ll_video_highlights(video_id,timestamp_seconds,title,description)
        VALUES(?,?,?,?) RETURNING id""",(video_id,timestamp,title,description))
    highlight_id=cur.fetchone()[0]
    conn.commit(); conn.close()
    return jsonify(success=True,id=highlight_id,message="Video highlight added.")

@app.put("/api/exchanges/<int:exchange_id>/videos/<int:video_id>/highlights/<int:highlight_id>")
def update_video_highlight(exchange_id, video_id, highlight_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    data=request.get_json(silent=True) or {}
    title=str(data.get("title","")).strip()
    description=str(data.get("description","")).strip()
    try: timestamp=int(data.get("timestamp_seconds"))
    except (TypeError,ValueError): return jsonify(success=False,message="Enter a valid timestamp in seconds."),400
    if timestamp<0 or not title or len(title)>100 or len(description)>300:
        return jsonify(success=False,message="Check the highlight title, timestamp and description."),400
    conn=db()
    video=conn.execute("""SELECT v.uploader_id FROM ll_exchange_videos v JOIN ll_peer_exchanges e ON e.id=v.exchange_id
        WHERE v.id=? AND v.exchange_id=? AND e.status='accepted' AND (e.requester_id=? OR e.peer_id=?)""",
        (video_id,exchange_id,user["id"],user["id"])).fetchone()
    if not video: conn.close(); return jsonify(success=False,message="Video not found."),404
    if video["uploader_id"]!=user["id"]: conn.close(); return jsonify(success=False,message="Only the uploader can edit highlights."),403
    cur=conn.execute("""UPDATE ll_video_highlights SET timestamp_seconds=?,title=?,description=?
        WHERE id=? AND video_id=?""",(timestamp,title,description,highlight_id,video_id))
    if cur.rowcount==0: conn.close(); return jsonify(success=False,message="Highlight not found."),404
    conn.commit(); conn.close()
    return jsonify(success=True,message="Highlight updated.")

@app.delete("/api/exchanges/<int:exchange_id>/videos/<int:video_id>/highlights/<int:highlight_id>")
def delete_video_highlight(exchange_id, video_id, highlight_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db()
    video=conn.execute("""SELECT v.uploader_id FROM ll_exchange_videos v JOIN ll_peer_exchanges e ON e.id=v.exchange_id
        WHERE v.id=? AND v.exchange_id=? AND e.status='accepted' AND (e.requester_id=? OR e.peer_id=?)""",
        (video_id,exchange_id,user["id"],user["id"])).fetchone()
    if not video: conn.close(); return jsonify(success=False,message="Video not found."),404
    if video["uploader_id"]!=user["id"]: conn.close(); return jsonify(success=False,message="Only the uploader can delete highlights."),403
    cur=conn.execute("DELETE FROM ll_video_highlights WHERE id=? AND video_id=?",(highlight_id,video_id))
    if cur.rowcount==0: conn.close(); return jsonify(success=False,message="Highlight not found."),404
    conn.commit(); conn.close()
    return jsonify(success=True,message="Highlight deleted.")


@app.get("/api/exchanges/<int:exchange_id>/videos/<int:video_id>")
def watch_exchange_video(exchange_id,video_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db(); ex=exchange_for_user(conn,exchange_id,user["id"])
    video=conn.execute("SELECT filename FROM ll_exchange_videos WHERE id=? AND exchange_id=?",(video_id,exchange_id)).fetchone() if ex and ex["status"]=="accepted" else None
    conn.close()
    if not video: abort(404)
    return send_from_directory(UPLOAD_DIR,video["filename"],conditional=True)


BASIC_LESSON_IDS = {"html","python","sql","security","passwords","figma","canva","speaking","communication"}
def issue_certificate(conn, uid, ctype, refid, title):
    old=conn.execute("SELECT code FROM ll_certificates WHERE user_id=? AND certificate_type=? AND reference_id=?",(uid,ctype,str(refid))).fetchone()
    if old: return old["code"]
    code="LL-"+uuid4().hex[:4].upper()+"-"+uuid4().hex[:4].upper()
    conn.execute("INSERT INTO ll_certificates(code,user_id,certificate_type,reference_id,title) VALUES(?,?,?,?,?)",(code,uid,ctype,str(refid),title))
    return code

@app.post("/api/lessons/<lesson_id>/complete")
def complete_basic_lesson(lesson_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Log in to save course progress and receive a certificate."),401
    lesson_titles = {
        "html": "HTML: Build your first web page",
        "python": "Python: Variables, data and control flow",
        "sql": "SQL: Tables, queries and relationships",
        "security": "Cybersecurity: Threats and safe practices",
        "passwords": "Strong passwords, password managers and MFA",
        "figma": "UI/UX: User research, wireframes and usability",
        "canva": "Visual design: Layout, typography and contrast",
        "speaking": "Public speaking: Plan, present and improve",
        "communication": "Communication: Listening, questions and feedback"
    }
    if lesson_id not in lesson_titles:
        return jsonify(success=False,message="Unknown course."),404
    conn=db()
    conn.execute("INSERT INTO ll_lesson_completions(user_id,lesson_id) VALUES(?,?) ON CONFLICT(user_id,lesson_id) DO NOTHING",(user["id"],lesson_id))
    course_code=issue_certificate(conn,user["id"],"basic_course",lesson_id,lesson_titles[lesson_id])
    count=conn.execute("SELECT COUNT(*) FROM ll_lesson_completions WHERE user_id=?",(user["id"],)).fetchone()[0]
    overall_code=issue_certificate(conn,user["id"],"basics","all-lessons","LearnLoop Learn Basics Certificate") if count>=len(lesson_titles) else None
    conn.commit()
    conn.close()
    return jsonify(success=True,completed=count,total=len(lesson_titles),course_certificate_code=course_code,
                   overall_certificate_code=overall_code,message="Course completed. Your individual course certificate is ready.")



@app.post("/api/complete-lesson")
def complete_basic_lesson_compat():
    """Complete one Learn Basics course and issue its certificate."""
    user=current_user()
    if not user:
        return jsonify(success=False,message="Log in to save course progress and receive a certificate."),401
    data=request.get_json(silent=True) or {}
    lesson_id=data.get("lesson_id","")
    lesson_titles = {
        "html": "HTML: Build your first web page",
        "python": "Python: Variables, data and control flow",
        "sql": "SQL: Tables, queries and relationships",
        "security": "Cybersecurity: Threats and safe practices",
        "passwords": "Strong passwords, password managers and MFA",
        "figma": "UI/UX: User research, wireframes and usability",
        "canva": "Visual design: Layout, typography and contrast",
        "speaking": "Public speaking: Plan, present and improve",
        "communication": "Communication: Listening, questions and feedback"
    }
    if lesson_id not in lesson_titles:
        return jsonify(success=False,message="Unknown course."),404
    conn=None
    try:
        conn=db()
        conn.execute("INSERT INTO ll_lesson_completions(user_id,lesson_id) VALUES(?,?) ON CONFLICT(user_id,lesson_id) DO NOTHING",(user["id"],lesson_id))
        course_code=issue_certificate(conn,user["id"],"basic_course",lesson_id,lesson_titles[lesson_id])
        count=conn.execute("SELECT COUNT(*) FROM ll_lesson_completions WHERE user_id=?",(user["id"],)).fetchone()[0]
        overall_code=issue_certificate(conn,user["id"],"basics","all-lessons","LearnLoop Learn Basics Certificate") if count>=len(lesson_titles) else None
        conn.commit()
        return jsonify(success=True,completed=count,total=len(lesson_titles),course_certificate_code=course_code,
                       overall_certificate_code=overall_code,message="Course completed. Your individual course certificate is ready.")
    except Exception:
        if conn:
            try: conn.connection.rollback()
            except Exception: pass
        app.logger.exception("Learn Basics course completion failed")
        return jsonify(success=False,message="The database could not save this completion. Please try again in a moment."),500
    finally:
        if conn:
            conn.close()


@app.post("/api/lessons/sync-completions")
def sync_basic_lesson_completions():
    """Recover course completions saved in this browser before server ll_certificates were enabled."""
    user=current_user()
    if not user:
        return jsonify(success=False,message="Please log in first."),401
    data=request.get_json(silent=True) or {}
    lesson_ids=data.get("lesson_ids",[])
    if not isinstance(lesson_ids,list):
        return jsonify(success=False,message="Invalid course progress."),400
    valid_ids=set(BASIC_LESSON_IDS)
    lesson_titles = {
        "html": "HTML: Build your first web page",
        "python": "Python: Variables, data and control flow",
        "sql": "SQL: Tables, queries and relationships",
        "security": "Cybersecurity: Threats and safe practices",
        "passwords": "Strong passwords, password managers and MFA",
        "figma": "UI/UX: User research, wireframes and usability",
        "canva": "Visual design: Layout, typography and contrast",
        "speaking": "Public speaking: Plan, present and improve",
        "communication": "Communication: Listening, questions and feedback"
    }
    completed_ids=list(dict.fromkeys(x for x in lesson_ids if isinstance(x,str) and x in valid_ids))
    conn=db()
    for lesson_id in completed_ids:
        conn.execute("INSERT INTO ll_lesson_completions(user_id,lesson_id) VALUES(?,?) ON CONFLICT(user_id,lesson_id) DO NOTHING",(user["id"],lesson_id))
        issue_certificate(conn,user["id"],"basic_course",lesson_id,lesson_titles[lesson_id])
    count=conn.execute("SELECT COUNT(*) FROM ll_lesson_completions WHERE user_id=?",(user["id"],)).fetchone()[0]
    overall_code=issue_certificate(conn,user["id"],"basics","all-lessons","LearnLoop Learn Basics Certificate") if count>=len(lesson_titles) else None
    conn.commit()
    conn.close()
    return jsonify(success=True,completed=count,total=len(lesson_titles),overall_certificate_code=overall_code)


@app.post("/api/certificates")
def complete_course_via_certificates():
    """Complete a Learn Basics course using the already deployed ll_certificates API path."""
    user=current_user()
    if not user:
        return jsonify(success=False,message="Log in to save course progress and receive a certificate."),401
    data=request.get_json(silent=True) or {}
    lesson_id=data.get("lesson_id","")
    lesson_titles = {
        "html": "HTML: Build your first web page",
        "python": "Python: Variables, data and control flow",
        "sql": "SQL: Tables, queries and relationships",
        "security": "Cybersecurity: Threats and safe practices",
        "passwords": "Strong passwords, password managers and MFA",
        "figma": "UI/UX: User research, wireframes and usability",
        "canva": "Visual design: Layout, typography and contrast",
        "speaking": "Public speaking: Plan, present and improve",
        "communication": "Communication: Listening, questions and feedback"
    }
    if lesson_id not in lesson_titles:
        return jsonify(success=False,message="Unknown course."),400
    conn=None
    try:
        conn=db()
        conn.execute("INSERT INTO ll_lesson_completions(user_id,lesson_id) VALUES(?,?) ON CONFLICT(user_id,lesson_id) DO NOTHING",(user["id"],lesson_id))
        course_code=issue_certificate(conn,user["id"],"basic_course",lesson_id,lesson_titles[lesson_id])
        count=conn.execute("SELECT COUNT(*) FROM ll_lesson_completions WHERE user_id=?",(user["id"],)).fetchone()[0]
        overall_code=issue_certificate(conn,user["id"],"basics","all-lessons","LearnLoop Learn Basics Certificate") if count>=len(lesson_titles) else None
        conn.commit()
        return jsonify(success=True,completed=count,total=len(lesson_titles),course_certificate_code=course_code,
                       overall_certificate_code=overall_code,message="Course completed. Your individual course certificate is ready.")
    except Exception:
        if conn:
            try: conn.connection.rollback()
            except Exception: pass
        app.logger.exception("Certificate course completion failed")
        return jsonify(success=False,message="The database could not save this completion. Please try again."),500
    finally:
        if conn: conn.close()


@app.get("/api/certificates")
def my_certificates():
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db(); rows=conn.execute("SELECT code,certificate_type,title,issued_at FROM ll_certificates WHERE user_id=? ORDER BY issued_at DESC",(user["id"],)).fetchall()
    count=conn.execute("SELECT COUNT(*) FROM ll_lesson_completions WHERE user_id=?",(user["id"],)).fetchone()[0]; conn.close()
    return jsonify(success=True,ll_certificates=[dict(r) for r in rows],basics_completed=count,total_basics=len(BASIC_LESSON_IDS))

@app.post("/api/exchanges/<int:exchange_id>/complete")
def complete_exchange(exchange_id):
    user=current_user()
    if not user: return jsonify(success=False,message="Please log in first."),401
    conn=db(); ex=exchange_for_user(conn,exchange_id,user["id"])
    if not ex or ex["status"]!="accepted": conn.close(); return jsonify(success=False,message="Accepted exchange not found."),404
    contributors=conn.execute("SELECT COUNT(DISTINCT uploader_id) FROM ll_exchange_videos WHERE exchange_id=?",(exchange_id,)).fetchone()[0]
    if contributors<2: conn.close(); return jsonify(success=False,message="Both students must upload a video first."),400
    conn.execute("INSERT INTO ll_exchange_completions(exchange_id,user_id) VALUES(?,?) ON CONFLICT(exchange_id,user_id) DO NOTHING",(exchange_id,user["id"])); conn.commit()
    done=conn.execute("SELECT COUNT(*) FROM ll_exchange_completions WHERE exchange_id=?",(exchange_id,)).fetchone()[0]
    if done>=2:
        # Give each participant a separate certificate for the skill they learned.
        requester_skill=str(ex["requester_learns"]).strip()
        peer_skill=str(ex["requester_teaches"]).strip()
        issue_certificate(conn,ex["requester_id"],"peer_exchange",exchange_id,
                          f"Peer Skill Exchange: {requester_skill}")
        issue_certificate(conn,ex["peer_id"],"peer_exchange",exchange_id,
                          f"Peer Skill Exchange: {peer_skill}")
    conn.commit(); conn.close()
    return jsonify(success=True,completed_by=done,certificate_ready=done>=2,message="Your completion is recorded. Waiting for the other student." if done<2 else "Both students completed the exchange. Certificates are ready!")

@app.get("/certificate/<code>")
def view_certificate(code):
    conn=db()
    row=conn.execute("SELECT c.*,u.name FROM ll_certificates c JOIN ll_users u ON u.id=c.user_id WHERE c.code=?",(code,)).fetchone()
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
    conn=db(); row=conn.execute("SELECT c.code,c.title,c.issued_at,u.name FROM ll_certificates c JOIN ll_users u ON u.id=c.user_id WHERE c.code=?",(code,)).fetchone(); conn.close()
    if not row: return jsonify(valid=False,message="Certificate code not found."),404
    return jsonify(valid=True,certificate=dict(row),message="Valid LearnLoop certificate.")

init_db()  # Populate the skill catalogue in the configured Supabase PostgreSQL database.

if __name__=="__main__":
    app.run(host="127.0.0.1",port=5000,debug=True)
