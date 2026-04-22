/* ═══════════════════════════════════════════════════════════════
   AEGIS — Mission Control Frontend v3
   Themes, Dashboard Charts, Arbiter Modal, Canvas Network
   ═══════════════════════════════════════════════════════════════ */

// ── Toast Notification System ───────────────────────────────────────────
function showToast(message, type = 'success', durationMs = 3500) {
  let container = document.getElementById('aegis-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'aegis-toast-container';
    container.style.cssText = 'position:fixed;top:70px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const colors = { success: '#00b894', error: '#ff6b6b', info: '#0abde3', warning: '#f59e0b' };
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  toast.style.cssText = `pointer-events:auto;display:flex;align-items:center;gap:10px;padding:10px 18px;background:rgba(22,22,37,0.95);border:1px solid ${colors[type]||colors.info};border-radius:12px;font-size:0.78rem;color:#e2e8f0;font-family:'Inter',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5);backdrop-filter:blur(12px);transform:translateX(120%);transition:transform 0.35s cubic-bezier(0.22,1,0.36,1),opacity 0.3s;max-width:380px`;
  toast.innerHTML = `<span style="font-size:1.1rem">${icons[type]||icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, durationMs);
}

const SAMPLES = {
  cardiac: `Patient John Doe, 58M. Chief complaint: chest pain radiating to left arm for 2 hours. History of Type 2 DM on metformin 1000mg BID, HTN on lisinopril 20mg daily. Allergies: penicillin, sulfa. BP 158/94, HR 92, SpO2 96%. ECG shows ST depression V3-V5. Troponin 0.08 (normal <0.04). Started aspirin 325mg, nitroglycerin SL, warfarin 5mg daily. Assessment: Unstable angina. Plan: admit to CCU, cardiology consult, serial troponins, cardiac catheterization.`,
  sepsis: `Patient Jane Smith, 72F. Brought to ED by ambulance with altered mental status, fever x2 days. PMH: COPD on albuterol, CKD Stage 3, atrial fibrillation on warfarin 5mg daily. Allergies: codeine. Vitals: BP 82/50, HR 118, Temp 39.8°C, SpO2 89%, RR 28. Labs: WBC 22.4, Lactate 4.8, Creatinine 3.2, INR 3.8, Glucose 48, Hemoglobin 7.2. UA positive for nitrites and leukocytes. CXR: bilateral infiltrates. Assessment: Septic shock, likely urinary source with possible pneumonia. Plan: aggressive IV fluids, broad-spectrum antibiotics, vasopressors, ICU admission.`,
  trauma: `Patient Mike Johnson, 34M. MVC at highway speed, unrestrained driver. GCS 13 (E3V4M6). C-collar in place. PMH: Asthma on albuterol PRN. No known drug allergies. Vitals: BP 100/68, HR 110, SpO2 94%, RR 22, Temp 36.4°C. Exam: Left chest wall tenderness with diminished breath sounds, abdominal tenderness LUQ, left femur deformity. FAST exam: free fluid in splenic window. Labs: Hemoglobin 9.8, Platelets 142, Lactate 3.1. CT chest: left-sided pneumothorax with rib fractures 5-8. Assessment: Polytrauma with splenic laceration, pneumothorax, femur fracture. Plan: chest tube, trauma surgery consult, possible splenectomy, orthopedic consult.`,
  pediatric: `Patient Emma Wilson, 8F. Brought by mother with headache x3 days, worsening today. Also reports vomiting x2, blurred vision. No trauma history. PMH: none. Allergies: penicillin. Currently on amoxicillin 250mg TID started by PCP 2 days ago for ear infection. BP 118/78, HR 64, Temp 37.5°C, SpO2 99%. Neuro exam: mild papilledema noted. Assessment: Viral headache. Plan: ibuprofen 200mg q6h PRN, rest, f/u if no improvement in 48h.`,
  geriatric: `Patient Margaret Jones, 84F. Presents after mechanical fall at home, tripped on rug. PMH: Osteoporosis, HTN on amlodipine 10mg, AFib on apixaban 5mg BID, hypothyroidism on levothyroxine 75mcg daily, depression on sertraline 50mg daily. Allergies: sulfa. BP 148/88, HR 88, SpO2 97%. X-ray left wrist: non-displaced distal radius fracture. Hemoglobin 10.2 (baseline 12.8). CT head not performed. Assessment: Colles fracture left wrist. Plan: splint, orthopedics follow-up, acetaminophen for pain.`,
  stroke: `Patient David Park, 76M. Presented with sudden right-sided weakness and slurred speech x45 minutes. PMH: Atrial fibrillation (not on anticoagulation — stopped warfarin 2 months ago due to GI bleed), Type 2 DM on glipizide 5mg BID, HTN on metoprolol 50mg BID and hydrochlorothiazide 25mg daily. Allergies: none. BP 192/108, HR 94 irregular, Temp 36.8°C, SpO2 97%, RR 16. NIH Stroke Scale: 14. CT head: no hemorrhage. Assessment: Acute ischemic stroke, likely cardioembolic. Plan: tPA administration, neurology consult, ICU monitoring.`,
  psychiatric: `Patient Sarah Miller, 28F. ED presentation with agitation, paranoia, and self-harm ideation. PMH: Bipolar disorder on lithium 300mg TID, hypothyroidism on levothyroxine 100mcg. Currently also taking ibuprofen 800mg TID for back pain x1 week. Allergies: none. BP 138/88, HR 102, Temp 37.1°C. Labs: Lithium level 1.8 mEq/L (therapeutic 0.6-1.2), Creatinine 1.6, TSH 8.2, Na 132. Assessment: Bipolar mania with psychotic features. Plan: increase lithium per psychiatry, add haloperidol 5mg IM PRN agitation.`,
  pneumonia: `Patient Thomas R., 62yo M. Chief Complaint: Worsening cough, fever, and shortness of breath for 3 days. HPI: Patient presents to the ED with a 3-day history of productive cough (yellow/green sputum), subjective fevers, and progressive dyspnea on exertion. He reports feeling unusually fatigued. Past Medical History: Hypertension, Type 2 Diabetes Mellitus, Asthma (moderate persistent). Allergies: Penicillin (causes severe hives/anaphylaxis). Vitals: BP 138/86, HR 104 bpm, Resp Rate 22 breaths/min, Temp 38.6°C (101.5°F), SpO2 92% on room air. Current Medications: Metformin 500mg BID, Lisinopril 10mg daily, Albuterol inhaler PRN. Assessment & Plan: 1. Suspected community-acquired pneumonia. Will order a Chest X-Ray to confirm. 2. Given the symptoms and vitals, covering for typical and atypical organisms. Prescribing Amoxicillin-Clavulanate 875/125 mg PO BID and Azithromycin 500mg PO day 1. 3. Patient's asthma is acting up due to the infection; will prescribe Propranolol 10mg for anxiety related to the shortness of breath. 4. Continuing home meds.`
};

// ── State ────────────────────────────────────────────────────
let isRunning = false, timerInterval = null, startTime = 0;
let imageBase64 = null, imageMimeType = null, completedAgents = 0;
let lastArbiterData = null, lastPipelineResult = null;

const $ = (sel) => document.querySelector(sel);

// ═══════════════════════════════════════════════════════════════
//  THEME SWITCHER
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll(".theme-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".theme-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.documentElement.setAttribute("data-theme", btn.dataset.theme);
    localStorage.setItem("aegis-theme", btn.dataset.theme);
    // Update particle colors
    const cs = getComputedStyle(document.documentElement);
    const pa = cs.getPropertyValue("--particle-a").trim();
    const pb = cs.getPropertyValue("--particle-b").trim();
    bgParticles.forEach(p => { p.color = Math.random() > 0.5 ? pa : pb; });
  });
});
// Load saved theme
const savedTheme = localStorage.getItem("aegis-theme");
if (savedTheme) {
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.querySelectorAll(".theme-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.theme === savedTheme);
  });
}

// ═══════════════════════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════════════════════
$("#runAegis").addEventListener("click", runPipeline);
document.querySelectorAll(".sample-btn").forEach(btn => {
  btn.addEventListener("click", () => { $("#clinicalInput").value = SAMPLES[btn.dataset.sample] || ""; });
});
const imageUpload = $("#imageUpload");
imageUpload.addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  imageMimeType = file.type;
  const reader = new FileReader();
  reader.onload = ev => { imageBase64 = ev.target.result.split(",")[1]; $("#imagePreview").src = ev.target.result; $("#imagePreviewArea").classList.remove("hidden"); $("#imageUploadLabel").classList.add("has-image"); };
  reader.readAsDataURL(file);
});
$("#removeImage").addEventListener("click", () => { imageBase64 = null; imageMimeType = null; imageUpload.value = ""; $("#imagePreviewArea").classList.add("hidden"); $("#imageUploadLabel").classList.remove("has-image"); });

// ── Modal ────────────────────────────────────────────────────
$("#expandArbiter").addEventListener("click", openArbiterModal);
$("#closeArbiterModal").addEventListener("click", () => { $("#arbiterModal").classList.remove("open"); });
$("#arbiterModal").addEventListener("click", e => { if (e.target === e.currentTarget) { $("#arbiterModal").classList.remove("open"); }});

function openArbiterModal() {
  if (!lastArbiterData) return;
  const modal = $("#arbiterModal");
  const d = lastArbiterData;
  $("#modalRiskBadge").textContent = `${d.overallRisk || "—"} RISK`;
  const body = $("#arbiterModalBody");
  body.innerHTML = document.getElementById("body-arbiter").innerHTML;
  modal.classList.add("open");
}

// ═══════════════════════════════════════════════════════════════
//  BACKGROUND PARTICLES
// ═══════════════════════════════════════════════════════════════
const bgCanvas = document.getElementById("bgCanvas");
const bgCtx = bgCanvas.getContext("2d");
let bgParticles = [];

function resizeBg() { bgCanvas.width = window.innerWidth; bgCanvas.height = window.innerHeight; }
resizeBg(); window.addEventListener("resize", resizeBg);

const cs = getComputedStyle(document.documentElement);
const initPA = cs.getPropertyValue("--particle-a").trim() || "108,92,231";
const initPB = cs.getPropertyValue("--particle-b").trim() || "0,206,201";
for (let i = 0; i < 55; i++) {
  bgParticles.push({ x: Math.random()*window.innerWidth, y: Math.random()*window.innerHeight, r: Math.random()*1.4+0.3, dx: (Math.random()-0.5)*0.25, dy: (Math.random()-0.5)*0.25, alpha: Math.random()*0.25+0.04, color: Math.random()>0.5?initPA:initPB });
}
function drawBgParticles() {
  bgCtx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
  for (const p of bgParticles) {
    p.x+=p.dx; p.y+=p.dy;
    if(p.x<0)p.x=bgCanvas.width; if(p.x>bgCanvas.width)p.x=0; if(p.y<0)p.y=bgCanvas.height; if(p.y>bgCanvas.height)p.y=0;
    bgCtx.beginPath(); bgCtx.arc(p.x,p.y,p.r,0,Math.PI*2); bgCtx.fillStyle=`rgba(${p.color},${p.alpha})`; bgCtx.fill();
  }
  for(let i=0;i<bgParticles.length;i++){for(let j=i+1;j<bgParticles.length;j++){const dx=bgParticles[i].x-bgParticles[j].x,dy=bgParticles[i].y-bgParticles[j].y,d=Math.sqrt(dx*dx+dy*dy);if(d<110){bgCtx.beginPath();bgCtx.moveTo(bgParticles[i].x,bgParticles[i].y);bgCtx.lineTo(bgParticles[j].x,bgParticles[j].y);bgCtx.strokeStyle=`rgba(${bgParticles[i].color},${0.035*(1-d/110)})`;bgCtx.stroke();}}}
  requestAnimationFrame(drawBgParticles);
}
drawBgParticles();

// ═══════════════════════════════════════════════════════════════
//  AGENT NETWORK CANVAS — Professional Data Transfer Animation
// ═══════════════════════════════════════════════════════════════
const netCanvas=document.getElementById("networkCanvas"),netCtx=netCanvas.getContext("2d"),dpr=window.devicePixelRatio||1;
function resizeNet(){const r=netCanvas.parentElement.getBoundingClientRect();netCanvas.width=r.width*dpr;netCanvas.height=290*dpr;netCanvas.style.width=r.width+"px";netCanvas.style.height="290px";netCtx.setTransform(dpr,0,0,dpr,0,0);}
const AGENTS=[
  {id:"scribe",label:"Scribe",icon:"🖊️",color:"#a29bfe",x:0,y:0,state:"idle",time:null},
  {id:"guardian",label:"Guardian",icon:"🛡️",color:"#00cec9",x:0,y:0,state:"idle",time:null},
  {id:"compliance",label:"Compliance",icon:"📋",color:"#fdcb6e",x:0,y:0,state:"idle",time:null},
  {id:"sentinel",label:"Sentinel",icon:"🔍",color:"#fd79a8",x:0,y:0,state:"idle",time:null},
  {id:"advocate",label:"Advocate",icon:"📄",color:"#00b894",x:0,y:0,state:"idle",time:null},
  {id:"vision",label:"Vision",icon:"👁️",color:"#0abde3",x:0,y:0,state:"idle",time:null},
  {id:"arbiter",label:"Arbiter",icon:"⚖️",color:"#6c5ce7",x:0,y:0,state:"idle",time:null},
];
const CONNECTIONS=[[0,1],[0,2],[0,3],[0,4],[0,5],[1,6],[2,6],[3,6],[4,6],[5,6]];
let netParticles=[],animFrame=null;

function layoutAgents(){
  const w=netCanvas.width/dpr,h=netCanvas.height/dpr,cy=h/2;
  AGENTS[0].x=80;AGENTS[0].y=cy; // Scribe
  
  // 5 middle specialist agents spread evenly between Scribe and Arbiter
  const startX = 230;
  const endX = w - 230; 
  const sp = (endX - startX) / 4;
  
  [1,2,3,4,5].forEach((ai,i)=>{
    AGENTS[ai].x = startX + i*sp;
    AGENTS[ai].y = cy + (i%2===0?-55:55); // alternate up/down
  });
  
  AGENTS[6].x=w-80;AGENTS[6].y=cy; // Arbiter
}

// Bezier control point for curved connections
function getCtrlPoint(ax,ay,bx,by){
  const mx=(ax+bx)/2, my=(ay+by)/2;
  const dx=bx-ax, dy=by-ay;
  const offset = Math.abs(dy) < 20 ? 25 : 0;
  return { cx: mx, cy: my - offset };
}

// Get point along quadratic bezier at t
function bezierPoint(ax,ay,cx,cy,bx,by,t){
  const u=1-t;
  return {
    x: u*u*ax + 2*u*t*cx + t*t*bx,
    y: u*u*ay + 2*u*t*cy + t*t*by,
  };
}

function drawNetwork(){
  const w=netCanvas.width/dpr, h=netCanvas.height/dpr;
  const now=Date.now();
  netCtx.clearRect(0,0,w,h);

  // ── 1. Draw Connections (curved lines with animated dashes) ──
  for(const[a,b]of CONNECTIONS){
    const f=AGENTS[a], t=AGENTS[b];
    const active=f.state==="complete"&&(t.state==="running"||t.state==="complete");
    const sending=f.state==="complete"||t.state==="running";
    const cp=getCtrlPoint(f.x,f.y,t.x,t.y);

    // Base connection line
    netCtx.beginPath();
    netCtx.moveTo(f.x,f.y);
    netCtx.quadraticCurveTo(cp.cx,cp.cy,t.x,t.y);
    netCtx.strokeStyle = active
      ? `rgba(0,206,201,0.4)`
      : sending
        ? `rgba(0,206,201,0.15)`
        : `rgba(108,92,231,0.08)`;
    netCtx.lineWidth = active ? 2.5 : 1;
    netCtx.stroke();

    // Animated dashes on active connections
    if(active){
      netCtx.save();
      netCtx.setLineDash([4,8]);
      netCtx.lineDashOffset = -(now * 0.04) % 24;
      netCtx.beginPath();
      netCtx.moveTo(f.x,f.y);
      netCtx.quadraticCurveTo(cp.cx,cp.cy,t.x,t.y);
      netCtx.strokeStyle = `rgba(0,206,201,0.6)`;
      netCtx.lineWidth = 1;
      netCtx.stroke();
      netCtx.setLineDash([]);
      netCtx.restore();
    }
  }

  // ── 2. Draw Data Packets (traveling along connections) ──
  for(let i=netParticles.length-1;i>=0;i--){
    const p=netParticles[i];
    p.t+=p.speed;
    if(p.t>=1){netParticles.splice(i,1);continue;}

    const f=AGENTS[p.from], t=AGENTS[p.to];
    const cp=getCtrlPoint(f.x,f.y,t.x,t.y);
    const pos=bezierPoint(f.x,f.y,cp.cx,cp.cy,t.x,t.y,p.t);
    const alpha=Math.sin(p.t*Math.PI);

    // Trail (multiple fading circles behind the packet)
    for(let tr=1;tr<=4;tr++){
      const trailT=Math.max(0,p.t-tr*0.025);
      const trPos=bezierPoint(f.x,f.y,cp.cx,cp.cy,t.x,t.y,trailT);
      const trAlpha=alpha*(1-tr*0.22)*0.4;
      netCtx.beginPath();
      netCtx.arc(trPos.x,trPos.y,p.size*(1-tr*0.15),0,Math.PI*2);
      netCtx.fillStyle=`rgba(${p.r},${p.g},${p.b},${trAlpha})`;
      netCtx.fill();
    }

    // Main packet (glowing dot)
    netCtx.beginPath();
    netCtx.arc(pos.x,pos.y,p.size,0,Math.PI*2);
    netCtx.fillStyle=`rgba(${p.r},${p.g},${p.b},${alpha*0.95})`;
    netCtx.fill();

    // Outer glow
    const glow=netCtx.createRadialGradient(pos.x,pos.y,0,pos.x,pos.y,p.size*4);
    glow.addColorStop(0,`rgba(${p.r},${p.g},${p.b},${alpha*0.25})`);
    glow.addColorStop(1,`rgba(${p.r},${p.g},${p.b},0)`);
    netCtx.beginPath();
    netCtx.arc(pos.x,pos.y,p.size*4,0,Math.PI*2);
    netCtx.fillStyle=glow;
    netCtx.fill();

    // Inner bright core
    netCtx.beginPath();
    netCtx.arc(pos.x,pos.y,p.size*0.4,0,Math.PI*2);
    netCtx.fillStyle=`rgba(255,255,255,${alpha*0.7})`;
    netCtx.fill();
  }

  // ── 3. Draw Agent Nodes ──
  for(const ag of AGENTS){
    const isArb=ag.id==="arbiter", r=isArb?34:28;

    // Running: animated expanding rings
    if(ag.state==="running"){
      for(let ring=0;ring<3;ring++){
        const phase=(now*0.002+ring*2.1)%Math.PI;
        const ringR=r+8+Math.sin(phase)*15;
        const ringAlpha=0.15*(1-Math.sin(phase)*0.5);
        netCtx.beginPath();
        netCtx.arc(ag.x,ag.y,ringR,0,Math.PI*2);
        netCtx.strokeStyle=`rgba(0,206,201,${ringAlpha})`;
        netCtx.lineWidth=1.5;
        netCtx.stroke();
      }
      // Spinning arc
      const spinAngle=now*0.003;
      netCtx.beginPath();
      netCtx.arc(ag.x,ag.y,r+6,spinAngle,spinAngle+Math.PI*0.7);
      netCtx.strokeStyle=`rgba(0,206,201,0.5)`;
      netCtx.lineWidth=2.5;
      netCtx.lineCap="round";
      netCtx.stroke();
      netCtx.lineCap="butt";
    }

    // Complete: stable soft glow
    if(ag.state==="complete"){
      const gr=netCtx.createRadialGradient(ag.x,ag.y,r*0.6,ag.x,ag.y,r+14);
      gr.addColorStop(0,`rgba(0,184,148,0.18)`);
      gr.addColorStop(1,`rgba(0,184,148,0)`);
      netCtx.beginPath();
      netCtx.arc(ag.x,ag.y,r+14,0,Math.PI*2);
      netCtx.fillStyle=gr;
      netCtx.fill();
    }

    // Node background circle with colored inner disc
    const hexToRgba=(hex,a)=>{const rr=parseInt(hex.slice(1,3),16),gg=parseInt(hex.slice(3,5),16),bb=parseInt(hex.slice(5,7),16);return`rgba(${rr},${gg},${bb},${a})`;};

    // Outer filled circle — agent-colored background
    const innerGrad = netCtx.createRadialGradient(ag.x,ag.y-r*0.15,0,ag.x,ag.y,r);
    if(ag.state==="running"){
      innerGrad.addColorStop(0,"rgba(0,206,201,0.25)");
      innerGrad.addColorStop(1,"rgba(0,206,201,0.08)");
    } else if(ag.state==="complete"){
      innerGrad.addColorStop(0,hexToRgba(ag.color,0.2));
      innerGrad.addColorStop(1,hexToRgba(ag.color,0.06));
    } else if(ag.state==="error"){
      innerGrad.addColorStop(0,"rgba(255,107,107,0.2)");
      innerGrad.addColorStop(1,"rgba(255,107,107,0.06)");
    } else {
      innerGrad.addColorStop(0,hexToRgba(ag.color,0.12));
      innerGrad.addColorStop(1,hexToRgba(ag.color,0.03));
    }
    netCtx.beginPath();
    netCtx.arc(ag.x,ag.y,r,0,Math.PI*2);
    netCtx.fillStyle=innerGrad;
    netCtx.fill();

    // Node border ring
    const borderColor = ag.state==="running"  ? ag.color
                      : ag.state==="complete" ? "#00b894"
                      : ag.state==="error"    ? "#ff6b6b"
                      : hexToRgba(ag.color,0.35);
    netCtx.beginPath();
    netCtx.arc(ag.x,ag.y,r,0,Math.PI*2);
    netCtx.strokeStyle=borderColor;
    netCtx.lineWidth=ag.state==="idle"?1.5:2.5;
    netCtx.stroke();

    // Inner accent ring (gives depth)
    netCtx.beginPath();
    netCtx.arc(ag.x,ag.y,r-4,0,Math.PI*2);
    netCtx.strokeStyle=hexToRgba(ag.color,ag.state==="idle"?0.08:0.15);
    netCtx.lineWidth=0.5;
    netCtx.stroke();

    // Large emoji icon — this is the agent's "face"
    netCtx.font=`${isArb?30:24}px serif`;
    netCtx.textAlign="center";
    netCtx.textBaseline="middle";
    netCtx.fillText(ag.icon,ag.x,ag.y-3);

    // Short abbreviation inside node (below icon)
    const abbrevs={scribe:"SCR",guardian:"GRD",compliance:"CMP",sentinel:"SNT",advocate:"ADV",vision:"VIS",arbiter:"ARB"};
    netCtx.font=`800 ${isArb?8:7}px 'Inter',sans-serif`;
    netCtx.fillStyle=hexToRgba(ag.color,ag.state==="idle"?0.5:0.85);
    netCtx.letterSpacing="1px";
    netCtx.fillText(abbrevs[ag.id]||"",ag.x,ag.y+r*0.55);

    // Checkmark badge for completed agents
    if(ag.state==="complete"){
      netCtx.beginPath();
      netCtx.arc(ag.x+r*0.65,ag.y-r*0.65,9,0,Math.PI*2);
      netCtx.fillStyle="#00b894";
      netCtx.fill();
      netCtx.beginPath();
      netCtx.arc(ag.x+r*0.65,ag.y-r*0.65,9,0,Math.PI*2);
      netCtx.strokeStyle="rgba(0,0,0,0.15)";
      netCtx.lineWidth=0.5;
      netCtx.stroke();
      // Checkmark
      netCtx.strokeStyle="#fff";
      netCtx.lineWidth=2;
      netCtx.lineCap="round";
      netCtx.lineJoin="round";
      netCtx.beginPath();
      netCtx.moveTo(ag.x+r*0.65-3.5,ag.y-r*0.65+0.5);
      netCtx.lineTo(ag.x+r*0.65-0.5,ag.y-r*0.65+3.5);
      netCtx.lineTo(ag.x+r*0.65+4,ag.y-r*0.65-2.5);
      netCtx.stroke();
      netCtx.lineCap="butt";
      netCtx.lineJoin="miter";
    }

    // Error X badge
    if(ag.state==="error"){
      netCtx.beginPath();
      netCtx.arc(ag.x+r*0.65,ag.y-r*0.65,9,0,Math.PI*2);
      netCtx.fillStyle="#ff6b6b";
      netCtx.fill();
      netCtx.strokeStyle="#fff";
      netCtx.lineWidth=2;
      netCtx.lineCap="round";
      netCtx.beginPath();
      netCtx.moveTo(ag.x+r*0.65-3,ag.y-r*0.65-3);
      netCtx.lineTo(ag.x+r*0.65+3,ag.y-r*0.65+3);
      netCtx.moveTo(ag.x+r*0.65+3,ag.y-r*0.65-3);
      netCtx.lineTo(ag.x+r*0.65-3,ag.y-r*0.65+3);
      netCtx.stroke();
      netCtx.lineCap="butt";
    }

    // Label below node
    netCtx.font="700 11px 'Inter',sans-serif";
    netCtx.fillStyle=ag.state==="complete"?"#00b894":ag.state==="running"?ag.color:ag.state==="error"?"#ff6b6b":"#9d9db8";
    netCtx.fillText(ag.label,ag.x,ag.y+r+16);

    // Status text
    netCtx.font="500 9px 'JetBrains Mono',monospace";
    let st="Idle",stColor="#55556e";
    if(ag.state==="running"){st="Processing...";stColor="#00cec9";}
    else if(ag.state==="complete"){st=ag.time?`✓ ${(ag.time/1000).toFixed(1)}s`:"✓ Done";stColor="#00b894";}
    else if(ag.state==="error"){st="✗ Error";stColor="#ff6b6b";}
    else if(ag.state==="skipped"){st="— Skip";stColor="#55556e";}
    netCtx.fillStyle=stColor;
    netCtx.fillText(st,ag.x,ag.y+r+28);
  }

  animFrame=requestAnimationFrame(drawNetwork);
}

function spawnParticles(fromIdx,toIdx){
  const col=AGENTS[fromIdx].color;
  // Parse hex to RGB for particle colors
  const hexToRgb=(hex)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return{r,g,b};};
  const rgb=hexToRgb(col);
  // Spawn staggered packets for professional look
  for(let i=0;i<8;i++){
    netParticles.push({
      from:fromIdx,to:toIdx,
      t:i*0.06,
      speed:0.006+Math.random()*0.004,
      size:2+Math.random()*2,
      r:rgb.r,g:rgb.g,b:rgb.b,
    });
  }
}

function setAgentState(id,state,ms){
  const ag=AGENTS.find(a=>a.id===id);if(!ag)return;
  ag.state=state;if(ms)ag.time=ms;
  if(state==="complete"){
    completedAgents++;
    $("#agentCounter").textContent=`${completedAgents} / 7`;
    const idx=AGENTS.indexOf(ag);
    // Send data packets towards Arbiter
    if(idx<6)spawnParticles(idx,6);
  }
  if(state==="running"){
    const idx=AGENTS.indexOf(ag);
    // Send data packets from Scribe to this agent
    if(idx>0&&idx<6)spawnParticles(0,idx);
  }
}

// ═══════════════════════════════════════════════════════════════
//  PIPELINE EXECUTION
// ═══════════════════════════════════════════════════════════════
async function runPipeline(){
  const rawText=$("#clinicalInput").value.trim();if(!rawText||isRunning)return;
  isRunning=true;completedAgents=0;lastArbiterData=null;lastPipelineResult=null;
  const btn=$("#runAegis");btn.disabled=true;btn.classList.add("running");btn.querySelector(".run-btn-text").textContent="Analyzing...";
  $("#agentNetwork").classList.remove("hidden");$("#resultsDashboard").classList.remove("hidden");
  $("#analyticsDashboard").classList.add("hidden");
  resetAll();setSystemStatus("running","Processing...");startTimer();resizeNet();layoutAgents();
  if(animFrame)cancelAnimationFrame(animFrame);drawNetwork();
  $("#agentNetwork").scrollIntoView({behavior:"smooth",block:"start"});
  try{
    const body={rawText,generatePriorAuth:true,payerType:$("#payerSelect").value};
    if(imageBase64){body.imageBase64=imageBase64;body.imageMimeType=imageMimeType;}
    const response=await fetch("/aegis/stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const reader=response.body.getReader();const decoder=new TextDecoder();let buffer="";
    while(true){const{done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop();
    for(const line of lines){if(!line.startsWith("data: "))continue;const data=line.slice(6).trim();if(data==="[DONE]")continue;try{handleEvent(JSON.parse(data));}catch(e){}}}
  }catch(err){console.error("Pipeline error:",err);setSystemStatus("error","Pipeline Failed");}
  stopTimer();isRunning=false;btn.disabled=false;btn.classList.remove("running");btn.querySelector(".run-btn-text").textContent="Run AEGIS Pipeline";
}
function handleEvent(event){const{agent,status,data}=event;
  if(agent==="pipeline"){if(status==="done"&&data?.result){lastPipelineResult=data.result;renderFinalResults(data.result);renderDashboardCharts(data.result);if(data.result.clinicalScores)renderClinicalScores(data.result.clinicalScores);saveRunToServer(data.result);showFailedAgents(data.result);renderAgentTimingBars(data.result);setSystemStatus("complete","Analysis Complete");initWhatIfSandbox(data.result);}else if(status==="error"){setSystemStatus("error","Error: "+(data?.error||"Unknown"));}return;}
  if(agent==="scores"&&status==="complete"&&data?.output){renderClinicalScores(data.output);return;}
  setAgentState(agent,status,data?.durationMs);
  if(status==="complete"&&data?.output)renderAgentPanel(agent,data.output);
  else if(status==="skipped")renderSkippedPanel(agent);
}

// ── Clinical Scores Renderer ─────────────────────────────────
function renderClinicalScores(scores) {
  if (!scores || scores.length === 0) return;
  $("#clinicalScoresSection").classList.remove("hidden");
  $("#scoresCount").textContent = `${scores.length} scores`;
  let h = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0.7rem">';
  for (const s of scores) {
    const pct = Math.round((s.score / s.maxScore) * 100);
    const riskColor = s.risk === "HIGH" ? "var(--accent-red)" : s.risk === "MODERATE" ? "var(--accent-amber)" : "var(--accent-green)";
    h += `<div style="background:rgba(0,0,0,0.15);border:1px solid var(--border-subtle);border-radius:12px;padding:0.7rem;transition:all 0.3s" onmouseover="this.style.borderColor='var(--border-medium)'" onmouseout="this.style.borderColor='var(--border-subtle)'">`;
    // Header
    h += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">`;
    h += `<div style="font-weight:700;font-size:0.82rem">${s.name}</div>`;
    h += `<span style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:1.1rem;color:${riskColor}">${s.score}/${s.maxScore}</span>`;
    h += `</div>`;
    // Progress bar
    h += `<div style="height:6px;background:rgba(0,0,0,0.3);border-radius:3px;overflow:hidden;margin-bottom:0.4rem"><div style="width:${pct}%;height:100%;background:${riskColor};border-radius:3px;transition:width 0.5s"></div></div>`;
    // Risk badge
    h += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">`;
    h += `<span class="panel-badge ${s.risk.toLowerCase()}">${s.risk} RISK</span>`;
    h += `</div>`;
    // Breakdown
    h += `<div style="font-size:0.64rem;color:var(--text-muted)">`;
    for (const b of (s.breakdown || [])) {
      const bColor = b.value >= 2 ? "var(--accent-red)" : b.value >= 1 ? "var(--accent-amber)" : "var(--text-muted)";
      h += `<div style="display:flex;justify-content:space-between;padding:1px 0"><span>${b.param}</span><span style="color:${bColor};font-weight:600">+${b.value} <span style="color:var(--text-muted);font-weight:400">${b.note}</span></span></div>`;
    }
    h += `</div>`;
    // Recommendation
    h += `<div style="margin-top:0.4rem;font-size:0.68rem;color:var(--text-secondary);padding:0.35rem 0.5rem;background:rgba(0,0,0,0.1);border-radius:6px;border-left:3px solid ${riskColor}">${s.recommendation}</div>`;
    h += `</div>`;
  }
  h += '</div>';
  // Add score reconciliation context when scores show conflicting risk levels
  const riskLevels = scores.map(s => s.risk);
  const hasConflict = new Set(riskLevels).size > 1;
  if (hasConflict) {
    h += `<div style="margin-top:0.5rem;font-size:0.64rem;color:var(--text-muted);padding:6px 10px;background:rgba(99,110,204,0.06);border:1px solid var(--border-subtle);border-radius:8px;line-height:1.5">
      <strong>ℹ️ Score Context:</strong> Different clinical scores measure different risks.
      ${scores.map(s => `<strong>${s.name}</strong> measures ${s.name.includes('HEART')?'30-day cardiac event risk':s.name.includes('NEWS')?'acute physiological deterioration':s.name.includes('qSOFA')?'sepsis-related organ dysfunction':s.name.includes('CHA')?'annual stroke risk':'clinical risk'}`).join('. ')}.
      Conflicting risk levels are expected when the patient has domain-specific conditions (e.g., high cardiac risk but stable vital signs).
    </div>`;
  }
  h += '<div style="margin-top:0.5rem;font-size:0.58rem;color:var(--text-muted);opacity:0.6;padding:4px 8px;border-top:1px solid var(--border-subtle)">⚕ Clinical scores use published standardized thresholds (e.g. NEWS2 flags BP ≤90 or ≥220, not intermediate hypertension). Low scores do not exclude clinical concern — always correlate with full picture.</div>';
  $("#clinicalScoresBody").innerHTML = h;
}

// ═══════════════════════════════════════════════════════════════
//  PANEL RENDERING
// ═══════════════════════════════════════════════════════════════
function renderAgentPanel(agent,output){const body=$(`#body-${agent}`),badge=$(`#badge-${agent}`);if(!body)return;const r={scribe:renderScribe,guardian:renderGuardian,compliance:renderCompliance,sentinel:renderSentinel,advocate:renderAdvocate,vision:renderVision,arbiter:renderArbiter};if(r[agent])r[agent](body,badge,output);}

function renderScribe(body,badge,d){badge.textContent=`${d.diagnoses?.length||0} dx`;badge.className="panel-badge pass";let h="";if(d.patient)h+=`<div class="entity-group"><div class="entity-group-title">Patient</div><span class="entity-tag">👤 ${d.patient.name||"?"},${d.patient.age||"?"}${d.patient.sex||""}</span></div>`;if(d.diagnoses?.length){h+=`<div class="entity-group"><div class="entity-group-title">Diagnoses</div>`;d.diagnoses.forEach(x=>{h+=`<span class="entity-tag">🏷️ ${x.name}${x.icd10?` (${x.icd10})`:""}</span>`;});h+="</div>";}if(d.medications?.length){h+=`<div class="entity-group"><div class="entity-group-title">Medications</div>`;d.medications.forEach(x=>{h+=`<span class="entity-tag">💊 ${x.name} ${x.dose||""}</span>`;});h+="</div>";}if(d.allergies?.length){h+=`<div class="entity-group"><div class="entity-group-title">Allergies</div>`;d.allergies.forEach(x=>{h+=`<span class="entity-tag" style="border-color:var(--accent-red)">⚠️ ${x}</span>`;});h+="</div>";}if(d.vitals){h+=`<div class="entity-group"><div class="entity-group-title">Vitals</div>`;const v=d.vitals;if(v.bp)h+=`<span class="entity-tag">BP:${v.bp}</span>`;if(v.hr)h+=`<span class="entity-tag">HR:${v.hr}</span>`;if(v.spo2)h+=`<span class="entity-tag">SpO2:${v.spo2}</span>`;if(v.temp)h+=`<span class="entity-tag">T:${v.temp}</span>`;h+="</div>";}body.innerHTML=h||'<div class="panel-placeholder">No entities</div>';}

function renderGuardian(body,badge,d){badge.textContent=d.riskLevel;badge.className=`panel-badge ${d.riskLevel.toLowerCase()}`;if(!d.findings?.length){body.innerHTML='<div style="text-align:center;padding:1.5rem;color:var(--accent-green)">✅ No safety issues</div>';return;}body.innerHTML=d.findings.map(f=>`<div class="finding-item ${f.severity.toLowerCase()}"><div class="finding-type">${f.type} — ${f.severity}</div><div>${f.message}</div></div>`).join("");}

function renderCompliance(body,badge,d){badge.textContent=d.overallStatus;badge.className=`panel-badge ${d.overallStatus==="PASS"?"pass":d.overallStatus==="FAIL"?"fail":"moderate"}`;let h="";if(d.codeValidation?.length){h+=`<div class="entity-group"><div class="entity-group-title">ICD-10 Codes</div>`;d.codeValidation.forEach(c=>{h+=`<span class="entity-tag">${c.valid?"✅":"❌"} ${c.code} — ${c.description||"?"}</span>`;});h+="</div>";}if(d.billingFindings?.length)d.billingFindings.forEach(f=>{h+=`<div class="finding-item ${f.severity==="ERROR"?"high":"moderate"}"><div class="finding-type">${f.rule} — ${f.severity}</div><div>${f.message}</div></div>`;});body.innerHTML=h||'<div style="text-align:center;padding:1.5rem;color:var(--accent-green)">✅ Compliant</div>';}

function renderSentinel(body,badge,d){badge.textContent=d.riskLevel;badge.className=`panel-badge ${d.riskLevel?.toLowerCase()||"low"}`;let h="";if(d.findings?.length)d.findings.forEach(f=>{h+=`<div class="finding-item ${f.severity.toLowerCase()}"><div class="finding-type">${f.type} — ${f.severity}</div><div>${f.message}</div></div>`;});if(d.aiReasoning?.overallAssessment)h+=`<div class="consensus-section"><div class="consensus-title">🧠 AI Assessment</div><div class="consensus-text">${d.aiReasoning.overallAssessment}</div></div>`;if(d.deteriorationRisk){const dr=d.deteriorationRisk;h+=`<div class="finding-item ${dr.level==="HIGH"?"high":dr.level==="MODERATE"?"moderate":"low"}"><div class="finding-type">Deterioration Risk — ${dr.level}</div><div>${dr.reasoning}</div></div>`;}body.innerHTML=h||'<div style="text-align:center;padding:1.5rem;color:var(--accent-green)">✅ No gaps</div>';}

function renderAdvocate(body,badge,d){badge.textContent=d.urgency||"DONE";badge.className=`panel-badge ${d.urgency==="EMERGENT"?"critical":d.urgency==="URGENT"?"high":"pass"}`;let h=`<div class="consensus-section"><div class="consensus-title">📄 Prior Auth — ${d.category}</div><div class="consensus-text">${d.summary}</div></div>`;const doc=d.document;if(doc?.medicalNecessityJustification){const mn=doc.medicalNecessityJustification;if(mn.clinicalSummary)h+=`<div class="consensus-section"><div class="consensus-title">Clinical Summary</div><div class="consensus-text">${mn.clinicalSummary}</div></div>`;if(mn.justification)h+=`<div class="consensus-section"><div class="consensus-title">Medical Necessity</div><div class="consensus-text">${mn.justification}</div></div>`;}body.innerHTML=h;}

function renderVision(body,badge,d){badge.textContent=d.status;badge.className=`panel-badge ${d.status==="ANALYZED"?"pass":"moderate"}`;if(!d.analysis){body.innerHTML='<div class="panel-placeholder">No image provided</div>';return;}let h="";if(d.analysis?.findings?.length)d.analysis.findings.forEach(f=>{h+=`<div class="finding-item ${f.severity?.toLowerCase()||"low"}"><div class="finding-type">${f.location||"General"} — ${f.severity}</div><div>${f.description}</div></div>`;});if(d.analysis?.impression)h+=`<div class="consensus-section"><div class="consensus-title">Impression</div><div class="consensus-text">${d.analysis.impression}</div></div>`;body.innerHTML=h||'<div class="panel-placeholder">No findings</div>';}

function renderArbiter(body,badge,d){
  lastArbiterData=d;
  badge.textContent=`${d.totalIssues} issues`;badge.className=`panel-badge ${d.overallRisk?.toLowerCase()||"low"}`;
  let h="";
  if(d.consensus?.executiveSummary)h+=`<div class="consensus-section"><div class="consensus-title">📊 Executive Summary</div><div class="consensus-text">${d.consensus.executiveSummary}</div></div>`;
  // Voting
  if(d.voting){h+=`<div class="consensus-section"><div class="consensus-title">🗳️ Weighted Majority Vote</div><div style="display:flex;gap:1.5rem;margin:0.5rem 0;flex-wrap:wrap">`;h+=`<div class="entity-group"><div class="entity-group-title">Risk Score</div><span class="entity-tag" style="font-size:1rem;font-weight:800;border-color:var(--accent-primary)">${d.voting.weightedRiskScore}/4.0</span></div>`;h+=`<div class="entity-group"><div class="entity-group-title">Confidence</div><span class="entity-tag" style="font-size:1rem;font-weight:800;border-color:${d.voting.confidence>=75?'var(--accent-green)':d.voting.confidence>=50?'var(--accent-amber)':'var(--accent-red)'}">${d.voting.confidence}%</span></div>`;h+=`<div class="entity-group"><div class="entity-group-title">Votes</div><span class="entity-tag" style="font-size:1rem;font-weight:800">${d.voting.voteCount}</span></div></div>`;
  if(d.voting.votes?.length){h+=`<div style="margin-top:0.3rem">`;d.voting.votes.forEach(v=>{const pct=Math.round(v.riskScore/4*100),cl=v.riskScore>=3?'var(--accent-red)':v.riskScore>=2?'var(--accent-amber)':'var(--accent-green)';h+=`<div style="display:flex;align-items:center;gap:0.5rem;margin:2px 0;font-size:0.68rem"><span style="width:110px;color:var(--text-muted)">${v.agent}</span><div style="flex:1;height:6px;background:rgba(0,0,0,0.3);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${cl};border-radius:3px"></div></div><span style="width:40px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--text-secondary)">${v.riskScore}/4</span></div>`;});h+="</div>";}h+="</div>";}
  // Evidence
  if(d.scoredIssues?.length){h+=`<div class="consensus-section"><div class="consensus-title">🔬 Dempster-Shafer Evidence</div>`;d.scoredIssues.slice(0,6).forEach(is=>{const bp=Math.round(is.beliefMass*100),sc=is.severity?.toLowerCase()||"low";h+=`<div class="finding-item ${sc}"><div style="display:flex;justify-content:space-between"><div class="finding-type">${is.type} — ${is.severity}</div><span style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:0.7rem;color:${bp>=70?'var(--accent-green)':bp>=40?'var(--accent-amber)':'var(--text-muted)'}">${bp}%</span></div><div>${is.description}</div>${is.sources?.length>1?`<div style="margin-top:3px;font-size:0.6rem;color:var(--text-muted)">Sources: ${is.sources.join(" + ")}</div>`:""}</div>`;});h+="</div>";}
  if(d.consensus?.criticalAlerts?.length){h+=`<div class="consensus-section"><div class="consensus-title">🚨 Critical Alerts</div>`;d.consensus.criticalAlerts.forEach(a=>{h+=`<div class="finding-item critical"><div>${a}</div></div>`;});h+="</div>";}
  if(d.conflicts?.length){h+=`<div class="consensus-section"><div class="consensus-title">⚡ Conflicts Resolved (${d.conflictCount})</div>`;d.conflicts.forEach(c=>{h+=`<div class="finding-item moderate"><div class="finding-type">${c.type}</div><div>${c.description}</div><div style="margin-top:4px;font-size:0.68rem;color:var(--accent-green)">↳ ${c.resolution}</div></div>`;});h+="</div>";}
  if(d.consensus?.clinicalRecommendations?.length){h+=`<div class="consensus-section"><div class="consensus-title">📋 Recommendations</div>`;d.consensus.clinicalRecommendations.forEach(r=>{h+=`<div class="recommendation-item"><div class="rec-priority">${r.priority}</div><div class="rec-content"><div class="rec-action">${r.action}</div><div class="rec-rationale">${r.rationale}</div>${r.timeframe?`<span class="rec-timeframe ${r.timeframe.toLowerCase()}">${r.timeframe.replace(/_/g," ")}</span>`:""}</div></div>`;});h+="</div>";}
  if(d.consensus?.qualityMetrics){const qm=d.consensus.qualityMetrics;h+=`<div class="consensus-section"><div class="consensus-title">📈 Quality Metrics</div><div style="display:flex;gap:0.5rem;flex-wrap:wrap">`;[{l:'Documentation',v:qm.documentationCompleteness},{l:'Coding',v:qm.codingAccuracy},{l:'Safety',v:qm.safetyVerification}].forEach(m=>{const c=m.v?.includes('VERIFIED')||m.v?.includes('COMPLETE')||m.v?.includes('ACCURATE')?'var(--accent-green)':m.v?.includes('UNSAFE')||m.v?.includes('INACCURATE')?'var(--accent-red)':'var(--accent-amber)';h+=`<span class="entity-tag" style="border-color:${c}">${m.l}: ${m.v||'N/A'}</span>`;});h+="</div></div>";}
  body.innerHTML=h||'<div class="panel-placeholder">No data</div>';
}

function renderSkippedPanel(agent){const body=$(`#body-${agent}`),badge=$(`#badge-${agent}`);if(!body)return;badge.textContent="SKIP";badge.className="panel-badge";
const skipMessages={vision:'📷 No medical image attached. Use the "Attach Image" button above to upload radiology images (X-ray, CT, MRI) for AI-powered imaging analysis and clinical correlation.',advocate:'Prior authorization generation was not requested for this analysis.',default:'This agent was not required for the current analysis.'};
body.innerHTML=`<div class="panel-placeholder" style="text-align:center;padding:2rem 1.5rem;opacity:0.7"><div style="font-size:1.5rem;margin-bottom:8px">${agent==='vision'?'🔬':'⏭️'}</div><div>${skipMessages[agent]||skipMessages.default}</div></div>`;}

function renderFinalResults(result){const s=result.summary||{};const risk=(s.overallRisk||"LOW").toLowerCase();$("#riskBanner").className=`risk-banner risk-${risk}`;$("#riskTitle").textContent=`${s.overallRisk||"LOW"} RISK`;const fullSummary=s.executiveSummary||"Analysis complete";
if(fullSummary.length>200){$("#riskSubtitle").innerHTML=`${fullSummary.slice(0,180)}... <a href="#" style="color:inherit;opacity:0.7;font-size:0.7em" onclick="this.parentElement.textContent='${fullSummary.replace(/'/g,"\\'").replace(/"/g,'&quot;')}';return false">show more</a>`;}else{$("#riskSubtitle").textContent=fullSummary;}$("#statTotal").textContent=s.totalIssues||0;$("#statCritical").textContent=s.criticalIssues||0;$("#statAgents").textContent="7";$("#statTime").textContent=`${((s.pipelineDurationMs||0)/1000).toFixed(1)}s`;if(result.agents?.arbiter?.output)renderAgentPanel("arbiter",result.agents.arbiter.output);}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD CHARTS — Canvas-based (no external libs)
// ═══════════════════════════════════════════════════════════════
function renderDashboardCharts(result) {
  $("#analyticsDashboard").classList.remove("hidden");
  const arb = result.agents?.arbiter?.output || {};
  const timings = result.timings || {};
  const s = result.summary || {};

  $("#dashLlm").textContent = `LLM: ${arb.voting ? "Active" : "—"}`;
  $("#dashTime").textContent = `Time: ${((s.pipelineDurationMs||0)/1000).toFixed(1)}s`;

  drawRiskGauge(arb.voting?.weightedRiskScore || 0, arb.overallRisk || "LOW");
  drawSeverityPie(arb.scoredIssues || []);
  drawAgentPerf(timings);
  drawRiskRadar(arb, result);
  drawPipelineFlow(timings);
  drawQuickStats(s, arb);

  // Save run to server
  saveRunHistory(result);

  // Scroll to dashboard
  $("#analyticsDashboard").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── HiDPI Canvas Helper ─────────────────────────────────────
function hdCanvas(canvasEl) {
  const dp = window.devicePixelRatio || 1;
  const rect = canvasEl.parentElement.getBoundingClientRect();
  const w = canvasEl.getAttribute("width") | 0 || rect.width;
  const h = canvasEl.getAttribute("height") | 0 || rect.height;
  canvasEl.width = w * dp;
  canvasEl.height = h * dp;
  canvasEl.style.width = w + "px";
  canvasEl.style.height = h + "px";
  const ctx = canvasEl.getContext("2d");
  ctx.scale(dp, dp);
  return { ctx, w, h };
}

// ── Save Run History ─────────────────────────────────────────
async function saveRunHistory(result) {
  try {
    await fetch("/aegis/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  } catch (e) { /* silent */ }
}

// 1. Risk Gauge
function drawRiskGauge(score, label) {
  const { ctx, w, h } = hdCanvas(document.getElementById("riskGaugeCanvas"));
  const cx = w/2, cy = h - 15, r = 75;
  ctx.clearRect(0,0,w,h);
  // Background arc
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.lineWidth = 14;
  ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineCap = "round"; ctx.stroke();
  // Value arc
  const pct = Math.min(score / 4, 1);
  const colors = ["#00b894","#fdcb6e","#e17055","#ff6b6b"];
  const ci = Math.min(Math.floor(pct * 4), 3);
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * pct); ctx.lineWidth = 14;
  ctx.strokeStyle = colors[ci]; ctx.lineCap = "round"; ctx.stroke();
  // Score text
  ctx.fillStyle = colors[ci]; ctx.font = "bold 26px 'JetBrains Mono',monospace";
  ctx.textAlign = "center"; ctx.fillText(score.toFixed(2), cx, cy - 18);
  ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "11px 'Inter',sans-serif";
  ctx.fillText("/ 4.00", cx, cy - 2);
  $("#gaugeRiskLabel").textContent = label;
  $("#gaugeRiskLabel").style.color = colors[ci];
}

// 2. Severity Pie
function drawSeverityPie(issues) {
  const { ctx, w, h } = hdCanvas(document.getElementById("severityPieCanvas"));
  const cx = w/2, cy = h/2 - 5, r = 65;
  ctx.clearRect(0,0,w,h);
  const counts = { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 };
  issues.forEach(is => { counts[is.severity] = (counts[is.severity]||0) + 1; });
  const colors = { CRITICAL: "#ff6b6b", HIGH: "#e17055", MODERATE: "#fdcb6e", LOW: "#00b894" };
  const total = Object.values(counts).reduce((s,v) => s+v, 0) || 1;
  let startAngle = -Math.PI / 2;
  const legend = $("#pieLegend"); legend.innerHTML = "";
  for (const [sev, count] of Object.entries(counts)) {
    if (count === 0) continue;
    const sliceAngle = (count / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
    ctx.closePath(); ctx.fillStyle = colors[sev]; ctx.fill();
    // Gap
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
    ctx.closePath(); ctx.strokeStyle = "rgba(7,7,13,0.8)"; ctx.lineWidth = 2; ctx.stroke();
    startAngle += sliceAngle;
    legend.innerHTML += `<div class="pie-legend-item"><div class="pie-legend-dot" style="background:${colors[sev]}"></div>${sev}: ${count}</div>`;
  }
  // Center hole
  ctx.beginPath(); ctx.arc(cx, cy, 35, 0, Math.PI*2);
  ctx.fillStyle = "rgba(7,7,13,0.9)"; ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "bold 18px 'JetBrains Mono',monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(total, cx, cy - 4);
  ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "9px 'Inter',sans-serif"; ctx.fillText("issues", cx, cy + 12);
}

// 3. Agent Performance Bars
function drawAgentPerf(timings) {
  const { ctx, w, h } = hdCanvas(document.getElementById("agentPerfCanvas"));
  ctx.clearRect(0,0,w,h);
  const agents = ["scribe","guardian","compliance","sentinel","advocate","arbiter"];
  const colors = ["#a29bfe","#00cec9","#fdcb6e","#fd79a8","#00b894","#6c5ce7"];
  const maxTime = Math.max(...agents.map(a => timings[a] || 0), 1);
  const barH = 16, gap = 6, startY = 10, labelW = 70;
  agents.forEach((a, i) => {
    const y = startY + i * (barH + gap);
    const t = timings[a] || 0;
    const barW = (t / maxTime) * (w - labelW - 60);
    // Label
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "500 10px 'Inter',sans-serif";
    ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(a, labelW - 8, y + barH/2);
    // Bar bg
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(labelW, y, w - labelW - 55, barH);
    // Bar
    ctx.fillStyle = colors[i]; ctx.globalAlpha = 0.8;
    ctx.fillRect(labelW, y, barW, barH);
    ctx.globalAlpha = 1;
    // Time label
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "600 9px 'JetBrains Mono',monospace";
    ctx.textAlign = "left"; ctx.fillText(`${(t/1000).toFixed(1)}s`, labelW + barW + 6, y + barH/2);
  });
}

// 4. Risk Radar
function drawRiskRadar(arb, result) {
  const { ctx, w, h } = hdCanvas(document.getElementById("riskRadarCanvas"));
  const cx = w/2, cy = h/2 + 5, r = 70;
  ctx.clearRect(0,0,w,h);
  const dims = [
    { label: "Safety", val: result.agents?.guardian?.output?.riskLevel },
    { label: "Clinical", val: result.agents?.sentinel?.output?.riskLevel },
    { label: "Compliance", val: result.agents?.compliance?.output?.overallStatus === "FAIL" ? "HIGH" : "LOW" },
    { label: "Diagnostic", val: arb.overallRisk },
    { label: "Documentation", val: arb.consensus?.qualityMetrics?.documentationCompleteness === "INCOMPLETE" ? "HIGH" : "LOW" },
  ];
  const riskToVal = v => v === "CRITICAL" ? 1 : v === "HIGH" ? 0.75 : v === "MODERATE" ? 0.5 : 0.25;
  const n = dims.length;
  // Grid
  [0.25, 0.5, 0.75, 1].forEach(lev => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const angle = (i % n) * (Math.PI * 2 / n) - Math.PI / 2;
      const x = cx + Math.cos(angle) * r * lev, y = cy + Math.sin(angle) * r * lev;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1; ctx.stroke();
  });
  // Axes
  for (let i = 0; i < n; i++) {
    const angle = i * (Math.PI * 2 / n) - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.stroke();
    // Labels
    const lx = cx + Math.cos(angle) * (r + 16), ly = cy + Math.sin(angle) * (r + 16);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "500 9px 'Inter',sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(dims[i].label, lx, ly);
  }
  // Data shape
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const angle = (i % n) * (Math.PI * 2 / n) - Math.PI / 2;
    const val = riskToVal(dims[i % n].val);
    const x = cx + Math.cos(angle) * r * val, y = cy + Math.sin(angle) * r * val;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fillStyle = "rgba(255,107,107,0.12)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,107,107,0.6)"; ctx.lineWidth = 2; ctx.stroke();
  // Points
  for (let i = 0; i < n; i++) {
    const angle = i * (Math.PI * 2 / n) - Math.PI / 2;
    const val = riskToVal(dims[i].val);
    ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * r * val, cy + Math.sin(angle) * r * val, 3, 0, Math.PI*2);
    ctx.fillStyle = "#ff6b6b"; ctx.fill();
  }
}

// 5. Pipeline Flow
function drawPipelineFlow(timings) {
  const { ctx, w, h } = hdCanvas(document.getElementById("pipelineFlowCanvas"));
  ctx.clearRect(0,0,w,h);
  const steps = [
    { label: "Scribe", t: timings.scribe || 0, color: "#a29bfe" },
    { label: "Guardian", t: timings.guardian || 0, color: "#00cec9" },
    { label: "Compliance", t: timings.compliance || 0, color: "#fdcb6e" },
    { label: "Sentinel", t: timings.sentinel || 0, color: "#fd79a8" },
    { label: "Advocate", t: timings.advocate || 0, color: "#00b894" },
    { label: "Arbiter", t: timings.arbiter || 0, color: "#6c5ce7" },
  ];
  const total = steps.reduce((s,st) => s + st.t, 0) || 1;
  let x = 30;
  const barY = 45, barH = 24;
  const availW = w - 60;
  steps.forEach((st, i) => {
    const sw = Math.max((st.t / total) * availW, 20);
    ctx.fillStyle = st.color; ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.roundRect(x, barY, sw - 2, barH, 4);
    ctx.fill(); ctx.globalAlpha = 1;
    // Label
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "600 8px 'Inter',sans-serif";
    ctx.textAlign = "center"; ctx.fillText(st.label, x + sw/2, barY - 6);
    // Time
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "500 7px 'JetBrains Mono',monospace";
    ctx.fillText(`${(st.t/1000).toFixed(1)}s`, x + sw/2, barY + barH + 12);
    // Arrow
    if (i < steps.length - 1) {
      ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.font = "10px serif";
      ctx.fillText("→", x + sw + 2, barY + barH/2 + 1);
    }
    x += sw;
  });
  // Title
  ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "500 9px 'Inter',sans-serif";
  ctx.textAlign = "left"; ctx.fillText("Sequential Pipeline Execution", 30, 18);
}

// 6. Quick Stats
function drawQuickStats(summary, arb) {
  const grid = $("#quickStatsGrid");
  const stats = [
    { val: summary.totalIssues || 0, label: "Total Issues", color: "var(--accent-amber)" },
    { val: summary.criticalIssues || 0, label: "Critical", color: "var(--accent-red)" },
    { val: `${arb.voting?.confidence || 0}%`, label: "Confidence", color: "var(--accent-green)" },
    { val: arb.conflictCount || 0, label: "Conflicts", color: "var(--accent-pink)" },
  ];
  grid.innerHTML = stats.map(s => `<div class="quick-stat"><div class="quick-stat-val" style="color:${s.color}">${s.val}</div><div class="quick-stat-label">${s.label}</div></div>`).join("");
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function resetAll(){AGENTS.forEach(a=>{a.state="idle";a.time=null;});netParticles=[];completedAgents=0;$("#agentCounter").textContent="0 / 7";["scribe","guardian","compliance","sentinel","advocate","vision","arbiter"].forEach(a=>{const b=$(`#body-${a}`),bg=$(`#badge-${a}`);if(b)b.innerHTML='<div class="panel-placeholder">Waiting...</div>';if(bg){bg.textContent="—";bg.className="panel-badge";}});$("#riskBanner").className="risk-banner risk-low";$("#riskTitle").textContent="ANALYZING...";$("#riskSubtitle").textContent="Pipeline running";}
function setSystemStatus(state,text){const dot=$("#systemStatus").querySelector(".status-dot");dot.className=`status-dot ${state}`;$("#systemStatus").querySelector("span:last-child").textContent=text;}
function startTimer(){startTime=Date.now();timerInterval=setInterval(()=>{$("#pipelineTimer").textContent=`${((Date.now()-startTime)/1000).toFixed(1)}s`;},100);}
function stopTimer(){if(timerInterval)clearInterval(timerInterval);}
window.addEventListener("load",()=>{resizeNet();layoutAgents();});
window.addEventListener("resize",()=>{resizeNet();layoutAgents();});

// ═══════════════════════════════════════════════════════════════
//  PDF EXPORT — Browser Print-to-PDF
// ═══════════════════════════════════════════════════════════════
function exportPDF() {
  if (!lastPipelineResult) return alert("Run a pipeline first.");
  const r = lastPipelineResult;
  const arb = r.agents?.arbiter?.output || {};
  const s = r.summary || {};
  const scores = r.clinicalScores || [];
  const ts = new Date().toISOString();
  const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AEGIS Report — ${ts.split("T")[0]}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#1e293b;padding:40px;max-width:850px;margin:0 auto;font-size:13px;line-height:1.6;background:#fff}
  h1{font-size:22px;font-weight:800;letter-spacing:2px;color:#6c5ce7;border-bottom:3px solid #6c5ce7;padding-bottom:8px;margin-bottom:12px}
  h2{font-size:15px;font-weight:700;color:#2563eb;margin:18px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
  h3{font-size:13px;font-weight:700;margin:10px 0 4px;color:#475569}
  .risk-badge{display:inline-block;padding:4px 16px;border-radius:99px;font-weight:800;font-size:14px;letter-spacing:1px;color:#fff}
  .risk-HIGH,.risk-CRITICAL{background:#ff6b6b}.risk-MODERATE{background:#f59e0b}.risk-LOW{background:#10b981}
  table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:12px}
  th{background:#f8fafc;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b}
  .mono{font-family:'JetBrains Mono',monospace;font-size:12px}
  .finding{padding:6px 8px;margin:4px 0;border-left:3px solid;border-radius:0 4px 4px 0;background:#f8fafc}
  .finding.CRITICAL,.finding.HIGH{border-color:#ff6b6b}.finding.MODERATE{border-color:#f59e0b}.finding.LOW{border-color:#10b981}
  .footer{margin-top:30px;padding-top:10px;border-top:2px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}
  .meta-row{display:flex;gap:20px;margin:8px 0;font-size:11px;color:#64748b}.meta-val{font-weight:700;color:#1e293b}
  @media print{body{padding:20px}@page{margin:15mm}}
</style>
</head>
<body>
<h1>⚕ AEGIS Clinical Intelligence Report</h1>
<div class="meta-row"><div>Date: <span class="meta-val">${ts.split("T")[0]}</span></div><div>Time: <span class="meta-val">${ts.split("T")[1].split(".")[0]}</span></div><div>Pipeline: <span class="meta-val">${((s.pipelineDurationMs||0)/1000).toFixed(1)}s</span></div><div>Agents: <span class="meta-val">7</span></div></div>
<p style="margin:10px 0"><span class="risk-badge risk-${s.overallRisk||'LOW'}">${s.overallRisk||'LOW'} RISK</span></p>

<h2>Executive Summary</h2>
<p>${s.executiveSummary || "N/A"}</p>

<h2>Key Metrics</h2>
<table><tr><th>Metric</th><th>Value</th></tr>
<tr><td>Overall Risk</td><td class="mono">${s.overallRisk}</td></tr>
<tr><td>Total Issues</td><td class="mono">${s.totalIssues}</td></tr>
<tr><td>Critical Issues</td><td class="mono">${s.criticalIssues}</td></tr>
<tr><td>Consensus Confidence</td><td class="mono">${arb.voting?.confidence || 0}%</td></tr>
<tr><td>Weighted Risk Score</td><td class="mono">${arb.voting?.weightedRiskScore || 0} / 4.00</td></tr>
<tr><td>Agent Votes</td><td class="mono">${arb.voting?.voteCount || 0}</td></tr>
<tr><td>Conflicts</td><td class="mono">${arb.conflictCount || 0}</td></tr>
</table>

${scores.length ? `<h2>Clinical Scoring Calculators</h2>
<table><tr><th>Score</th><th>Value</th><th>Risk</th><th>Recommendation</th></tr>
${scores.map(sc => `<tr><td><strong>${sc.name}</strong></td><td class="mono">${sc.score}/${sc.maxScore}</td><td><span class="risk-badge risk-${sc.risk}" style="font-size:10px;padding:2px 8px">${sc.risk}</span></td><td style="font-size:11px">${sc.recommendation}</td></tr>`).join("")}
</table>
${scores.map(sc => `<h3>${sc.name} Breakdown</h3><table><tr><th>Parameter</th><th>Points</th><th>Note</th></tr>${(sc.breakdown||[]).map(b => `<tr><td>${b.param}</td><td class="mono">+${b.value}</td><td>${b.note}</td></tr>`).join("")}</table>`).join("")}` : ""}

${arb.scoredIssues?.length ? `<h2>Dempster-Shafer Evidence</h2>
${arb.scoredIssues.map(is => `<div class="finding ${is.severity}"><strong>${is.type} — ${is.severity}</strong> <span class="mono" style="float:right">${Math.round(is.beliefMass*100)}%</span><br>${is.description}${is.sources?.length>1?`<br><small style="color:#64748b">Sources: ${is.sources.join(" + ")}</small>`:""}</div>`).join("")}` : ""}

${arb.consensus?.clinicalRecommendations?.length ? `<h2>Clinical Recommendations</h2>
<table><tr><th>#</th><th>Action</th><th>Rationale</th><th>Timeframe</th></tr>
${arb.consensus.clinicalRecommendations.map(r => `<tr><td class="mono">${r.priority}</td><td><strong>${r.action}</strong></td><td>${r.rationale}</td><td>${(r.timeframe||"").replace(/_/g," ")}</td></tr>`).join("")}
</table>` : ""}

${r.agents?.scribe?.output?.patient ? `<h2>Patient Information</h2>
<table><tr><th>Field</th><th>Value</th></tr>
<tr><td>Name</td><td>${r.agents.scribe.output.patient.name||"—"}</td></tr>
<tr><td>Age/Sex</td><td>${r.agents.scribe.output.patient.age||"—"} ${r.agents.scribe.output.patient.sex||""}</td></tr>
<tr><td>Diagnoses</td><td>${(r.agents.scribe.output.diagnoses||[]).map(d=>d.name+(d.icd10?` (${d.icd10})`:'')).join(", ")||"—"}</td></tr>
<tr><td>Medications</td><td>${(r.agents.scribe.output.medications||[]).map(m=>m.name+' '+(m.dose||'')).join(", ")||"—"}</td></tr>
<tr><td>Allergies</td><td>${(r.agents.scribe.output.allergies||[]).join(", ")||"None"}</td></tr>
</table>` : ""}

<h2>Agent Timings</h2>
<table><tr><th>Agent</th><th>Duration</th></tr>
${Object.entries(r.timings||{}).filter(([k])=>!["total","parallelPhase"].includes(k)).map(([k,v])=>`<tr><td>${k}</td><td class="mono">${(v/1000).toFixed(1)}s</td></tr>`).join("")}
<tr style="font-weight:700"><td>Total Pipeline</td><td class="mono">${((r.timings?.total||0)/1000).toFixed(1)}s</td></tr>
</table>

<div class="footer">
⚕ AEGIS v1.0 — Autonomous Examination Guardian & Intelligence System<br>
Generated by multi-agent consensus engine • ${new Date().toLocaleDateString()}<br>
<strong>CONFIDENTIAL</strong> — This report contains Protected Health Information (PHI)
</div>
</body>
</html>`;

  // Use iframe for complete CSS isolation from the dark-themed parent page
  // The browser's Print dialog has built-in "Save as PDF" — reliable, no blank pages
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:0;left:0;width:850px;height:100%;border:none;opacity:0;pointer-events:none;z-index:-999;";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(fullHTML);
  iframeDoc.close();

  // Wait for fonts + styles to load, then trigger print
  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      showToast('📄 Use "Save as PDF" in the Print dialog to download your report', 'info');
    } catch (e) {
      console.error("Print error:", e);
      // Final fallback: open in new tab
      const blob = new Blob([fullHTML], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      showToast('📄 Report opened in new tab — press Ctrl+P to save as PDF', 'info');
    }
    // Clean up iframe after print dialog closes
    setTimeout(() => { try { document.body.removeChild(iframe); } catch(e){} }, 3000);
  }, 800);
}

// ═══════════════════════════════════════════════════════════════
//  FHIR R4 EXPORT
// ═══════════════════════════════════════════════════════════════
function exportFHIR() {
  if (!lastPipelineResult) return alert("Run a pipeline first.");
  const btn = document.getElementById("exportFhirBtn");
  const origText = btn ? btn.textContent : "";
  if (btn) { btn.textContent = "⏳ Generating..."; btn.disabled = true; }
  fetch("/aegis/fhir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lastPipelineResult),
  })
  .then(r => r.json())
  .then(bundle => {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aegis_fhir_bundle_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (btn) { btn.textContent = "✅ Downloaded"; setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2000); }
    showToast('🔗 FHIR R4 bundle downloaded (' + (bundle.entry?.length || 0) + ' resources)', 'success');
  })
  .catch(e => { showToast('FHIR export failed: ' + e.message, 'error'); if (btn) { btn.textContent = origText; btn.disabled = false; } });
}

// ═══════════════════════════════════════════════════════════════
//  AUTO-SAVE RUN HISTORY
// ═══════════════════════════════════════════════════════════════
function saveRunToServer(result) {
  fetch("/aegis/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  }).catch(() => {}); // silent fail — persistence is best-effort
}

// Wire all buttons
// ═══════════════════════════════════════════════════════════════
//  VITAL STREAM MONITOR
// ═══════════════════════════════════════════════════════════════
let vitalSource = null;
let vitalHistory = [];

let vitalStreamStart = 0;

function startVitalStream() {
  if (vitalSource) vitalSource.close();
  vitalHistory = [];
  vitalCanvasReady = false;
  vitalStreamStart = Date.now();
  const scenario = $("#vitalScenario").value;
  $("#startVitals").style.display = "none";
  $("#stopVitals").style.display = "";
  $("#vitalStatus").textContent = "Streaming...";
  $("#vitalStatus").style.color = "var(--accent-green)";

  // Show canvas, hide placeholder
  const placeholder = document.getElementById("vitalPlaceholder");
  const canvas = document.getElementById("vitalsChart");
  if (placeholder) placeholder.style.display = "none";
  if (canvas) canvas.style.display = "";

  vitalSource = new EventSource(`/vitals/stream?scenario=${scenario}`);
  vitalSource.onmessage = (e) => {
    if (e.data === "[DONE]") { stopVitalStream(); return; }
    try {
      const point = JSON.parse(e.data);
      if (point.done) { stopVitalStream(); return; }
      vitalHistory.push(point);
      renderVitalCards(point);
      renderVitalChart();
      renderVitalAlert(point);
      // Update elapsed time
      const elapsed = Math.round((Date.now() - vitalStreamStart) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      $("#vitalStatus").textContent = `${vitalHistory.length} readings · ${min}:${sec.toString().padStart(2, "0")}`;
    } catch (err) {}
  };
  vitalSource.onerror = () => { stopVitalStream(); };
}

function stopVitalStream() {
  if (vitalSource) { vitalSource.close(); vitalSource = null; }
  $("#startVitals").style.display = "";
  $("#stopVitals").style.display = "none";
  const elapsed = vitalStreamStart ? Math.round((Date.now() - vitalStreamStart) / 1000) : 0;
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  $("#vitalStatus").textContent = vitalHistory.length > 0
    ? `${vitalHistory.length} readings · ${min}:${sec.toString().padStart(2, "0")} elapsed`
    : "Idle";
}

function renderVitalCards(point) {
  const v = point.vitals;
  const news = point.news2;
  const newsColor = news >= 7 ? "var(--accent-red)" : news >= 5 ? "#ff6b6b" : news >= 3 ? "var(--accent-amber)" : "var(--accent-green)";

  const cards = [
    { label: "HR", value: v.hr, unit: "bpm", color: v.hr > 100 || v.hr < 60 ? "var(--accent-red)" : "var(--accent-green)", icon: "💓" },
    { label: "BP", value: v.bp, unit: "mmHg", color: v.sbp > 140 || v.sbp < 90 ? "var(--accent-red)" : "var(--accent-green)", icon: "🩸" },
    { label: "SpO2", value: v.spo2, unit: "%", color: v.spo2 < 92 ? "var(--accent-red)" : v.spo2 < 95 ? "var(--accent-amber)" : "var(--accent-green)", icon: "🫁" },
    { label: "RR", value: v.rr, unit: "/min", color: v.rr > 24 || v.rr < 10 ? "var(--accent-red)" : "var(--accent-green)", icon: "🌬️" },
    { label: "Temp", value: v.temp, unit: "°C", color: v.temp > 38.5 ? "var(--accent-red)" : v.temp < 36 ? "var(--accent-amber)" : "var(--accent-green)", icon: "🌡️" },
    { label: "NEWS2", value: news, unit: "/20", color: newsColor, icon: "⚠️" },
  ];

  $("#vitalCards").innerHTML = cards.map(c => `
    <div style="background:rgba(0,0,0,0.2);border:1px solid var(--border-subtle);border-radius:10px;padding:8px;text-align:center;transition:all 0.3s">
      <div style="font-size:0.6rem;color:var(--text-muted)">${c.icon} ${c.label}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:1.2rem;font-weight:800;color:${c.color};transition:color 0.5s">${c.value}</div>
      <div style="font-size:0.55rem;color:var(--text-muted)">${c.unit}</div>
    </div>
  `).join("");
}

let vitalCanvasReady = false;
let vitalCtx = null, vitalW = 0, vitalH = 0;

function renderVitalChart() {
  // Always recalculate from CSS rect to handle zoom changes (fixes blur)
  const canvas = document.getElementById("vitalsChart");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width, cssH = rect.height || 160;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  canvas.style.height = "160px";
  const ctx = canvas.getContext("2d");
  const w = cssW, h = cssH;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (vitalHistory.length < 2) { ctx.restore(); return; }
  const maxPts = 60;
  const data = vitalHistory.slice(-maxPts);
  const padL = 40, padR = 10, padT = 18, padB = 5;
  const cw = w - padL - padR, ch = h - padT - padB;

  // Draw grid
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (ch / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
  }

  // Clamp helper — maps value to Y coordinate safely
  function yPos(val, min, max) {
    const ratio = Math.max(0, Math.min(1, (val - min) / (max - min)));
    return padT + ch - ratio * ch;
  }

  // Draw lines — wider ranges to handle sepsis extremes
  const lines = [
    { key: "hr", label: "HR", color: "#ff6b6b", min: 30, max: 200 },
    { key: "spo2", label: "SpO2", color: "#00cec9", min: 70, max: 100 },
    { key: "rr", label: "RR", color: "#fdcb6e", min: 5, max: 50 },
  ];
  const news2Line = { label: "NEWS2", color: "#a29bfe", min: 0, max: 20 };

  for (const line of lines) {
    ctx.beginPath();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    for (let i = 0; i < data.length; i++) {
      const x = padL + (i / Math.max(data.length - 1, 1)) * cw;
      const y = yPos(data[i].vitals[line.key] || 0, line.min, line.max);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // NEWS2 line (thicker, dashed)
  ctx.beginPath();
  ctx.strokeStyle = news2Line.color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 3]);
  for (let i = 0; i < data.length; i++) {
    const x = padL + (i / Math.max(data.length - 1, 1)) * cw;
    const y = yPos(data[i].news2, news2Line.min, news2Line.max);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Legend
  const legends = [...lines, news2Line];
  ctx.font = "10px 'Inter', sans-serif";
  let lx = padL + 5;
  for (const l of legends) {
    ctx.fillStyle = l.color;
    ctx.fillRect(lx, padT - 12, 12, 3);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(l.label, lx + 16, padT - 7);
    lx += ctx.measureText(l.label).width + 32;
  }

  // Current values on right edge
  const last = data[data.length - 1];
  ctx.font = "9px 'JetBrains Mono', monospace";
  ctx.textAlign = "left";
  const lastX = padL + ((data.length - 1) / Math.max(data.length - 1, 1)) * cw + 4;
  ctx.fillStyle = "#ff6b6b"; ctx.fillText(last.vitals.hr, lastX, yPos(last.vitals.hr, 30, 200) + 3);
  ctx.fillStyle = "#00cec9"; ctx.fillText(last.vitals.spo2, lastX, yPos(last.vitals.spo2, 70, 100) + 3);
  ctx.fillStyle = "#a29bfe"; ctx.fillText("N:" + last.news2, lastX, yPos(last.news2, 0, 20) + 3);

  ctx.restore();
}

function renderVitalAlert(point) {
  const bar = $("#vitalsAlertBar");
  if (!point.alert) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const colors = { CRITICAL: "var(--accent-red)", HIGH: "#ff6b6b", MODERATE: "var(--accent-amber)" };
  bar.style.background = colors[point.alert.level] || "var(--accent-amber)";
  bar.style.color = "#fff";
  bar.textContent = `⚠️ ${point.alert.level}: ${point.alert.message}`;
}

// ═══════════════════════════════════════════════════════════════
//  FAILED AGENTS DISCLOSURE
// ═══════════════════════════════════════════════════════════════
function showFailedAgents(result) {
  const bar = document.getElementById("failedAgentsBar");
  if (!bar) return;
  const failed = result.failedAgents || [];
  if (failed.length === 0) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  bar.textContent = `⚠️ ${failed.length} agent(s) failed: ${failed.join(", ").toUpperCase()}. Consensus confidence reduced. Results based on ${7 - failed.length}/7 agents.`;
  // Auto-hide after 15 seconds
  setTimeout(() => bar.classList.add("hidden"), 15000);
}

// ═══════════════════════════════════════════════════════════════
//  AGENT TIMING BARS — Shows latency breakdown per agent
// ═══════════════════════════════════════════════════════════════
function renderAgentTimingBars(result) {
  const timings = result.timings || {};
  const agents = ["scribe", "guardian", "compliance", "sentinel", "advocate", "arbiter"];
  const data = agents.map(a => ({ name: a, ms: timings[a] || 0 })).filter(d => d.ms > 0);
  if (data.length === 0) return;

  const total = timings.total || data.reduce((s, d) => s + d.ms, 0);
  const maxMs = Math.max(...data.map(d => d.ms));

  // Find or create timing container in dashboard
  let container = document.getElementById("agentTimingBars");
  if (!container) {
    container = document.createElement("div");
    container.id = "agentTimingBars";
    container.style.cssText = "grid-column:1/-1;padding:10px;background:rgba(0,0,0,0.15);border-radius:12px;border:1px solid var(--border-subtle)";
    const dashGrid = document.querySelector(".dashboard-grid");
    if (dashGrid) dashGrid.appendChild(container);
  }

  const colors = {
    scribe: "#a29bfe", guardian: "#00cec9", compliance: "#fdcb6e",
    sentinel: "#fd79a8", advocate: "#00b894", arbiter: "#6c5ce7"
  };
  const icons = {
    scribe: "🖊️", guardian: "🛡️", compliance: "📋",
    sentinel: "🔍", advocate: "📄", arbiter: "⚖️"
  };

  container.innerHTML = `
    <div style="font-size:0.65rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">
      ⏱️ Agent Latency Breakdown — Total: ${(total/1000).toFixed(1)}s
    </div>
    ${data.map(d => {
      const pct = Math.max(5, (d.ms / maxMs) * 100);
      const sec = (d.ms / 1000).toFixed(1);
      const col = colors[d.name] || "#888";
      const icon = icons[d.name] || "•";
      const barColor = d.ms > 8000 ? "var(--accent-red)" : d.ms > 4000 ? "var(--accent-amber)" : col;
      return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <div style="width:80px;font-size:0.65rem;font-weight:600;color:${col};text-align:right">${icon} ${d.name}</div>
        <div style="flex:1;height:16px;background:rgba(255,255,255,0.04);border-radius:8px;overflow:hidden;position:relative">
          <div style="width:${pct}%;height:100%;background:${barColor};border-radius:8px;transition:width 0.6s ease;display:flex;align-items:center;justify-content:flex-end;padding-right:6px">
            <span style="font-family:'JetBrains Mono',monospace;font-size:0.55rem;color:rgba(0,0,0,0.8);font-weight:700">${sec}s</span>
          </div>
        </div>
      </div>`;
    }).join("")}
  `;
}

// Wire all buttons
document.addEventListener("DOMContentLoaded", () => {
  const pdfBtn = document.getElementById("exportPdfBtn");
  if (pdfBtn) pdfBtn.addEventListener("click", exportPDF);

  const fhirBtn = document.getElementById("exportFhirBtn");
  if (fhirBtn) fhirBtn.addEventListener("click", exportFHIR);

  const startBtn = document.getElementById("startVitals");
  if (startBtn) startBtn.addEventListener("click", startVitalStream);

  const stopBtn = document.getElementById("stopVitals");
  if (stopBtn) stopBtn.addEventListener("click", stopVitalStream);
});

// ═══════════════════════════════════════════════════════════════
//  WHAT-IF MEDICATION SANDBOX — Interactive Drug Modeling
//  Toggles medications on/off and instantly recalculates risk
//  using deterministic Guardian checks (~5ms, no LLM call)
// ═══════════════════════════════════════════════════════════════
let whatIfEntities = null;
let whatIfDebounce = null;

function initWhatIfSandbox(result) {
  const entities = result.agents?.scribe?.output;
  if (!entities || !entities.medications?.length) return;

  whatIfEntities = JSON.parse(JSON.stringify(entities)); // deep clone
  const sandbox = $("#whatIfSandbox");
  sandbox.classList.remove("hidden");

  const grid = $("#whatIfMedGrid");
  const meds = entities.medications || [];
  const allergies = entities.allergies || [];

  // Build medication toggle rows
  let html = "";
  for (const med of meds) {
    const name = med.name || "Unknown";
    const dose = med.dose || "";
    const id = `whatif-med-${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    html += `
      <label class="whatif-med-row" for="${id}" id="row-${id}">
        <div class="whatif-med-info">
          <span class="whatif-med-name">💊 ${name}</span>
          ${dose ? `<span class="whatif-med-dose">${dose}</span>` : ""}
        </div>
        <div class="whatif-toggle-wrap">
          <input type="checkbox" id="${id}" class="whatif-toggle" data-med="${name}" checked>
          <div class="whatif-slider"></div>
        </div>
      </label>`;
  }

  // Show allergies (not toggleable — always active)
  if (allergies.length) {
    html += `<div style="margin-top:0.6rem;font-size:0.62rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Allergies (always active)</div>`;
    for (const a of allergies) {
      html += `<div class="whatif-allergy-row">⚠️ ${a}</div>`;
    }
  }

  grid.innerHTML = html;

  // Wire toggle events
  grid.querySelectorAll(".whatif-toggle").forEach(toggle => {
    toggle.addEventListener("change", () => runWhatIfAnalysis());
  });

  // Run initial analysis to set baseline
  runWhatIfAnalysis();
}

async function runWhatIfAnalysis() {
  if (!whatIfEntities) return;

  // Debounce rapid toggles
  if (whatIfDebounce) clearTimeout(whatIfDebounce);
  whatIfDebounce = setTimeout(async () => {
    const grid = $("#whatIfMedGrid");
    const toggles = grid.querySelectorAll(".whatif-toggle");
    const disabledMeds = [];

    toggles.forEach(t => {
      const row = document.getElementById(`row-${t.id}`);
      if (!t.checked) {
        disabledMeds.push(t.dataset.med);
        if (row) row.classList.add("disabled");
      } else {
        if (row) row.classList.remove("disabled");
      }
    });

    // Update status
    const statusBadge = $("#whatIfStatus");
    statusBadge.textContent = "Analyzing...";
    statusBadge.className = "panel-badge";

    try {
      const resp = await fetch("/aegis/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entities: whatIfEntities,
          disabledMeds,
        }),
      });
      const data = await resp.json();

      if (!data.success) {
        statusBadge.textContent = "Error";
        return;
      }

      // Update latency badge
      $("#whatIfLatency").textContent = `${data.durationMs}ms`;

      // Update risk level with color animation
      const riskEl = $("#whatIfRiskLevel");
      const risk = data.guardian.riskLevel || "LOW";
      riskEl.textContent = risk;
      const riskColors = {
        LOW: "var(--accent-green)",
        MODERATE: "var(--accent-amber)",
        HIGH: "var(--accent-red)",
        CRITICAL: "var(--accent-red)",
      };
      riskEl.style.color = riskColors[risk] || riskColors.LOW;

      // Animate the risk readout border
      const readout = $("#whatIfRiskReadout");
      readout.style.borderColor = riskColors[risk] || "var(--border-subtle)";
      readout.style.transition = "border-color 0.3s";

      // Update findings count
      const findingsCount = data.guardian.findings?.length || 0;
      $("#whatIfFindings").textContent = findingsCount === 0
        ? "✅ No safety issues"
        : `⚠️ ${findingsCount} safety issue${findingsCount > 1 ? "s" : ""} detected`;

      // Render findings list
      const findingsList = $("#whatIfFindingsList");
      if (findingsCount > 0) {
        findingsList.innerHTML = data.guardian.findings.map(f => {
          const sevClass = (f.severity || "low").toLowerCase();
          return `<div class="finding-item ${sevClass}" style="margin:3px 0;padding:4px 6px;font-size:0.65rem">
            <div class="finding-type">${f.type} — ${f.severity}</div>
            <div>${f.message}</div>
          </div>`;
        }).join("");
      } else {
        findingsList.innerHTML = "";
      }

      // Update status
      const disabledCount = disabledMeds.length;
      if (disabledCount > 0) {
        statusBadge.textContent = `${disabledCount} med${disabledCount > 1 ? "s" : ""} disabled`;
        statusBadge.className = "panel-badge moderate";
      } else {
        statusBadge.textContent = "Baseline (all meds)";
        statusBadge.className = "panel-badge pass";
      }

      // Toast notification on significant risk change
      const origRisk = lastPipelineResult?.agents?.guardian?.output?.riskLevel;
      if (origRisk && origRisk !== risk) {
        const direction = ["LOW","MODERATE","HIGH","CRITICAL"].indexOf(risk) < ["LOW","MODERATE","HIGH","CRITICAL"].indexOf(origRisk) ? "decreased" : "increased";
        showToast(`Risk ${direction}: ${origRisk} → ${risk}`, direction === "decreased" ? "success" : "warning");
      }

    } catch (err) {
      console.error("What-If error:", err);
      statusBadge.textContent = "API Error";
      statusBadge.className = "panel-badge fail";
    }
  }, 150); // 150ms debounce
}
