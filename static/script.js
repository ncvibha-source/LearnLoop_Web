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
  $("#logoutBtn").onclick = openLogoutConfirmation;
 } else {
  nav.innerHTML = `<a href="#home">Home</a><a href="#how">How it works</a><a href="#about">About</a>`;
  actions.innerHTML = `<button class="btn ghost" data-open="login">Log in</button><button class="btn primary" data-open="signup">Join LearnLoop</button>`;
 }
}
function openLogoutConfirmation(){
 const modal=$("#logoutConfirmModal");
 if(modal){modal.classList.add("show");modal.setAttribute("aria-hidden","false");}
}
function closeLogoutConfirmation(){
 const modal=$("#logoutConfirmModal");
 if(modal){modal.classList.remove("show");modal.setAttribute("aria-hidden","true");}
}
async function performLogout(){
 const button=$("#confirmLogout");
 if(button){button.disabled=true;button.textContent="Logging out…";}
 try{
  await api("/api/logout",{method:"POST",body:JSON.stringify({})});
  isLoggedIn=false;closeLogoutConfirmation();renderNavigation();
  location.hash="#home";showPage();toast("You have been logged out.");
 }catch(err){toast(err.message);}
 finally{if(button){button.disabled=false;button.textContent="Yes, log out";}}
}
$("#cancelLogout")?.addEventListener("click",closeLogoutConfirmation);
$("#confirmLogout")?.addEventListener("click",performLogout);
$("#logoutConfirmModal")?.addEventListener("click",e=>{if(e.target.id==="logoutConfirmModal")closeLogoutConfirmation();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeLogoutConfirmation();});

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
 try{
  const skills=await api(`/api/skills?q=${q}&category=${c}`);
  const uniqueSkills=[...new Map(skills.map(s=>[String(s.name||"").trim().toLowerCase(),s])).values()];
  const grid=$("#skillsGrid");grid.innerHTML="";
  uniqueSkills.forEach(s=>{
   const el=document.createElement("article");el.className="skill";
   el.innerHTML=`<span class="tag">${s.category}</span><h3>${s.name}</h3><p>${s.description}</p><span class="level">${s.level} level</span>`;
   grid.appendChild(el);
  });
  $("#noSkills").classList.toggle("hidden",uniqueSkills.length>0);
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
 const host=$("#certificateList");if(!host)return;
 host.innerHTML="<p>Loading your certificates…</p>";
 try{
  const d=await api("/api/certificates");
  host.innerHTML="";
  if(!d.certificates || !d.certificates.length){
   host.innerHTML='<div class="empty">No certificates have been issued yet. Open Learn Basics, review a completed course, pass its quiz and press “Mark lesson complete” once to generate its certificate.</div>';
   return;
  }
  d.certificates.forEach(c=>{
   const card=document.createElement("article");card.className="exchange-card";
   const title=document.createElement("h3");title.textContent=c.title;
   const code=document.createElement("p");code.textContent="Verification code: "+c.code;
   const link=document.createElement("a");link.className="btn primary";link.href="/certificate/"+encodeURIComponent(c.code);link.target="_blank";link.rel="noopener";link.textContent="View / Print certificate";
   const verify=document.createElement("a");verify.href="/verify/"+encodeURIComponent(c.code);verify.target="_blank";verify.rel="noopener";verify.textContent="Verify certificate";
   card.append(title,code,link,document.createTextNode(" "),verify);host.appendChild(card);
  });
 }catch(e){
  host.innerHTML='<div class="empty">Could not load certificates: '+escapeHtml(e.message)+' Please refresh and try again.</div>';
 }
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

// Learn Basics: lesson content is public; course completion and certificates are saved to the signed-in account.
const lessons = [
 {id:"html",category:"programming",title:"HTML: Build your first web page",level:"Beginner",time:"25 min",desc:"Learn document structure, semantic elements, links, images, lists and forms.",body:[
  ["1. What HTML does","HTML (HyperText Markup Language) describes the structure and meaning of web content. A browser reads HTML elements and builds the page users see. HTML is not a programming language; it is a markup language."],
  ["2. Basic document structure","A standard page starts with <!DOCTYPE html>, followed by <html>. The <head> contains metadata and the page title; the <body> contains visible content. Set <meta charset='UTF-8'> and a viewport meta tag for mobile layouts."],
  ["3. Elements and attributes","Most elements use an opening tag, content and a closing tag. Attributes add information: href on an anchor defines its destination, src on an image defines its source, and alt describes an image for accessibility."],
  ["4. Common content elements","Use headings h1 to h6 in a logical hierarchy, p for paragraphs, ul or ol with li for lists, and a for links. Use button for an action rather than a link that has no destination."],
  ["5. Semantic structure","Elements such as header, nav, main, section, article and footer describe the role of page regions. Semantic HTML improves accessibility, maintainability and the ability of assistive technologies to understand a page."],
  ["6. Forms and labels","A form groups user inputs. Use label with a matching for/id, choose suitable input types such as email or password, and use required when a value is mandatory. A submit button sends the form for processing."],
  ["7. Practical activity","Create index.html. Add a page title, one h1 heading, a paragraph, a three-item list, a link and a form with a labelled email field. Open the file in a browser and inspect the result."],
  ["8. Key takeaway","HTML gives content its structure. CSS controls presentation and JavaScript adds behaviour. Keep headings meaningful, use labels for inputs and provide useful alt text for informative images."]
 ],question:"Which element represents the main top-level heading on a page?",options:["<p>","<h1>","<footer>"],answer:1,explain:"Correct! h1 is the highest-level heading and should describe the page's main topic."},
 {id:"python",category:"programming",title:"Python: Variables, data and control flow",level:"Beginner",time:"30 min",desc:"Practise variables, data types, conditions, loops and functions.",body:[
  ["1. What is Python?","Python is a general-purpose programming language known for readable syntax. It is used in automation, web development, data analysis, scripting and many other areas."],
  ["2. Variables and assignment","A variable is a name that refers to a value. Example: student_name = 'Asha' and semester = 3. The equals sign assigns a value; it does not mean mathematical equality."],
  ["3. Basic data types","str stores text, int stores whole numbers, float stores decimal numbers and bool stores True or False. Use type(value) to inspect a value's type."],
  ["4. Input and output","print() displays information. input() reads text entered by a user. Convert input when a number is needed, for example age = int(input('Age: '))."],
  ["5. Conditions","if, elif and else choose which block runs based on a condition. Comparisons include ==, !=, >, <, >= and <=. Indentation defines the blocks in Python."],
  ["6. Loops","A for loop iterates over a sequence or range. A while loop repeats while its condition is true. Update loop variables carefully to avoid an infinite while loop."],
  ["7. Functions","Use def to define a reusable block of code. Parameters receive input, return sends a result back. Example: def square(n): return n*n."],
  ["8. Collections","A list is ordered and mutable, a tuple is ordered and immutable, a dictionary stores key-value pairs, and a set stores unique values."],
  ["9. Practical activity","Write a program that asks for a student's name and marks, prints the result, uses an if/else to show pass or try again, and defines a function that returns the percentage."],
  ["10. Key takeaway","Break a problem into small steps: read input, process data, make decisions, repeat when needed and display output. Test normal values and edge cases."]
 ],question:"What is the data type of 3.14 in Python?",options:["int","str","float"],answer:2,explain:"Correct! 3.14 is a float because it contains a decimal part."},
 {id:"sql",category:"programming",title:"SQL: Tables, queries and relationships",level:"Beginner",time:"30 min",desc:"Understand relational databases and practise essential SQL commands.",body:[
  ["1. What is a database?","A database stores organised information. A relational database stores data in tables and connects related records using keys."],
  ["2. Tables, rows and columns","A table represents one type of entity, such as Students. Each row is one record and each column stores an attribute such as student_id, name or department."],
  ["3. Primary and foreign keys","A primary key uniquely identifies each row. A foreign key refers to a key in another table and helps represent relationships while maintaining referential integrity."],
  ["4. Read data with SELECT","SELECT name, department FROM Students; retrieves chosen columns. SELECT * returns all columns. Use WHERE to filter records, for example WHERE department = 'CSE'."],
  ["5. Sort and limit results","ORDER BY sorts results ascending or descending. LIMIT restricts the number of rows returned. These clauses help make large query results easier to inspect."],
  ["6. Add, change and remove records","INSERT adds rows, UPDATE changes existing rows and DELETE removes rows. Always use a suitable WHERE condition with UPDATE and DELETE to avoid changing every row unintentionally."],
  ["7. Aggregate data","COUNT counts rows, AVG calculates an average, SUM totals values, MIN and MAX find extremes. GROUP BY groups rows before aggregate calculations."],
  ["8. Joins","A JOIN combines related rows from tables. An INNER JOIN returns matching rows; a LEFT JOIN keeps all rows from the left table and matching rows from the right."],
  ["9. Practical activity","Design Students(student_id, name, department) and Skills(skill_id, student_id, skill_name). Add sample records, list CSE students and join the tables to show each student's skills."],
  ["10. Key takeaway","Plan tables around the data, use keys to connect records and use SELECT to verify changes. Learn the difference between reading, inserting, updating and deleting data."]
 ],question:"What does a primary key do?",options:["Uniquely identifies a row","Styles a table","Sorts rows alphabetically"],answer:0,explain:"Correct! A primary key uniquely identifies each record in a table."},
 {id:"security",category:"cybersecurity",title:"Cybersecurity: Threats and safe practices",level:"Beginner",time:"25 min",desc:"Understand security basics, phishing, malware, updates and privacy.",body:[
  ["1. What is cybersecurity?","Cybersecurity is the practice of protecting devices, accounts, networks, applications and data from unauthorised access, damage or disruption."],
  ["2. Confidentiality, integrity and availability","Confidentiality means only authorised people can access information. Integrity means information remains accurate and unaltered without authorisation. Availability means systems and data are accessible when needed."],
  ["3. Phishing and social engineering","Phishing messages impersonate trusted organisations to trick people into sharing credentials, payment details or opening harmful attachments. Check the sender, destination and unexpected urgency."],
  ["4. Malware","Malware is software intended to harm, disrupt or gain unauthorised access. Examples include viruses, ransomware, spyware and trojans. Do not install unknown files or disable security protections to run them."],
  ["5. Device and network safety","Keep operating systems and apps updated, use screen locks, secure Wi-Fi with strong encryption and avoid sensitive activity on untrusted public networks. Use a trusted VPN when appropriate."],
  ["6. Protect personal information","Share only what is necessary. Review app permissions and privacy settings. Be careful about posting personal details that could be used to impersonate or target you."],
  ["7. Backups and recovery","Keep backups of important files and test that they can be restored. A backup can help recover from accidental deletion, device failure or ransomware."],
  ["8. What to do when something seems wrong","Stop interacting with a suspicious message, report it through the proper channel, change exposed passwords from a trusted device and contact the relevant service or institution."],
  ["9. Practical activity","Inspect a sample email: identify the sender address, unexpected request, link destination, spelling or urgency signals. Decide how you would verify it without clicking the link."],
  ["10. Key takeaway","Security is a set of habits, not a single tool. Verify unexpected requests, update software, protect accounts and report suspicious activity."]
 ],question:"You receive an unexpected message asking you to sign in through an unfamiliar link. What is safest?",options:["Click quickly","Verify the sender and visit the official site yourself","Forward it to everyone"],answer:1,explain:"Correct! Avoid the link and verify through a trusted official channel."},
 {id:"passwords",category:"cybersecurity",title:"Strong passwords, password managers and MFA",level:"Beginner",time:"25 min",desc:"Build safer sign-in habits and understand multi-factor authentication.",body:[
  ["1. Why passwords matter","A password helps prove that a person is allowed to access an account. If it is guessed, reused or exposed, an attacker may gain access."],
  ["2. Length and uniqueness","Use long, unique passwords or passphrases for every account. Reusing a password means a breach on one site can put other accounts at risk."],
  ["3. Password managers","A reputable password manager can generate and store unique passwords. Protect the manager with a strong master password and enable its available security features."],
  ["4. Multi-factor authentication","MFA asks for more than one type of proof, such as something you know (password) and something you have (security key or authenticator app). It adds protection if a password is stolen."],
  ["5. Safer verification methods","Authenticator apps and security keys are generally stronger against phishing than SMS codes. Never share one-time codes or approve an unexpected sign-in prompt."],
  ["6. Account recovery","Keep recovery email and phone details current. Store backup codes securely and never send them to someone who contacts you unexpectedly."],
  ["7. Spot credential theft","Fake sign-in pages may look genuine. Check the domain carefully and navigate to the service directly instead of using a link in an unexpected message."],
  ["8. If a password is exposed","Change it immediately on the real website, change it anywhere else it was reused, revoke unknown sessions if available and enable MFA."],
  ["9. Practical activity","Create a checklist for securing a sample account: unique password, password manager, MFA, updated recovery options and a review of active sessions."],
  ["10. Key takeaway","Use a unique password for every account, turn on MFA and never share passwords or one-time codes."]
 ],question:"Why should you avoid reusing the same password?",options:["It is harder to type","One breach could expose several accounts","It makes websites slower"],answer:1,explain:"Correct! Reuse can let attackers try a leaked password on other accounts."},
 {id:"figma",category:"design",title:"UI/UX: User research, wireframes and usability",level:"Beginner",time:"30 min",desc:"Learn how to design an interface around user needs.",body:[
  ["1. UI and UX","User Interface (UI) is the visual and interactive layer: buttons, typography, colours, spacing and screens. User Experience (UX) is the overall experience, including clarity, usefulness and ease of use."],
  ["2. Start with users","Identify who will use the product, what they are trying to achieve and what difficulties they face. Avoid designing only from personal preference."],
  ["3. User flows","A user flow maps the steps needed to complete a task, such as signing up, finding a skill and sending a request. Remove unnecessary steps and make the next action clear."],
  ["4. Wireframes","A wireframe is a simple layout sketch. It focuses on content hierarchy and placement before colours, images and detailed styling are added."],
  ["5. Visual hierarchy","Use size, weight, contrast, alignment and spacing to show what matters most. A clear heading and primary action help users understand a screen quickly."],
  ["6. Consistency and components","Reuse button styles, spacing rules, colours and form patterns. Consistent components make an interface easier to learn and maintain."],
  ["7. Accessibility","Use readable text, sufficient colour contrast, labels for inputs, meaningful button names and keyboard-friendly controls. Do not rely on colour alone to communicate status."],
  ["8. Usability testing","Ask a person to complete a realistic task without coaching them. Observe where they hesitate, misunderstand labels or make errors, then improve the design."],
  ["9. Practical activity","Sketch a simple skill-discovery screen with a search field, category filter, skill cards and a clear action. Ask a peer to find a beginner Python lesson and note any confusion."],
  ["10. Key takeaway","Good design starts with a user need, uses a clear flow and improves through feedback and testing."]
 ],question:"Which term focuses on the overall experience of using a product?",options:["UX","UI","HTML"],answer:0,explain:"Correct! UX focuses on the overall user experience."},
 {id:"canva",category:"design",title:"Visual design: Layout, typography and contrast",level:"Beginner",time:"25 min",desc:"Create clear posters, slides and digital content with design principles.",body:[
  ["1. Visual hierarchy","Visual hierarchy guides attention. Make the most important information prominent through size, weight, position and contrast."],
  ["2. Alignment and spacing","Align related elements and use consistent spacing. Empty space is useful: it separates content and prevents a design from feeling crowded."],
  ["3. Typography","Choose readable fonts and use a small number of typefaces. Establish clear heading, subheading and body-text sizes; avoid long passages in decorative fonts."],
  ["4. Colour and contrast","Use a limited colour palette. Ensure text stands out from its background and check contrast, especially for small text."],
  ["5. Images and icons","Use relevant, high-quality images and consistent icons. Avoid decorative visuals that compete with the message or make the layout confusing."],
  ["6. Grids and consistency","A grid helps align elements and create balance. Repeat styles for headings, buttons, cards and margins so multiple slides or pages feel connected."],
  ["7. Design for the audience","A classroom poster, project presentation and social media graphic have different viewing conditions. Adjust text size, density and format for the intended audience."],
  ["8. Review before sharing","Check spelling, alignment, readability, image quality and whether the main message is clear at a glance."],
  ["9. Practical activity","Create a one-page event poster with a title, date, location and call to action. Use two fonts at most, a small palette and consistent spacing."],
  ["10. Key takeaway","Effective visual design makes information easier to understand. Clarity and consistency matter more than adding decoration."]
 ],question:"What helps make important information stand out?",options:["Visual hierarchy","Using many unrelated fonts","Making all text tiny"],answer:0,explain:"Correct! Visual hierarchy guides attention to the most important content."},
 {id:"speaking",category:"soft",title:"Public speaking: Plan, present and improve",level:"Beginner",time:"25 min",desc:"Structure a short presentation and deliver it with confidence.",body:[
  ["1. Know your audience","Think about what the audience already knows, what they need to understand and what you want them to remember."],
  ["2. Define one main message","Write the central takeaway in one sentence. Keep supporting points connected to that message."],
  ["3. Structure the talk","Use an introduction, two or three main points and a conclusion. Preview the topic, explain the points in a logical order and finish with the takeaway."],
  ["4. Use examples","A short example, demonstration or comparison can make an abstract idea easier to understand. Choose examples that support the point rather than distract."],
  ["5. Design supporting slides","Use short phrases, readable text and relevant visuals. Slides should support what you say, not contain the entire speech."],
  ["6. Voice and pace","Speak clearly at a comfortable pace. Pause after important ideas, vary emphasis naturally and avoid rushing through difficult points."],
  ["7. Body language","Face the audience, use natural gestures and maintain comfortable eye contact. Stand in a balanced posture and avoid distracting movements."],
  ["8. Handle questions","Listen to the full question, answer the point directly and admit when you do not know. If needed, explain what you would investigate next."],
  ["9. Practical activity","Prepare a one-minute explanation of a feature in LearnLoop. Practise aloud, time yourself and ask a friend to repeat the main takeaway."],
  ["10. Key takeaway","Preparation, a clear structure and practice make presentations easier to follow and more confident to deliver."]
 ],question:"What is a useful way to make a short presentation clearer?",options:["Include every detail you know","Use a clear beginning, key points and conclusion","Avoid practising"],answer:1,explain:"Correct! A clear structure helps the audience follow your message."},
 {id:"communication",category:"soft",title:"Communication: Listening, questions and feedback",level:"Beginner",time:"25 min",desc:"Practise active listening and clear, respectful conversations.",body:[
  ["1. Active listening","Give the speaker your attention. Avoid interrupting or planning your reply while they are still explaining."],
  ["2. Clarifying questions","Ask open questions when you need more detail. Examples include 'Can you explain what you mean?' and 'Could you show me an example?'"],
  ["3. Paraphrasing","Restate the speaker's main point in your own words to check understanding. This can reveal misunderstandings early."],
  ["4. Clear messages","Organise your message around the main point, relevant context and the action or response you need. Use specific language rather than vague statements."],
  ["5. Non-verbal communication","Facial expression, posture, tone and pauses affect how a message is understood. Be aware that cues can differ across people and situations."],
  ["6. Giving constructive feedback","Describe the specific behaviour or work, explain its effect and suggest a practical improvement. Be respectful and focus on the task, not the person."],
  ["7. Receiving feedback","Listen without becoming defensive, ask for an example and decide which suggestion you can apply. You do not need to agree with every comment to consider it."],
  ["8. Communicating online","Use a clear subject, concise paragraphs and respectful tone. Check recipients and attachments before sending messages."],
  ["9. Practical activity","In pairs, one person explains a topic for one minute. The listener paraphrases the key point and asks one clarifying question, then both discuss what helped."],
  ["10. Key takeaway","Good communication is two-way: listen carefully, clarify meaning and respond respectfully."]
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
$("#completeLesson")?.addEventListener("click",async(e)=>{
 e.preventDefault();
 const button=$("#completeLesson");
 if(!activeLesson){$("#lessonFeedback").textContent="Please reopen the course and try again.";$("#lessonFeedback").className="lesson-feedback retry";return;}
 if(selectedLessonAnswer!==activeLesson.answer){
  $("#lessonFeedback").textContent="Please select the correct answer and press Check answer first.";
  $("#lessonFeedback").className="lesson-feedback retry";
  return;
 }
 button.disabled=true;
 button.textContent="Saving completion…";
 $("#lessonFeedback").textContent="Saving your course completion and generating your certificate…";
 $("#lessonFeedback").className="lesson-feedback";
 try{
  const result=await api(`/api/lessons/${encodeURIComponent(activeLesson.id)}/complete`,{method:"POST",body:JSON.stringify({})});
  if(!result.success)throw new Error(result.message||"The course could not be saved.");
  saveCompletedLesson(activeLesson.id);
  $("#lessonFeedback").textContent=result.message||"Course completed! Your certificate is ready.";
  $("#lessonFeedback").className="lesson-feedback correct";
  toast("Your course certificate is ready!");
  button.textContent="Completed ✓";
  renderLessons();
 }catch(err){
  $("#lessonFeedback").textContent="Could not save your course: "+err.message;
  $("#lessonFeedback").className="lesson-feedback retry";
  button.disabled=false;
  button.textContent="Mark lesson complete";
 }
});