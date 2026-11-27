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

async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});const raw=await r.text();let d;try{d=JSON.parse(raw)}catch(_){throw new Error(`Server returned HTML instead of JSON (HTTP ${r.status}). Check the Vercel deployment and API routing.`)}if(!r.ok)throw new Error(d.message||`Request failed (HTTP ${r.status})`);return d}

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
// Private two-way peer video exchange with uploader-managed highlights.
function formatVideoTime(seconds){
 const s=Math.max(0,Number(seconds)||0), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), r=Math.floor(s%60);
 return h ? [h,m,r].map((n,i)=>i===0?String(n):String(n).padStart(2,"0")).join(":") : [m,r].map(n=>String(n).padStart(2,"0")).join(":");
}
function parseVideoTime(value){
 const parts=String(value||"").trim().split(":").map(Number);
 if(!parts.length||parts.some(n=>!Number.isInteger(n)||n<0)||parts.length>3)return null;
 if(parts.length===1)return parts[0];
 if(parts.length===2)return parts[0]*60+parts[1];
 if(parts[1]>59||parts[2]>59)return null;
 return parts[0]*3600+parts[1]*60+parts[2];
}
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
    const myVideo=ex.videos.find(v=>v.is_uploader);
    if(!myVideo){
     const upload=document.createElement("form");upload.className="video-upload-form";upload.innerHTML=`<h4>Share your explanation video</h4><label>Video title<input name="title" required maxlength="100" placeholder="e.g. Python variables explained"></label><label>Skill explained<input name="skill" required maxlength="80" placeholder="e.g. Python"></label><label>Choose video<input name="video" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" required></label><button class="btn primary" type="submit">Upload video</button><small>One video per student · MP4, WEBM, MOV or M4V · up to 100 MB</small>`;
     upload.onsubmit=async e=>{e.preventDefault();const fd=new FormData(upload);const b=upload.querySelector("button");b.disabled=true;b.textContent="Uploading…";try{const r=await fetch(`/api/exchanges/${ex.id}/videos`,{method:"POST",body:fd});const data=await r.json();if(!r.ok)throw new Error(data.message||"Upload failed");toast(data.message);loadExchanges()}catch(err){toast(err.message)}finally{b.disabled=false;b.textContent="Upload video"}};
     card.appendChild(upload);
    }else{
     const note=document.createElement("p");note.className="video-uploaded-note";note.textContent="You've uploaded your video for this exchange. You can manage its highlights below.";card.appendChild(note);
    }
    const videos=document.createElement("div");videos.className="exchange-videos";const heading=document.createElement("h4");heading.textContent="Shared explanations";videos.appendChild(heading);
    if(!ex.videos.length){const p=document.createElement("p");p.textContent="No videos uploaded yet. Each of you can upload one explanation video.";videos.appendChild(p)}
    ex.videos.forEach(v=>{
     const wrap=document.createElement("div");wrap.className="shared-video";
     const title=document.createElement("h5");title.textContent=`${v.title} — ${v.skill}`;
     const by=document.createElement("p");by.textContent=`Uploaded by ${v.uploader_id===ex.requester_id?ex.requester_name:ex.peer_name}`;
     const player=document.createElement("video");player.controls=true;player.preload="metadata";player.src=`/api/exchanges/${ex.id}/videos/${v.id}`;
     wrap.append(title,by,player);
     const highlights=document.createElement("div");highlights.className="video-highlights";
     const highlightsTitle=document.createElement("h5");highlightsTitle.textContent="Video highlights";highlights.appendChild(highlightsTitle);
     if(v.highlights&&v.highlights.length){
      const list=document.createElement("div");list.className="video-highlight-list";
      v.highlights.forEach(h=>{
       const item=document.createElement("div");item.className="video-highlight-item";
       const jump=document.createElement("button");jump.type="button";jump.className="video-highlight-jump";jump.textContent=formatVideoTime(h.timestamp_seconds);jump.title="Jump to this moment";jump.onclick=()=>{player.currentTime=Number(h.timestamp_seconds);player.play().catch(()=>{})};
       const detail=document.createElement("div");detail.className="video-highlight-detail";
       const label=document.createElement("strong");label.textContent=h.title;detail.appendChild(label);
       if(h.description){const desc=document.createElement("p");desc.textContent=h.description;detail.appendChild(desc)}
       item.append(jump,detail);
       if(v.is_uploader){
        const actions=document.createElement("div");actions.className="video-highlight-actions";
        const edit=document.createElement("button");edit.type="button";edit.className="btn outline";edit.textContent="Edit";edit.onclick=async()=>{
         const newTitle=prompt("Highlight title:",h.title);if(newTitle===null)return;
         const newTime=prompt("Timestamp (MM:SS or HH:MM:SS):",formatVideoTime(h.timestamp_seconds));if(newTime===null)return;
         const seconds=parseVideoTime(newTime);if(seconds===null){toast("Enter a valid timestamp.");return}
         const newDesc=prompt("Short description (optional):",h.description||"");if(newDesc===null)return;
         try{const r=await api(`/api/exchanges/${ex.id}/videos/${v.id}/highlights/${h.id}`,{method:"PUT",body:JSON.stringify({title:newTitle,description:newDesc,timestamp_seconds:seconds})});toast(r.message);loadExchanges()}catch(err){toast(err.message)}
        };
        const del=document.createElement("button");del.type="button";del.className="btn outline";del.textContent="Delete";del.onclick=async()=>{if(!confirm("Delete this highlight?"))return;try{const r=await api(`/api/exchanges/${ex.id}/videos/${v.id}/highlights/${h.id}`,{method:"DELETE"});toast(r.message);loadExchanges()}catch(err){toast(err.message)}};
        actions.append(edit,del);item.appendChild(actions);
       }
       list.appendChild(item);
      });
      highlights.appendChild(list);
     }else{const empty=document.createElement("p");empty.className="video-highlights-empty";empty.textContent="No highlights added yet.";highlights.appendChild(empty)}
     if(v.is_uploader){
      const form=document.createElement("form");form.className="highlight-form";
      form.innerHTML=`<h6>Add a highlight to your video</h6><label>Timestamp (MM:SS or HH:MM:SS)<input name="timestamp" required placeholder="02:15"></label><label>Highlight title<input name="title" required maxlength="100" placeholder="e.g. Introduction to variables"></label><label>Short description (optional)<input name="description" maxlength="300" placeholder="What will learners find here?"></label><button class="btn primary" type="submit">Add highlight</button>`;
      form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),seconds=parseVideoTime(fd.get("timestamp"));if(seconds===null){toast("Enter a valid timestamp like 02:15.");return}if(Number.isFinite(player.duration)&&seconds>player.duration){toast("Timestamp is beyond the video duration.");return}const button=form.querySelector("button");button.disabled=true;try{const r=await api(`/api/exchanges/${ex.id}/videos/${v.id}/highlights`,{method:"POST",body:JSON.stringify({timestamp_seconds:seconds,title:fd.get("title"),description:fd.get("description")})});toast(r.message);loadExchanges()}catch(err){toast(err.message)}finally{button.disabled=false}};
      highlights.appendChild(form);
     }
     wrap.appendChild(highlights);videos.appendChild(wrap);
    });
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

const lessonQuestionBank = {
html:[
{question:"Which tag creates a hyperlink?",options:["<a>","<img>","<p>"],answer:0,explain:"The <a> element creates a hyperlink."},
{question:"Where does visible page content belong?",options:["<head>","<body>","<meta>"],answer:1,explain:"The body contains visible page content."},
{question:"Which attribute provides alternative text for an image?",options:["href","src","alt"],answer:2,explain:"The alt attribute describes an image."},
{question:"Which element identifies a navigation section?",options:["<nav>","<footer>","<title>"],answer:0,explain:"The nav element identifies navigation links."},
{question:"Which tag displays an image?",options:["<img>","<a>","<table>"],answer:0,explain:"The img element embeds an image."},
{question:"Which attribute sets a link destination?",options:["src","href","alt"],answer:1,explain:"href specifies the destination of a hyperlink."},
{question:"Which list is numbered by default?",options:["<ul>","<ol>","<div>"],answer:1,explain:"ol creates an ordered list."},
{question:"Why should inputs have labels?",options:["For clarity and accessibility","To change colours","To create tables"],answer:0,explain:"Labels identify inputs and help assistive technology."},
{question:"Which element contains the page's main content?",options:["<main>","<head>","<title>"],answer:0,explain:"main identifies the dominant content of the page."}
],
python:[
{question:"Which symbol starts a Python comment?",options:["//","#","<!--"],answer:1,explain:"A hash begins a single-line Python comment."},
{question:"Which keyword defines a function?",options:["func","function","def"],answer:2,explain:"Python uses def to define functions."},
{question:"What does len([4,7,9]) return?",options:["2","3","4"],answer:1,explain:"There are three items in the list."},
{question:"Which loop iterates over a list?",options:["for","switch","repeat-until"],answer:0,explain:"A for loop iterates through a sequence."},
{question:"What does 10 // 3 return?",options:["3.33","3","1"],answer:1,explain:"// performs floor division."},
{question:"Which type stores True or False?",options:["bool","str","list"],answer:0,explain:"bool stores Boolean values."},
{question:"What does list.append() do?",options:["Adds an item","Sorts items","Deletes the list"],answer:0,explain:"append adds an item to the end of a list."},
{question:"Which statement exits a loop?",options:["skip","stop","break"],answer:2,explain:"break exits the nearest loop."},
{question:"What does return do in a function?",options:["Sends a result to the caller","Prints automatically","Repeats the function"],answer:0,explain:"return passes a value back to the caller."}
],
sql:[
{question:"Which SQL command retrieves data?",options:["UPDATE","SELECT","DELETE"],answer:1,explain:"SELECT reads data from tables."},
{question:"Which clause filters rows?",options:["WHERE","ORDER BY","GROUP BY"],answer:0,explain:"WHERE filters rows by a condition."},
{question:"Which command adds a new row?",options:["INSERT","ALTER","DROP"],answer:0,explain:"INSERT adds records to a table."},
{question:"What does INNER JOIN return?",options:["All left rows","Only matching rows","Only duplicate columns"],answer:1,explain:"INNER JOIN returns matching rows from both tables."},
{question:"Which key uniquely identifies a record?",options:["Foreign key","Primary key","Duplicate key"],answer:1,explain:"A primary key uniquely identifies a row."},
{question:"Which clause sorts query results?",options:["ORDER BY","WHERE","VALUES"],answer:0,explain:"ORDER BY sorts returned rows."},
{question:"Which command changes existing records?",options:["UPDATE","INSERT","CREATE"],answer:0,explain:"UPDATE modifies existing rows."},
{question:"Which function counts rows?",options:["SUM()","COUNT()","AVG()"],answer:1,explain:"COUNT() counts rows or non-null values."},
{question:"What does a foreign key do?",options:["References a key in a related table","Styles a table","Encrypts a database"],answer:0,explain:"A foreign key establishes a relationship between records."}
],
security:[
{question:"What does confidentiality mean?",options:["Everyone can access data","Only authorised people can access data","Systems never go offline"],answer:1,explain:"Confidentiality limits access to authorised people."},
{question:"Which is a phishing warning sign?",options:["Unexpected urgent sign-in request","A bookmarked official site","A planned update"],answer:0,explain:"Unexpected urgency and sign-in links are common warning signs."},
{question:"What is ransomware?",options:["A backup tool","Malware that blocks or encrypts data","A browser setting"],answer:1,explain:"Ransomware blocks or encrypts data and demands payment."},
{question:"Why are software updates important?",options:["They can fix security weaknesses","They remove all passwords","They replace backups"],answer:0,explain:"Updates often fix known security vulnerabilities."},
{question:"What does integrity mean in the CIA triad?",options:["Data remains accurate and unaltered without authorisation","Everyone can read data","Systems never go offline"],answer:0,explain:"Integrity protects data from unauthorised modification."},
{question:"What is social engineering?",options:["Manipulating people to reveal information or act unsafely","Updating a layout","Compressing files"],answer:0,explain:"Social engineering exploits human trust or behaviour."},
{question:"What should you do with a suspicious attachment?",options:["Open it","Verify the sender through a trusted channel","Forward it"],answer:1,explain:"Do not open unexpected attachments; verify independently."},
{question:"Why are backups useful?",options:["They help restore lost data","They stop all phishing","They replace updates"],answer:0,explain:"Backups help recover data after loss or damage."},
{question:"What does availability mean?",options:["Systems and data are accessible when needed","Passwords are public","Data cannot change"],answer:0,explain:"Availability ensures authorised users can access resources when required."}
],
passwords:[
{question:"What is the safest password habit?",options:["Reuse one password","Use unique passwords for each account","Share passwords"],answer:1,explain:"Unique passwords stop one breach exposing other accounts."},
{question:"What does MFA add?",options:["A second proof of identity","A longer username","A public profile"],answer:0,explain:"MFA requires another factor beyond the password."},
{question:"Which should never be shared?",options:["Public username","One-time verification code","Public website URL"],answer:1,explain:"One-time codes can let someone access your account."},
{question:"What should you do if a password is exposed?",options:["Keep using it","Post it online","Change it and anywhere it was reused"],answer:2,explain:"Change exposed and reused passwords immediately."},
{question:"What is a passphrase?",options:["A longer sequence of words used as a password","A username","A one-time code"],answer:0,explain:"A passphrase combines words into a longer credential."},
{question:"Which method is generally phishing-resistant?",options:["A security key","A reused password","A code sent by a stranger"],answer:0,explain:"Security keys provide strong phishing-resistant authentication."},
{question:"Why use a password manager?",options:["To generate and store unique passwords","To share passwords publicly","To turn off MFA"],answer:0,explain:"Password managers help manage unique credentials."},
{question:"What should you do with an unexpected MFA prompt?",options:["Approve it","Deny it and check account activity","Share it"],answer:1,explain:"An unexpected prompt may indicate an attempted sign-in."},
{question:"What are backup codes for?",options:["Account recovery when MFA is unavailable","Sharing passwords","Creating email addresses"],answer:0,explain:"Backup codes provide an alternative account recovery method."}
],
figma:[
{question:"What is the purpose of a wireframe?",options:["Plan screen layout","Choose animations","Write database queries"],answer:0,explain:"Wireframes plan structure before detailed styling."},
{question:"What does UX focus on?",options:["Only colours","Overall user experience","Only source code"],answer:1,explain:"UX focuses on the complete experience of using a product."},
{question:"Why reuse components?",options:["Keep patterns consistent","Make every page different","Remove accessibility"],answer:0,explain:"Reusable components improve consistency."},
{question:"What is a useful usability test?",options:["Ask users to complete a realistic task","Tell users every click","Only ask designers"],answer:0,explain:"Observe users completing realistic tasks."},
{question:"What is a user flow?",options:["Steps a user follows to complete a task","A colour palette","A backup"],answer:0,explain:"A user flow maps the path to achieve a goal."},
{question:"Which is an example of visual hierarchy?",options:["Making the main heading prominent","Making every element identical","Removing spacing"],answer:0,explain:"Hierarchy uses size and placement to show importance."},
{question:"What is a design component?",options:["A reusable interface element","A password","A network protocol"],answer:0,explain:"Components are reusable elements such as buttons and cards."},
{question:"Why check colour contrast?",options:["To improve readability","To increase file size","To hide buttons"],answer:0,explain:"Adequate contrast improves legibility and accessibility."},
{question:"What should follow usability testing?",options:["Review feedback and improve confusing areas","Ignore difficulties","Remove labels"],answer:0,explain:"Testing reveals issues that can guide design improvements."}
],
canva:[
{question:"What does visual hierarchy do?",options:["Hides the main message","Guides attention","Makes all text equal"],answer:1,explain:"Hierarchy guides attention to important information."},
{question:"Why is contrast important?",options:["Improves readability","Makes text decorative","Replaces alignment"],answer:0,explain:"Contrast helps distinguish text from its background."},
{question:"What is whitespace useful for?",options:["Separating content","Filling every empty area","Hiding headings"],answer:0,explain:"Whitespace reduces clutter and organises content."},
{question:"What typography approach suits a simple poster?",options:["Many unrelated fonts","A small consistent set","A new font per sentence"],answer:1,explain:"A small font set keeps the design readable."},
{question:"What is a colour palette?",options:["A planned set of design colours","A file list","A database"],answer:0,explain:"A palette is a coordinated set of colours."},
{question:"Why align related elements?",options:["To create order and easier scanning","To reduce readability","To remove hierarchy"],answer:0,explain:"Alignment makes a layout organised."},
{question:"What should stand out on a poster?",options:["The main headline","A minor footnote","A page number"],answer:0,explain:"The headline communicates the primary message."},
{question:"What is a grid useful for?",options:["Arranging elements consistently","Generating passwords","Editing audio"],answer:0,explain:"Grids help align content and create balance."},
{question:"What should you check before sharing a design?",options:["Spelling, readability and alignment","Only the filename","Whether every space is filled"],answer:0,explain:"A final review catches errors and improves clarity."}
],
speaking:[
{question:"What should you decide before preparing a talk?",options:["Audience and main message","Slide animation first","How to avoid practice"],answer:0,explain:"Audience and purpose shape the presentation."},
{question:"Which structure works well?",options:["Conclusion only","Introduction, key points, conclusion","Random facts"],answer:1,explain:"A clear beginning, middle and end help listeners follow."},
{question:"What is a useful speaking habit?",options:["Rush","Pause after important ideas","Read tiny slide text"],answer:1,explain:"Pauses give listeners time to understand."},
{question:"What if you do not know an answer?",options:["Make it up","Admit it and explain how to check","Ignore it"],answer:1,explain:"Honesty and a clear next step build trust."},
{question:"Why practise a presentation aloud?",options:["To check timing and improve delivery","To avoid learning the topic","To make slides longer"],answer:0,explain:"Practice improves pacing, clarity and confidence."},
{question:"What should slides contain?",options:["Short points and relevant visuals","Every word of the speech","Tiny paragraphs"],answer:0,explain:"Slides should support the speaker."},
{question:"How should you handle a question you do not understand?",options:["Ask for clarification","Guess","Ignore it"],answer:0,explain:"Clarifying helps you answer the actual question."},
{question:"What does varying your pace help with?",options:["Emphasising important ideas","Making every sentence confusing","Avoiding preparation"],answer:0,explain:"Pacing and pauses make a talk easier to follow."},
{question:"What belongs in a useful conclusion?",options:["The key takeaway","Unrelated topics","An abrupt stop"],answer:0,explain:"A conclusion reinforces the main message."}
],
communication:[
{question:"What is active listening?",options:["Plan your reply","Give attention and check understanding","Interrupt"],answer:1,explain:"Active listening means paying attention and checking understanding."},
{question:"Which is an open clarifying question?",options:["Can you explain what you mean?","You are wrong, right?","Is that all?"],answer:0,explain:"Open questions invite useful detail."},
{question:"What makes feedback constructive?",options:["Criticise the person","Describe specific work and suggest improvement","Be vague"],answer:1,explain:"Constructive feedback focuses on behaviour and a practical next step."},
{question:"What is useful in a professional email?",options:["Clear subject and concise message","No subject","All capital letters"],answer:0,explain:"A clear subject and concise message help the reader."},
{question:"Why paraphrase what someone said?",options:["To check understanding","To change their meaning","To interrupt"],answer:0,explain:"Paraphrasing confirms understanding and invites clarification."},
{question:"Which feedback is most specific?",options:["Your introduction states the topic; add an example to point two","This is bad","Try harder"],answer:0,explain:"Specific feedback describes what worked and what to improve."},
{question:"What is a good way to receive feedback?",options:["Listen and ask for an example","Interrupt","Reject every suggestion"],answer:0,explain:"Listening and asking questions helps you understand feedback."},
{question:"What should you check before sending an email?",options:["Recipients, subject and attachments","Only font colour","Number of emojis"],answer:0,explain:"Checking these details prevents common mistakes."},
{question:"How can you disagree respectfully?",options:["Explain your reason calmly and listen","Insult the person","Refuse to listen"],answer:0,explain:"Respectful disagreement focuses on ideas, not personal attacks."}
]
};

let activeLearnCategory="all", activeLesson=null, selectedLessonAnswer=null, activeLessonQuestions=[];
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
 activeLesson=lessons.find(l=>l.id===id);selectedLessonAnswer=null;activeLessonQuestions=[];
 $("#lessonCategoryLabel").textContent=activeLesson.category.toUpperCase()+" · "+activeLesson.time;
 $("#lessonTitle").textContent=activeLesson.title;
 $("#lessonBody").innerHTML=activeLesson.body.map(([h,p])=>`<section><h3>${h}</h3><p>${p.replaceAll("<","&lt;").replaceAll(">","&gt;")}</p></section>`).join("");
 activeLessonQuestions=[{question:activeLesson.question,options:activeLesson.options,answer:activeLesson.answer,explain:activeLesson.explain},...(lessonQuestionBank[activeLesson.id]||[])];
 $("#lessonQuiz").innerHTML='<h3>Knowledge check · '+activeLessonQuestions.length+' questions</h3>'+activeLessonQuestions.map((q,qi)=>'<section class="lesson-question"><p><strong>Q'+(qi+1)+'. '+q.question+'</strong></p>'+q.options.map((o,oi)=>'<label class="quiz-option"><input type="radio" name="lessonAnswer'+qi+'" value="'+oi+'"> '+o.replaceAll("<","&lt;").replaceAll(">","&gt;")+'</label>').join("")+'</section>').join("");
 $("#lessonFeedback").textContent="Choose an answer and check it to unlock lesson completion.";
 $("#checkAnswer").disabled=false;$("#completeLesson").disabled=true;
 $("#lessonModal").classList.add("show");$("#lessonModal").setAttribute("aria-hidden","false");
}
$("#lessonGrid")?.addEventListener("click",e=>{});
$("#lessonSearch")?.addEventListener("input",renderLessons);
$("#learnFilters")?.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{activeLearnCategory=b.dataset.category;$("#learnFilters").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));renderLessons()}));
$("#closeLesson")?.addEventListener("click",()=>{$("#lessonModal").classList.remove("show");$("#lessonModal").setAttribute("aria-hidden","true")});
$("#lessonModal")?.addEventListener("click",e=>{if(e.target.id==="lessonModal")$("#closeLesson").click()});
$("#checkAnswer")?.addEventListener("click",()=>{
 const unanswered=activeLessonQuestions.findIndex((q,i)=>!document.querySelector('input[name="lessonAnswer'+i+'"]:checked'));
 if(unanswered>=0){$("#lessonFeedback").textContent="Please answer all "+activeLessonQuestions.length+" questions before checking.";$("#lessonFeedback").className="lesson-feedback retry";return;}
 let score=0;const missed=[];
 activeLessonQuestions.forEach((q,i)=>{const chosen=Number(document.querySelector('input[name="lessonAnswer'+i+'"]:checked').value);if(chosen===q.answer)score++;else missed.push(i+1);});
 if(score===activeLessonQuestions.length){
  $("#lessonFeedback").textContent="Excellent! You got "+score+"/"+activeLessonQuestions.length+" correct. "+activeLessonQuestions.map(q=>q.explain).join(" ");
  $("#lessonFeedback").className="lesson-feedback correct";$("#completeLesson").disabled=false;$("#checkAnswer").disabled=true;
 }else{
  $("#lessonFeedback").textContent="You got "+score+"/"+activeLessonQuestions.length+" correct. Review questions "+missed.join(", ")+", change your answers and check again.";
  $("#lessonFeedback").className="lesson-feedback retry";
 }
});
$("#completeLesson")?.addEventListener("click",async(e)=>{
 e.preventDefault();
 const button=$("#completeLesson");
 if(!activeLesson){$("#lessonFeedback").textContent="Please reopen the course and try again.";$("#lessonFeedback").className="lesson-feedback retry";return;}
 if(!activeLessonQuestions.length || !activeLessonQuestions.every((q,i)=>Number(document.querySelector('input[name="lessonAnswer'+i+'"]:checked')?.value)===q.answer)){
  $("#lessonFeedback").textContent="Please select the correct answer and press Check answer first.";
  $("#lessonFeedback").className="lesson-feedback retry";
  return;
 }
 button.disabled=true;
 button.textContent="Saving completion…";
 $("#lessonFeedback").textContent="Saving your course completion and generating your certificate…";
 $("#lessonFeedback").className="lesson-feedback";
 try{
  const result=await api("/api/certificates",{method:"POST",body:JSON.stringify({lesson_id:activeLesson.id})});
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
/* Temporary local-only video highlights preview. No file or demo data is sent to the server. */
(()=>{
 const open=$("#openHighlightDemo"), panel=$("#highlightDemo"), close=$("#closeHighlightDemo");
 const file=$("#demoVideoFile"), player=$("#demoVideoPlayer"), form=$("#demoHighlightForm"), list=$("#demoHighlightList");
 if(!open||!panel||!file||!player||!form||!list)return;
 let objectUrl=null, demoHighlights=[];
 function parseDemoTime(value){
  const parts=String(value||"").trim().split(":").map(Number);
  if(!parts.length||parts.length>3||parts.some(n=>!Number.isInteger(n)||n<0))return null;
  if(parts.length===1)return parts[0];
  if(parts.length===2)return parts[0]*60+parts[1];
  if(parts[1]>59||parts[2]>59)return null;
  return parts[0]*3600+parts[1]*60+parts[2];
 }
 function timeLabel(seconds){
  const n=Math.max(0,Number(seconds)||0),h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=Math.floor(n%60);
  return h?[h,m,s].map((v,i)=>i?String(v).padStart(2,"0"):String(v)).join(":"):[m,s].map(v=>String(v).padStart(2,"0")).join(":");
 }
 function render(){
  list.innerHTML="";
  if(!demoHighlights.length){const p=document.createElement("p");p.className="video-highlights-empty";p.textContent="No demo highlights yet. Add one above.";list.appendChild(p);return}
  demoHighlights.sort((a,b)=>a.seconds-b.seconds).forEach((h,index)=>{
   const item=document.createElement("div");item.className="video-highlight-item";
   const jump=document.createElement("button");jump.type="button";jump.className="video-highlight-jump";jump.textContent=timeLabel(h.seconds);jump.onclick=()=>{player.currentTime=h.seconds;player.play().catch(()=>{})};
   const detail=document.createElement("div");detail.className="video-highlight-detail";
   const title=document.createElement("strong");title.textContent=h.title;detail.appendChild(title);
   if(h.description){const desc=document.createElement("p");desc.textContent=h.description;detail.appendChild(desc)}
   const del=document.createElement("button");del.type="button";del.className="btn outline";del.textContent="Remove";del.onclick=()=>{demoHighlights=demoHighlights.filter((_,i)=>i!==index);render()};
   item.append(jump,detail,del);list.appendChild(item);
  });
 }
 open.addEventListener("click",()=>{panel.classList.remove("hidden");panel.scrollIntoView({behavior:"smooth",block:"start"})});
 close.addEventListener("click",()=>panel.classList.add("hidden"));
 file.addEventListener("change",()=>{
  if(objectUrl)URL.revokeObjectURL(objectUrl);
  const chosen=file.files&&file.files[0];demoHighlights=[];render();
  if(!chosen){player.removeAttribute("src");player.load();return}
  if(!chosen.type.startsWith("video/")){toast("Please choose a video file.");file.value="";return}
  objectUrl=URL.createObjectURL(chosen);player.src=objectUrl;player.load();
 });
 form.addEventListener("submit",e=>{
  e.preventDefault();
  if(!player.src){toast("Choose a video first.");return}
  const data=new FormData(form),seconds=parseDemoTime(data.get("timestamp"));
  if(seconds===null){toast("Enter a timestamp like 02:15.");return}
  if(Number.isFinite(player.duration)&&seconds>player.duration){toast("That timestamp is beyond the video duration.");return}
  demoHighlights.push({seconds,title:String(data.get("title")).trim(),description:String(data.get("description")).trim()});
  form.reset();render();toast("Demo highlight added.");
 });
 window.addEventListener("beforeunload",()=>{if(objectUrl)URL.revokeObjectURL(objectUrl)});
})();
