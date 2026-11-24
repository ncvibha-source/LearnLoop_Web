const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
let loginMode=false;

function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}

let isLoggedIn = false;
const publicPages = ["home", "how", "about"];
function renderNavigation() {
 const nav = $("#siteNav");
 const actions = $("#topActions");
 if (!nav || !actions) return;
 if (isLoggedIn) {
  nav.innerHTML = `
   <a href="#dashboard">Dashboard</a>
   <a href="#matches">Find Peers</a>
   <a href="#explore">Explore Skills</a>
   <a href="#learn">Learn Basics</a>
   <a href="#profile">Teach a Skill</a>
   <a href="#workspace">My Workspace</a>
   <a href="#exchanges">My Skill Exchanges</a>\n   <a href="#certificates">Certificates</a>
   <a href="#profile">My Profile</a>`;
  actions.innerHTML = `<button class="btn ghost" id="logoutBtn">Log out</button>`;
  $("#logoutBtn").onclick = async () => {
   try {
    await api("/api/logout", {method:"POST", body:JSON.stringify({})});
    isLoggedIn = false;
    renderNavigation();
    location.hash = "#home";
    toast("You have been logged out.");
   } catch(err) { toast(err.message); }
  };
 } else {
  nav.innerHTML = `<a href="#home">Home</a><a href="#how">How it works</a><a href="#about">About</a>`;
  actions.innerHTML = `<button class="btn ghost" data-open="login">Log in</button><button class="btn primary" data-open="signup">Join LearnLoop</button>`;
 }
}
async function checkLoginState() {
 try {
  const data = await api("/api/me");
  isLoggedIn = !!data.logged_in;
 } catch (_) { isLoggedIn = false; }
 renderNavigation();
 const requested = location.hash.slice(1);
 if (!isLoggedIn && requested && !publicPages.includes(requested)) {
  location.hash = "#home";
 }
}

function openAuth(mode){loginMode=mode==="login";$("#modal").classList.add("show");$("#nameWrap").style.display=loginMode?"none":"block";$("#modalTitle").textContent=loginMode?"Welcome back":"Join LearnLoop";$("#modalSub").textContent=loginMode?"Log in to continue your learning journey.":"Create an account to begin your skill exchange.";$("#authSubmit").textContent=loginMode?"Log in":"Create account";$("#switchText").innerHTML=loginMode?'New to LearnLoop? <button type="button" id="switchMode">Create account</button>':'Already have an account? <button type="button" id="switchMode">Log in</button>';$("#switchMode").onclick=()=>openAuth(loginMode?"signup":"login")}
// Delegate clicks so header buttons still work after the navigation is rebuilt.
document.addEventListener("click", e => {
 const button = e.target.closest("[data-open]");
 if (!button) return;
 const target = button.dataset.open;
 if (target === "profile") {
  if (!isLoggedIn) { openAuth("login"); return; }
  location.hash = "#profile";
  loadProfile();
 } else {
  openAuth(target);
 }
});
$("#close").onclick=()=>$("#modal").classList.remove("show");
$("#modal").addEventListener("click",e=>{if(e.target.id==="modal")$("#modal").classList.remove("show")});

async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});const d=await r.json();if(!r.ok)throw new Error(d.message||"Request failed");return d}

$("#authForm").onsubmit=async e=>{
 e.preventDefault();
 const body={name:$("#authName").value,email:$("#authEmail").value,password:$("#authPassword").value};
 try{const d=await api(loginMode?"/api/login":"/api/signup",{method:"POST",body:JSON.stringify(body)});isLoggedIn=true;renderNavigation();toast(d.message);$("#modal").classList.remove("show");$("#authPassword").value="";location.hash="#dashboard";loadDashboard();}catch(err){toast(err.message)}
};

function showPage(){
 let id=location.hash.slice(1)||"home";
 const knownPages=["home","explore","matches","learn","how","about","dashboard","profile","workspace","passport","exchanges","certificates"];
 if(!knownPages.includes(id)) id="home";
 if(!isLoggedIn && !publicPages.includes(id)){
  toast("Please log in to access student features.");
  location.hash="#home";
  id="home";
 }
 if(id==="how") id="home";
 $$(".page").forEach(p=>p.classList.toggle("active",p.id===id));
 if(id==="explore")loadSkills();
 if(id==="matches")loadMatches();
 if(id==="learn")renderLessons();
 if(id==="dashboard")loadDashboard();
 if(id==="profile")loadProfile();
 if(id==="passport")loadPassport();
 if(id==="exchanges")loadExchanges();
 if(id==="certificates")loadCertificates();
}
window.addEventListener("hashchange",showPage);checkLoginState().then(()=>showPage());

async function loadSkills(){
 const q=encodeURIComponent($("#skillSearch").value);const c=$("#categoryFilter").value;
 try{const skills=await api(`/api/skills?q=${q}&category=${c}`);const grid=$("#skillsGrid");grid.innerHTML="";
 skills.forEach(s=>{const el=document.createElement("article");el.className="skill";el.innerHTML=`<span class="tag">${s.category}</span><h3>${s.name}</h3><p>${s.description}</p><span class="level">${s.level} level</span>`;grid.appendChild(el)});
 $("#noSkills").classList.toggle("hidden",skills.length>0);
 }catch(e){toast(e.message)}
}
$("#skillSearch").addEventListener("input",loadSkills);$("#categoryFilter").addEventListener("change",loadSkills);

async function loadProfile(){
 try{const d=await api("/api/me");if(!d.logged_in){toast("Please log in first.");openAuth("login");return}$("#profileName").value=d.user.name;$("#teachSkills").value=d.profile.teach_skills||"";$("#learnSkills").value=d.profile.learn_skills||"";$("#profileBio").value=d.profile.bio||""}catch(e){toast(e.message)}
}
$("#saveProfile").onclick=async()=>{try{const d=await api("/api/profile",{method:"POST",body:JSON.stringify({teach_skills:$("#teachSkills").value,learn_skills:$("#learnSkills").value,bio:$("#profileBio").value})});toast(d.message)}catch(e){toast(e.message)}};

async function loadDashboard(){
 try{const d=await api("/api/dashboard");$("#welcomeName").textContent=d.name;$("#teachCount").textContent=d.teachCount;$("#learnCount").textContent=d.learnCount;$("#sessionCount").textContent=d.sessions;$("#reflectionCount").textContent=d.reflections}catch(e){toast(e.message)}
}
$("#createSession").onclick=async()=>{try{const d=await api("/api/sessions",{method:"POST",body:JSON.stringify({skill:$("#sessionSkill").value,goal:$("#sessionGoal").value})});toast(d.message);$("#sessionSkill").value="";$("#sessionGoal").value=""}catch(e){toast(e.message)}};
$("#saveNotes").onclick=async()=>{try{const d=await api("/api/notes",{method:"POST",body:JSON.stringify({content:$("#notes").value})});toast(d.message);$("#notes").value=""}catch(e){toast(e.message)}};
$("#saveReflection").onclick=async()=>{try{const d=await api("/api/reflections",{method:"POST",body:JSON.stringify({content:$("#reflection").value})});toast(d.message);$("#reflection").value=""}catch(e){toast(e.message)}};

async function loadPassport(){try{const d=await api("/api/dashboard");$("#passportUser").textContent=d.name;$("#passportTeach").textContent=d.teachCount;$("#passportLearn").textContent=d.learnCount;$("#passportSessions").textContent=d.sessions;$("#passportSkills").textContent=[...d.teachSkills,...d.learnSkills].join(" • ")||"Add skills through your profile."}catch(e){toast(e.message)}}



// Find peers by comparing each student's teaching and learning skills.
let matchMode = "teach_me";
const matchDescriptions = {
  teach_me: "Students whose teaching skills match the skills you want to learn.",
  mutual: "Students who can teach you something and also want to learn something you can teach.",
  teach_them: "Students whose learning goals match skills you can teach."
};
function addMatchChip(parent, label, kind) {
  const chip = document.createElement("span");
  chip.className = "match-chip " + (kind || "");
  chip.textContent = label;
  parent.appendChild(chip);
}
async function loadMatches() {
  const grid = $("#matchGrid");
  const empty = $("#noMatches");
  const prompt = $("#matchProfilePrompt");
  if (!grid) return;
  grid.innerHTML = '<div class="match-loading">Finding students with compatible skills…</div>';
  empty.classList.add("hidden");
  prompt.hidden = true;
  $("#matchHint").textContent = matchDescriptions[matchMode];
  try {
    const q = encodeURIComponent($("#matchSearch").value.trim());
    const data = await api(`/api/matches?mode=${matchMode}&q=${q}`);
    grid.innerHTML = "";
    if (!data.my_teach.length && !data.my_learn.length) prompt.hidden = false;
    data.matches.forEach(person => {
      const card = document.createElement("article");
      card.className = "match-card";
      const top = document.createElement("div"); top.className = "match-card-top";
      const avatar = document.createElement("div"); avatar.className = "match-avatar";
      avatar.textContent = (person.name || "S").trim().charAt(0).toUpperCase();
      const identity = document.createElement("div"); identity.className = "match-identity";
      const name = document.createElement("h3"); name.textContent = person.name;
      const subtitle = document.createElement("p"); subtitle.textContent = person.mutual ? "Potential skill-exchange partner" : "Learn and share with this peer";
      identity.append(name, subtitle); top.append(avatar, identity);
      if (person.mutual) { const tag=document.createElement("span");tag.className="match-badge";tag.textContent="Mutual match";top.appendChild(tag); }
      const teach = document.createElement("div"); teach.className="match-detail";
      const teachTitle=document.createElement("b");teachTitle.textContent="Can teach";
      const teachChips=document.createElement("div");teachChips.className="match-chips";
      person.teach_skills.forEach(s=>addMatchChip(teachChips,s));
      teach.append(teachTitle,teachChips);
      const learn = document.createElement("div"); learn.className="match-detail";
      const learnTitle=document.createElement("b");learnTitle.textContent="Wants to learn";
      const learnChips=document.createElement("div");learnChips.className="match-chips";
      person.learn_skills.forEach(s=>addMatchChip(learnChips,s,"learn"));
      learn.append(learnTitle,learnChips);
      card.append(top,teach,learn);
      if (person.bio) { const bio=document.createElement("p");bio.className="match-bio";bio.textContent=person.bio;card.appendChild(bio); }
      const actions=document.createElement("div");actions.className="match-card-actions";
      const plan=document.createElement("button");plan.className="btn outline";plan.textContent="Plan a learning session";
      plan.onclick=()=>{const skill=(person.can_teach_you[0]||person.teach_skills[0]||"").trim();location.hash="#workspace";setTimeout(()=>{$("#sessionSkill").value=skill;$("#sessionGoal").value=`Learn ${skill} from ${person.name}`;},80)};
      actions.appendChild(plan);
      const connect=document.createElement("button");connect.className="btn primary";connect.textContent="Start skill exchange";
      connect.onclick=async()=>{try{const teach=(person.my_teach_match||[])[0]||"Skill exchange";const learns=(person.can_teach_you||[])[0]||"Skill exchange";const d=await api("/api/exchanges",{method:"POST",body:JSON.stringify({peer_id:person.id,teaches:teach,learns:learns})});toast(d.message);location.hash="#exchanges"}catch(err){toast(err.message)}};
      actions.appendChild(connect);card.appendChild(actions);
      grid.appendChild(card);
    });
    empty.classList.toggle("hidden",data.matches.length>0 || (!data.my_teach.length && !data.my_learn.length));
  } catch (err) {
    grid.innerHTML="";
    if (err.message.toLowerCase().includes("log in")) { toast("Please log in to find peers."); openAuth("login"); }
    else toast(err.message);
  }
}
if ($("#matchTabs")) {
  $("#matchTabs").addEventListener("click", e => {
    const button=e.target.closest("[data-mode]");
    if(!button)return;
    matchMode=button.dataset.mode;
    $$("#matchTabs .match-tab").forEach(b=>b.classList.toggle("active",b===button));
    loadMatches();
  });
  $("#matchSearch").addEventListener("input", loadMatches);
}


// Private two-way peer video exchange. Videos are only served to accepted exchange participants.
async function loadExchanges(){
 const host=$("#exchangeList"); if(!host)return; host.innerHTML="<p>Loading your exchanges…</p>";
 try{const d=await api("/api/exchanges");host.innerHTML="";
  if(!d.exchanges.length){host.innerHTML='<div class="empty">No skill exchanges yet. Find a peer and send an exchange request to get started.</div>';return;}
  d.exchanges.forEach(ex=>{
   const card=document.createElement("article");card.className="exchange-card";
   const other=ex.is_requester?ex.peer_name:ex.requester_name;
   card.innerHTML=`<div class="exchange-card-head"><div><h3>${escapeHtml(other)}</h3><p>Skill exchange #${ex.id}</p></div><span class="exchange-status ${ex.status}">${ex.status}</span></div>`;
   if(ex.status==="pending"&&!ex.is_requester){const row=document.createElement("div");row.className="exchange-actions";["accept","reject"].forEach(action=>{const b=document.createElement("button");b.className=action==="accept"?"btn primary":"btn outline";b.textContent=action[0].toUpperCase()+action.slice(1);b.onclick=async()=>{try{const r=await api(`/api/exchanges/${ex.id}/respond`,{method:"POST",body:JSON.stringify({action})});toast(r.message);loadExchanges()}catch(e){toast(e.message)}};row.appendChild(b)});card.appendChild(row)}
   if(ex.status==="accepted"){
    const upload=document.createElement("form");upload.className="video-upload-form";upload.innerHTML=`<h4>Share your explanation video</h4><label>Video title<input name="title" required maxlength="100" placeholder="e.g. Python variables explained"></label><label>Skill explained<input name="skill" required maxlength="80" placeholder="e.g. Python"></label><label>Choose video<input name="video" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" required></label><button class="btn primary" type="submit">Upload video</button><small>MP4, WEBM, MOV or M4V · up to 100 MB</small>`;
    upload.onsubmit=async e=>{e.preventDefault();const fd=new FormData(upload);const b=upload.querySelector("button");b.disabled=true;b.textContent="Uploading…";try{const r=await fetch(`/api/exchanges/${ex.id}/videos`,{method:"POST",body:fd});const data=await r.json();if(!r.ok)throw new Error(data.message||"Upload failed");toast(data.message);loadExchanges()}catch(err){toast(err.message)}finally{b.disabled=false;b.textContent="Upload video"}};
    card.appendChild(upload);
    const videos=document.createElement("div");videos.className="exchange-videos";const heading=document.createElement("h4");heading.textContent="Shared explanations";videos.appendChild(heading);
    if(!ex.videos.length){const p=document.createElement("p");p.textContent="No videos uploaded yet. Each of you can upload an explanation of a skill you know.";videos.appendChild(p)}
    ex.videos.forEach(v=>{const wrap=document.createElement("div");wrap.className="shared-video";const title=document.createElement("h5");title.textContent=`${v.title} — ${v.skill}`;const by=document.createElement("p");by.textContent=`Uploaded by ${v.uploader_id===ex.requester_id?ex.requester_name:ex.peer_name}`;const player=document.createElement("video");player.controls=true;player.preload="metadata";player.src=`/api/exchanges/${ex.id}/videos/${v.id}`;wrap.append(title,by,player);videos.appendChild(wrap)});
    card.appendChild(videos);
    const finish=document.createElement("div");finish.className="exchange-finish";
    const doneText=document.createElement("p");doneText.textContent="After watching both explanations, each student should mark this exchange complete.";
    const doneBtn=document.createElement("button");doneBtn.className="btn primary";doneBtn.textContent="Mark my learning complete";
    doneBtn.onclick=async()=>{doneBtn.disabled=true;try{const r=await api(`/api/exchanges/${ex.id}/complete`,{method:"POST",body:JSON.stringify({})});toast(r.message);loadExchanges()}catch(err){toast(err.message)}finally{doneBtn.disabled=false}};
    finish.append(doneText,doneBtn);card.appendChild(finish);
   } else if(ex.status==="pending"&&ex.is_requester){const p=document.createElement("p");p.textContent="Waiting for the other student to accept. Video uploads unlock after acceptance.";card.appendChild(p)}
   host.appendChild(card);
  });
 }catch(e){host.innerHTML="";toast(e.message)}
}
async function loadCertificates(){
 const host=$("#certificateList");if(!host)return;host.innerHTML="<p>Loading your certificates…</p>";
 try{const d=await api("/api/certificates");host.innerHTML="";
 if(!d.certificates.length){host.innerHTML=`<div class="empty">No certificates yet. Complete all ${d.total_basics} Learn Basics lessons or finish a two-way peer exchange.</div>`;return;}
 d.certificates.forEach(c=>{const card=document.createElement("article");card.className="exchange-card";const title=document.createElement("h3");title.textContent=c.title;const code=document.createElement("p");code.textContent="Verification code: "+c.code;const link=document.createElement("a");link.className="btn primary";link.href="/certificate/"+encodeURIComponent(c.code);link.target="_blank";link.rel="noopener";link.textContent="View / Print certificate";const verify=document.createElement("a");verify.href="/verify/"+encodeURIComponent(c.code);verify.target="_blank";verify.rel="noopener";verify.textContent="Verify certificate";card.append(title,code,link,document.createTextNode(" "),verify);host.appendChild(card)});
 }catch(e){host.textContent=e.message}
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

// Learn Basics: open lessons without an account; completion is stored in this browser.
const lessons = [
 {id:"html",category:"programming",title:"HTML: Build your first web page",level:"Beginner",time:"10 min",desc:"Understand the structure of a web page.",body:[
  ["What is HTML?","HTML (HyperText Markup Language) gives a web page its structure. It tells the browser which parts are headings, paragraphs, links, images and more."],
  ["A simple example","An HTML document commonly contains a doctype, an html element, a head section for page information, and a body section for visible content."],
  ["Try it","Create a file named index.html. Add a heading using <h1> and a paragraph using <p>. Open the file in your browser to see the result."]
 ],question:"Which HTML element is commonly used for the largest main heading?",options:["<p>","<h1>","<img>"],answer:1,explain:"Correct! <h1> represents the highest-level heading."},
 {id:"python",category:"programming",title:"Python: Variables and data",level:"Beginner",time:"12 min",desc:"Store information and work with basic data types.",body:[
  ["What is a variable?","A variable is a name that refers to a value. In Python, you can create one with an assignment such as name = 'Asha'."],
  ["Common data types","Strings store text, integers store whole numbers, floats store decimal numbers, and booleans represent True or False."],
  ["Try it","Think of three values: your name, your semester number, and whether you enjoy coding. Identify the data type of each."]
 ],question:"What is the data type of 3.14 in Python?",options:["Integer","String","Float"],answer:2,explain:"Correct! 3.14 is a floating-point number."},
 {id:"sql",category:"programming",title:"SQL: Understand databases",level:"Beginner",time:"12 min",desc:"Learn what tables, rows and columns mean.",body:[
  ["What is a database?","A database stores information in an organised way so that an application can create, read, update and delete records."],
  ["Tables, rows and columns","A table groups related data. Each row is one record, and each column stores one attribute, such as student name or email."],
  ["Try it","Imagine a Students table with StudentID, Name and Department columns. Each student would have a separate row."]
 ],question:"In a database table, what does one row usually represent?",options:["One record","One database","One column"],answer:0,explain:"Correct! A row represents one record in the table."},
 {id:"security",category:"cybersecurity",title:"Cybersecurity: Stay safer online",level:"Beginner",time:"10 min",desc:"Recognise common risks and everyday safety habits.",body:[
  ["What is cybersecurity?","Cybersecurity is the practice of protecting devices, accounts, networks and data from unauthorised access or misuse."],
  ["Common threats","Phishing messages try to trick people into revealing information. Malware is software designed to cause harm or gain unauthorised access."],
  ["Safer habits","Use unique passwords, turn on multi-factor authentication, update software, and verify unexpected links or attachments before opening them."]
 ],question:"You receive an unexpected message asking you to sign in through an unfamiliar link. What is safest?",options:["Click quickly","Verify the sender and visit the official site yourself","Forward it to everyone"],answer:1,explain:"Correct! Avoid the link and verify through a trusted official channel."},
 {id:"passwords",category:"cybersecurity",title:"Strong passwords and MFA",level:"Beginner",time:"8 min",desc:"Protect accounts with better authentication habits.",body:[
  ["Use unique passwords","A password reused across websites can put multiple accounts at risk if one service is compromised."],
  ["Use a password manager","A reputable password manager can help generate and store long, unique passwords."],
  ["Turn on MFA","Multi-factor authentication adds another proof of identity beyond a password, such as an authenticator app or security key."]
 ],question:"Why should you avoid reusing the same password?",options:["It is harder to type","One breach could expose several accounts","It makes websites slower"],answer:1,explain:"Correct! Reuse can let attackers try a leaked password on other accounts."},
 {id:"figma",category:"design",title:"UI/UX: Start with the user",level:"Beginner",time:"10 min",desc:"Understand the difference between UI and UX.",body:[
  ["What is UX?","User experience (UX) is how a person experiences a product, including how easy, clear and useful it feels."],
  ["What is UI?","User interface (UI) is the visual and interactive layer: buttons, typography, colours, spacing and screens."],
  ["Try it","Choose an app you use often. Identify one thing that makes it easy to use and one thing that could be clearer."]
 ],question:"Which term focuses on the overall experience of using a product?",options:["UX","UI","HTML"],answer:0,explain:"Correct! UX focuses on the overall user experience."},
 {id:"canva",category:"design",title:"Visual design: Layout and contrast",level:"Beginner",time:"9 min",desc:"Make posters and slides easier to understand.",body:[
  ["Create visual hierarchy","Make the most important information stand out through size, weight, placement and spacing."],
  ["Use contrast","Text should be easy to read against its background. Avoid low-contrast colour combinations."],
  ["Keep it consistent","Use a small set of fonts, colours and spacing rules so the design feels connected."]
 ],question:"What helps make important information stand out?",options:["Visual hierarchy","Using many unrelated fonts","Making all text tiny"],answer:0,explain:"Correct! Visual hierarchy guides attention to the most important content."},
 {id:"speaking",category:"soft",title:"Public speaking: Structure your message",level:"Beginner",time:"10 min",desc:"Organise an idea into a clear short presentation.",body:[
  ["Start with a purpose","Know the one main idea you want your audience to remember."],
  ["Use a simple structure","Introduce the topic, explain two or three key points, and finish with a clear takeaway."],
  ["Practise aloud","Rehearse with a timer. Speak at a comfortable pace and pause between important ideas."]
 ],question:"What is a useful way to make a short presentation clearer?",options:["Include every detail you know","Use a clear beginning, key points and conclusion","Avoid practising"],answer:1,explain:"Correct! A clear structure helps the audience follow your message."},
 {id:"communication",category:"soft",title:"Communication: Listen actively",level:"Beginner",time:"8 min",desc:"Practise listening, clarifying and responding thoughtfully.",body:[
  ["Pay attention","Give the speaker your attention and avoid planning your reply while they are still talking."],
  ["Clarify","Ask respectful questions when something is unclear. You can paraphrase the idea to check your understanding."],
  ["Respond thoughtfully","Acknowledge what the other person said before sharing your own view."]
 ],question:"What is an example of active listening?",options:["Interrupting to finish a sentence","Checking your phone","Paraphrasing to confirm understanding"],answer:2,explain:"Correct! Paraphrasing helps confirm that you understood the speaker."}
];
let activeLearnCategory="all", activeLesson=null, selectedLessonAnswer=null;
function completedLessonIds(){try{return JSON.parse(localStorage.getItem("learnloopBasicsDone")||"[]")}catch(e){return []}}
function saveCompletedLesson(id){const done=completedLessonIds();if(!done.includes(id)){done.push(id);localStorage.setItem("learnloopBasicsDone",JSON.stringify(done))}}
function updateLearnProgress(){const done=completedLessonIds();$("#learnProgressCount").textContent=done.length;$("#learnProgressBar").style.width=(done.length/lessons.length*100)+"%"}
function renderLessons(){
 const q=($("#lessonSearch")?.value||"").trim().toLowerCase(), done=completedLessonIds();
 const filtered=lessons.filter(l=>(activeLearnCategory==="all"||l.category===activeLearnCategory)&&(!q||(l.title+" "+l.desc+" "+l.category).toLowerCase().includes(q)));
 const grid=$("#lessonGrid"); if(!grid)return; grid.innerHTML="";
 filtered.forEach(l=>{const card=document.createElement("article");card.className="lesson-card";card.innerHTML=`<div class="lesson-card-top"><span class="lesson-category">${l.category==="soft"?"SOFT SKILLS":l.category.toUpperCase()}</span><span class="lesson-time">${l.time}</span></div><h3>${l.title}</h3><p>${l.desc}</p><div class="lesson-card-bottom"><span>${l.level} · ${done.includes(l.id)?"✓ Completed":"Not started"}</span><button class="btn ${done.includes(l.id)?"outline":"primary"}" type="button">${done.includes(l.id)?"Review lesson":"Start lesson"} ↗</button></div>`;card.querySelector("button").onclick=()=>openLesson(l.id);grid.appendChild(card)});
 $("#noLessons").classList.toggle("hidden",filtered.length>0);updateLearnProgress();
}
function openLesson(id){
 activeLesson=lessons.find(l=>l.id===id);selectedLessonAnswer=null;
 $("#lessonCategoryLabel").textContent=activeLesson.category.toUpperCase()+" · "+activeLesson.time;
 $("#lessonTitle").textContent=activeLesson.title;
 $("#lessonBody").innerHTML=activeLesson.body.map(([h,p])=>`<section><h3>${h}</h3><p>${p.replaceAll("<","&lt;").replaceAll(">","&gt;")}</p></section>`).join("");
 $("#lessonQuiz").innerHTML=`<h3>Quick check</h3><p>${activeLesson.question}</p>`+activeLesson.options.map((o,i)=>`<label class="quiz-option"><input type="radio" name="lessonAnswer" value="${i}"> ${o.replaceAll("<","&lt;").replaceAll(">","&gt;")}</label>`).join("");
 $("#lessonFeedback").textContent="Choose an answer and check it to unlock lesson completion.";
 $("#checkAnswer").disabled=false;$("#completeLesson").disabled=true;
 $("#lessonModal").classList.add("show");$("#lessonModal").setAttribute("aria-hidden","false");
}
$("#lessonGrid")?.addEventListener("click",e=>{});
$("#lessonSearch")?.addEventListener("input",renderLessons);
$("#learnFilters")?.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{activeLearnCategory=b.dataset.category;$("#learnFilters").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));renderLessons()}));
$("#closeLesson")?.addEventListener("click",()=>{$("#lessonModal").classList.remove("show");$("#lessonModal").setAttribute("aria-hidden","true")});
$("#lessonModal")?.addEventListener("click",e=>{if(e.target.id==="lessonModal")$("#closeLesson").click()});
$("#checkAnswer")?.addEventListener("click",()=>{const chosen=document.querySelector('input[name="lessonAnswer"]:checked');if(!chosen){$("#lessonFeedback").textContent="Choose an answer first.";return}selectedLessonAnswer=Number(chosen.value);if(selectedLessonAnswer===activeLesson.answer){$("#lessonFeedback").textContent=activeLesson.explain;$("#lessonFeedback").className="lesson-feedback correct";$("#completeLesson").disabled=false;$("#checkAnswer").disabled=true}else{$("#lessonFeedback").textContent="Not quite—try again. Hint: "+activeLesson.explain;$("#lessonFeedback").className="lesson-feedback retry"}});
$("#completeLesson")?.addEventListener("click",async()=>{if(!activeLesson||selectedLessonAnswer!==activeLesson.answer)return;saveCompletedLesson(activeLesson.id);let note="Lesson completed!";try{const r=await api(`/api/lessons/${activeLesson.id}/complete`,{method:"POST",body:JSON.stringify({})});note=r.certificate_code?"Lesson completed! Your Learn Basics certificate is ready.":"Progress saved to your account.";if(r.certificate_code)toast("Your Learn Basics certificate is ready!")}catch(e){note="Lesson completed in this browser. Log in to save progress for a certificate."}$("#lessonFeedback").textContent=note;$("#lessonFeedback").className="lesson-feedback correct";$("#completeLesson").disabled=true;renderLessons()});
