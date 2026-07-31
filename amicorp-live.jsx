import { useState, useRef, useEffect, useCallback } from "react";

const PRODUCTS = [
  {c:"Bahamas",s:"Company",n:"Bahamas IBC",d:"Tax-neutral IBC for international trade and investment holding.",t:"3-7 days",f:"USD 1,560"},
  {c:"Bahamas",s:"Trust",n:"Bahamas Trust",d:"Discretionary trust for asset protection and succession planning.",t:"5-10 days",f:"USD 4,500"},
  {c:"Bahamas",s:"Fund",n:"Bahamas Exempt LP",d:"Exempted LP — popular vehicle for PE/VC/RE funds.",t:"4-6 weeks",f:"Quote"},
  {c:"British Virgin Islands",s:"Company",n:"BVI Business Company",d:"Flexible tax-neutral IBC for international holding and trading.",t:"3-7 days",f:"USD 1,780"},
  {c:"British Virgin Islands",s:"Trust",n:"BVI Trust",d:"Discretionary trust for asset protection and succession planning.",t:"5-10 days",f:"USD 5,530"},
  {c:"British Virgin Islands",s:"Trust",n:"BVI Vista Trust",d:"Vista trust with enhanced settlor control and asset protection.",t:"5-10 days",f:"USD 5,530"},
  {c:"British Virgin Islands",s:"Fund",n:"BVI LP",d:"Limited Partnership for PE/VC fund structures.",t:"4-6 weeks",f:"Quote"},
  {c:"Cayman Islands",s:"Company",n:"Cayman Exempt Company",d:"Tax-exempt company for holding, JVs, and SPVs.",t:"3-7 days",f:"USD 2,170"},
  {c:"Cayman Islands",s:"Trust",n:"Cayman Trust",d:"Discretionary trust for international HNW families.",t:"5-10 days",f:"USD 6,940"},
  {c:"Cayman Islands",s:"Fund",n:"Cayman Exempt LP",d:"Global standard vehicle for PE/VC/RE funds.",t:"4-6 weeks",f:"Quote"},
  {c:"Curacao",s:"Company",n:"Curacao BV",d:"Dutch-style BV — holding company for LatAm and Caribbean.",t:"3-7 days",f:"USD 3,020"},
  {c:"Curacao",s:"Company",n:"Curacao NV",d:"NV — public limited company for listings and larger enterprises.",t:"3-7 days",f:"USD 3,020"},
  {c:"Curacao",s:"Foundation",n:"Curacao SPF",d:"Stichting Particulier Fonds — private foundation for wealth management.",t:"4-6 weeks",f:"USD 3,020"},
  {c:"Curacao",s:"Fund",n:"Curacao CV",d:"Commanditaire Vennootschap — limited partnership under Dutch law.",t:"4-6 weeks",f:"Quote"},
  {c:"Cyprus",s:"Company",n:"Cyprus Ltd",d:"EU company — 15% CIT, participation exemption, IP box, 65+ treaties.",t:"3-7 days",f:"EUR 2,200"},
  {c:"Cyprus",s:"Trust",n:"Cyprus Trust",d:"International trust under Cyprus law — no tax on foreign income.",t:"5-10 days",f:"EUR 4,500"},
  {c:"Cyprus",s:"Fund",n:"Cyprus LP",d:"EU limited partnership for PE/VC strategies.",t:"4-6 weeks",f:"Quote"},
  {c:"Delaware",s:"Company",n:"Delaware LLC",d:"Check-the-box LLC — pass-through tax, US banking access.",t:"3-7 days",f:"USD 1,910"},
  {c:"Dubai",s:"Company",n:"Dubai DIFC Prescribed Company",d:"DIFC holding company — 0% tax, GCC hub, 130+ treaties via UAE.",t:"3-7 days",f:"USD 3,000"},
  {c:"Dubai",s:"Fund",n:"Dubai DIFC ICC Compartment",d:"Ring-fenced compartment within Amicorp's DIFC ICC — own assets, 0% tax, access to UAE's 130+ treaty network. Managed by Amicorp's DIFC-licensed investment manager. The vehicle already exists — available significantly faster than incorporating a standalone entity.",t:"1-2 weeks",f:"Quote",compartment:true},
  {c:"Hong Kong",s:"Company",n:"Hong Kong Ltd",d:"Asia gateway — 0% tax on offshore profits, 40+ treaties.",t:"1-3 days",f:"USD 3,580"},
  {c:"Hong Kong",s:"Fund",n:"Hong Kong LP",d:"LP fund structure for Asia-focused PE/VC.",t:"4-6 weeks",f:"Quote"},
  {c:"Ireland",s:"Company",n:"Ireland Ltd",d:"EU company — 12.5% trading rate, 70+ treaties, EU access.",t:"3-7 days",f:"EUR 2,280"},
  {c:"Luxembourg",s:"Company",n:"Luxembourg SA",d:"EU holding company — participation exemption, 80+ treaties.",t:"7-14 days",f:"EUR 6,455"},
  {c:"Luxembourg",s:"Company",n:"Luxembourg Sarl",d:"EU private company — participation exemption, 80+ treaties.",t:"7-14 days",f:"EUR 6,455"},
  {c:"Luxembourg",s:"Fund",n:"Luxembourg SCSp",d:"Special LP — Europe's leading PE/VC fund vehicle.",t:"3-6 months",f:"Quote"},
  {c:"Malta",s:"Company",n:"Malta Ltd",d:"EU company — effective 5% CIT via refund, EU directives.",t:"3-7 days",f:"EUR 2,950"},
  {c:"Mauritius",s:"Company",n:"Mauritius GBLC",d:"GBL Company — treaty access for India and Africa investments.",t:"3-7 days",f:"USD 2,720"},
  {c:"Mauritius",s:"Trust",n:"Mauritius Trust",d:"Discretionary trust for African HNW families.",t:"5-10 days",f:"USD 3,930"},
  {c:"Mauritius",s:"Fund",n:"Mauritius VCC Compartment",d:"Sub-fund within Amicorp's licensed Mauritius Variable Capital Company — ring-fenced with its own NAV and investor register. Managed by Amicorp's FSC-licensed investment manager in Port Louis. The vehicle already exists — available significantly faster than establishing a new fund.",t:"2-3 weeks",f:"Quote",compartment:true},
  {c:"Mauritius",s:"Fund",n:"Mauritius PCC Compartment",d:"Protected Cell within Amicorp's Mauritius Protected Cell Company — legally ring-fenced, insulated from other cells. Managed by Amicorp's FSC-licensed investment manager. Fastest route to a Mauritius-regulated vehicle with access to India, Africa and OECD treaty network.",t:"2-3 weeks",f:"Quote",compartment:true},
  {c:"Netherlands",s:"Company",n:"Netherlands BV",d:"Dutch BV — participation exemption, IP box 9%, 90+ treaties.",t:"3-7 days",f:"EUR 3,500"},
  {c:"Panama",s:"Company",n:"Panama SA",d:"Territorial tax SA — 0% on foreign-source income.",t:"3-7 days",f:"USD 1,650"},
  {c:"Panama",s:"Foundation",n:"Panama Foundation",d:"Private Interest Foundation — asset protection and succession.",t:"5-10 days",f:"USD 1,650"},
  {c:"Singapore",s:"Company",n:"Singapore Pte Ltd",d:"Asia premier hub — extensive treaty network, strong governance.",t:"1-3 days",f:"USD 2,230"},
  {c:"Singapore",s:"Trust",n:"Singapore Trust",d:"Discretionary trust under Singapore law.",t:"5-10 days",f:"USD 12,380"},
  {c:"Singapore",s:"Fund",n:"Singapore VCC",d:"Variable Capital Company — umbrella fund with ring-fenced sub-funds, each with own NAV and investors.",t:"6-8 weeks",f:"Quote"},
  {c:"Singapore",s:"Fund",n:"Singapore VCC Compartment",d:"Sub-fund within Amicorp's MAS-approved Variable Capital Company — ring-fenced assets, own NAV, separate investor register. Managed by Amicorp's MAS-licensed fund manager in Singapore. The vehicle already exists — access Singapore's 90+ treaty network significantly faster than a standalone VCC.",t:"2-3 weeks",f:"Quote",compartment:true},
  {c:"United Kingdom",s:"Company",n:"UK Ltd",d:"UK company — SSE (0% CGT), 120+ treaties.",t:"3-7 days",f:"USD 2,280"},
  {c:"United Kingdom",s:"Trust",n:"UK Trust",d:"Discretionary trust — flexible succession and asset protection.",t:"5-10 days",f:"USD 8,430"},
  {c:"Chile",s:"Company",n:"Chile SA",d:"SA — standard Chilean corporation for South American holdings.",t:"3-7 days",f:"USD 1,500"},
  {c:"Argentina",s:"Trust",n:"Argentina Trust",d:"Fideicomiso — Argentine trust for asset protection.",t:"5-10 days",f:"USD 5,000"},
  {c:"Germany",s:"Company",n:"Germany GmbH",d:"GmbH — German LLC for EU market operations.",t:"7-14 days",f:"EUR 3,710"},
];

const SYSTEM_PROMPT = `You are the Amicorp Structuring Assistant. Be concise and direct — short questions, short answers.

IMPORTANT: For all fees and setup timeframes, ONLY use the exact figures from the Knowledge Base below. Never estimate or use your own training data for fees.

PRODUCTS (recommend ONLY these, by exact name):
${PRODUCTS.map(p=>`${p.n} | ${p.c} | ${p.f}${p.compartment?" [COMPARTMENT]":""}`).join('\n')}

PROCESS:
- Ask max 2 short questions at a time to establish: client residency, target country/asset, objective, existing entities
- Once you have enough: give a brief treaty analysis (1-2 lines per route: WHT on dividends/interest/royalties, capital gains treatment) then present 2-3 solutions
- Be succinct — bullet points preferred over paragraphs

TREATY ANALYSIS — for each holding jurisdiction considered, state:
• Dividend WHT: source country rate → treaty rate via holdco jurisdiction
• Interest/royalty WHT: key rates
• Capital gains: participation exemption / SSE / territorial / zero-tax regime

COMPARTMENT RULE — MANDATORY:
Whenever you recommend Singapore, Mauritius, or Dubai as a holding/fund jurisdiction due to their treaty network, you MUST also present a compartment as an additional option:
- Singapore → offer "Singapore VCC Compartment" as an alternative to Singapore Pte Ltd or standalone Singapore VCC
- Mauritius → offer "Mauritius VCC Compartment" OR "Mauritius PCC Compartment" as an alternative to Mauritius GBLC
- Dubai → offer "Dubai DIFC ICC Compartment" as an alternative to Dubai DIFC Prescribed Company

When presenting a compartment always highlight:
1. SPEED: The entity already exists — no standalone incorporation or regulatory approval needed, saving 4-8 weeks vs setting up a new vehicle
2. LICENSED MANAGER: The compartment is managed by Amicorp's locally licensed investment manager / fund manager in that jurisdiction

Do NOT mention cost savings or describe it as cheaper. Do NOT use the phrase "substance assured" or "economic substance".
Label compartment solutions clearly e.g. "Option B: Singapore VCC Compartment"

WHEN READY — append this JSON (compact, one line):
\`\`\`json
{"ready":true,"solutions":[{"name":"Option A","summary":"One line rationale","entities":[{"id":"e1","name":"Client","shape":"person","jurisdiction":"Germany","role":"Owner","existing":true},{"id":"e2","name":"Netherlands BV","shape":"company","jurisdiction":"Netherlands","role":"Holdco","existing":false},{"id":"e3","name":"Brazil OpCo","shape":"company","jurisdiction":"Brazil","role":"Operating entity","existing":true}],"connections":[{"from":"e1","to":"e2","label":"100%"},{"from":"e2","to":"e3","label":"100%"}]}]}
\`\`\`

JSON rules:
- existing:true = client already owns it; existing:false = new Amicorp entity to set up
- shapes: person, company, trust, foundation, partnership (use partnership for all compartments/LP/VCC/PCC/ICC)
- 3-5 entities per solution including person and target

End every reply: *Illustrative only — not legal, tax or financial advice.*`;

const STARTERS = [
  "We're expanding our business into a new country — what's the most tax-efficient holding structure?",
  "I want to protect my family's wealth across generations — what structure suits us best?",
  "We're launching a private equity fund for international investors — which jurisdiction and vehicle?",
  "I'm selling my company soon — what pre-sale structure optimises tax and reinvestment?",
];

const STARTER_PROMPTS = [
  "We are expanding our business into a new country and want a tax-efficient holding structure. Can you help?",
  "I have significant personal wealth across several countries and want to protect it for my family. What would you recommend?",
  "We are launching a private equity fund for international investors and need the right jurisdiction and vehicle.",
  "I am selling my company within 12-24 months and want to minimise tax on proceeds and reinvest efficiently.",
];

const SHAPE_EMOJI = {person:"👤",company:"🏢",trust:"▲",foundation:"◆",partnership:"⬭"};

function SendIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M22 2L15 22L11 13L2 9L22 2Z" fill="white"/>
    </svg>
  );
}

function findProduct(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  return PRODUCTS.find(p => {
    const pn = p.n.toLowerCase();
    return pn === n || n.includes(pn) || pn.includes(n.split(' ').slice(0,3).join(' '));
  });
}

function renderMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/^#{1,3}\s+(.+)$/gm,"<strong>$1</strong>")
    .split(/\n\n+/)
    .map(p => {
      const t = p.trim();
      if (!t) return "";
      if (t.match(/^[•\-\*]\s/m)) {
        const items = t.split('\n').filter(l=>l.trim()).map(l=>`<li>${l.replace(/^[•\-\*]\s*/,'')}</li>`).join('');
        return `<ul style="margin:4px 0 4px 16px;padding:0">${items}</ul>`;
      }
      return `<p style="margin-bottom:6px">${t.replace(/\n/g,"<br/>")}</p>`;
    })
    .join("");
}

function buildSVG(sol) {
  const entities=sol.entities||[], conns=sol.connections||[];
  const NW=155,NH=50,HGAP=22,VGAP=66,CW=680;
  const childMap={},parentMap={};
  entities.forEach(e=>{childMap[e.id]=[];parentMap[e.id]=[];});
  conns.forEach(c=>{if(childMap[c.from])childMap[c.from].push(c.to);if(parentMap[c.to])parentMap[c.to].push(c.from);});
  const levels=[],visited=new Set();
  function assign(id,d){if(visited.has(id))return;visited.add(id);if(!levels[d])levels[d]=[];levels[d].push(id);(childMap[id]||[]).forEach(c=>assign(c,d+1));}
  const roots=entities.filter(e=>!(parentMap[e.id]||[]).length).map(e=>e.id);
  if(!roots.length&&entities.length)roots.push(entities[0].id);
  roots.forEach(r=>assign(r,0));
  const pos={};
  const svgH=Math.max(levels.length*(NH+VGAP)+VGAP*0.4,120);
  levels.forEach((ids,d)=>{const total=ids.length*NW+(ids.length-1)*HGAP,sx=(CW-total)/2;ids.forEach((id,i)=>{pos[id]={x:sx+i*(NW+HGAP),y:VGAP*0.3+d*(NH+VGAP)};});});
  const sn=n=>n&&n.length>20?n.slice(0,19)+"…":(n||"");
  const esc=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  let svg=`<svg viewBox="0 0 ${CW} ${svgH}" xmlns="http://www.w3.org/2000/svg" font-family="Inter,sans-serif"><defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#b0bec5"/></marker></defs>`;
  conns.forEach(c=>{const f=pos[c.from],t=pos[c.to];if(!f||!t)return;const x1=f.x+NW/2,y1=f.y+NH,x2=t.x+NW/2,y2=t.y;svg+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#b0bec5" stroke-width="1.5" marker-end="url(#ar)"/>`;if(c.label){const mx=(x1+x2)/2,my=(y1+y2)/2;svg+=`<rect x="${mx-26}" y="${my-8}" width="52" height="14" rx="4" fill="white" fill-opacity="0.9"/><text x="${mx}" y="${my+3}" text-anchor="middle" font-size="8.5" fill="#9aa5b4">${esc(c.label)}</text>`;}});
  entities.forEach(e=>{
    const p=pos[e.id];if(!p)return;
    const cx=p.x+NW/2,cy=p.y+NH/2,shape=e.shape||"company",isExisting=e.existing===true,alpha=isExisting?"0.55":"1";
    if(shape==="person"){const hx=cx,hy=p.y+3;svg+=`<g opacity="${alpha}"><circle cx="${hx}" cy="${hy+7}" r="7" fill="#0d1b3e"/><line x1="${hx}" y1="${hy+14}" x2="${hx}" y2="${hy+30}" stroke="#0d1b3e" stroke-width="2.2"/><line x1="${hx-11}" y1="${hy+20}" x2="${hx+11}" y2="${hy+20}" stroke="#0d1b3e" stroke-width="2.2"/><line x1="${hx}" y1="${hy+30}" x2="${hx-9}" y2="${hy+43}" stroke="#0d1b3e" stroke-width="2.2"/><line x1="${hx}" y1="${hy+30}" x2="${hx+9}" y2="${hy+43}" stroke="#0d1b3e" stroke-width="2.2"/><text x="${hx}" y="${p.y+NH-1}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#0d1b3e">${esc(sn(e.name))}</text></g>`;}
    else if(shape==="trust"){svg+=`<g opacity="${alpha}"><polygon points="${cx},${p.y+2} ${p.x+2},${p.y+NH-2} ${p.x+NW-2},${p.y+NH-2}" fill="#fffbeb" stroke="#d4a017" stroke-width="1.8"/><text x="${cx}" y="${cy+1}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#0d1b3e">${esc(sn(e.name))}</text><text x="${cx}" y="${cy+13}" text-anchor="middle" font-size="8" fill="#9aa5b4">${esc(e.jurisdiction||"")}</text></g>`;}
    else if(shape==="foundation"){svg+=`<g opacity="${alpha}"><ellipse cx="${cx}" cy="${cy}" rx="${NW/2-2}" ry="${NH/2-2}" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.8"/><text x="${cx}" y="${cy+1}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#0d1b3e">${esc(sn(e.name))}</text><text x="${cx}" y="${cy+13}" text-anchor="middle" font-size="8" fill="#9aa5b4">${esc(e.jurisdiction||"")}</text></g>`;}
    else if(shape==="partnership"){
      const prod=findProduct(e.name);
      const isComp=prod&&prod.compartment;
      svg+=`<g opacity="${alpha}"><ellipse cx="${cx}" cy="${cy}" rx="${NW/2-2}" ry="${NH/2-2}" fill="${isComp?"#ecfeff":"#eff6ff"}" stroke="${isComp?"#0891b2":"#3b5bdb"}" stroke-width="1.8"/><text x="${cx}" y="${cy+1}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#0d1b3e">${esc(sn(e.name))}</text><text x="${cx}" y="${cy+13}" text-anchor="middle" font-size="8" fill="#9aa5b4">${esc(e.jurisdiction||"")}</text></g>`;
    }
    else{const isTgt=(e.role||"").toLowerCase().includes("opco")||(e.role||"").toLowerCase().includes("operating")||(e.role||"").toLowerCase().includes("target");const fill=isExisting?"#f8fafc":isTgt?"#fff7ed":"#f0f4f8";const stroke=isExisting?"#c8d3e8":isTgt?"#ea580c":"#0d1b3e";svg+=`<g opacity="${alpha}"><rect x="${p.x+1}" y="${p.y+1}" width="${NW-2}" height="${NH-2}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${isExisting?"1.2":"1.8"}"/>${isExisting?`<text x="${cx}" y="${p.y+9}" text-anchor="middle" font-size="7" fill="#c8d3e8" letter-spacing="0.5">EXISTING</text>`:""}<text x="${cx}" y="${isExisting?cy+2:cy-3}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#0d1b3e">${esc(sn(e.name))}</text><text x="${cx}" y="${isExisting?cy+14:cy+11}" text-anchor="middle" font-size="8" fill="#9aa5b4">${esc(e.jurisdiction||"")}</text></g>`;}
  });
  return svg+"</svg>";
}

// Accepts an optional systemPrompt so the intake-collected user context can be injected
async function callWithTools(messages, onStatus, systemPrompt = SYSTEM_PROMPT) {
  const MAX_TURNS=5;
  let msgs=[...messages];
  for(let turn=0;turn<MAX_TURNS;turn++){
    const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2000,system:systemPrompt,tools:[{type:"web_search_20250305",name:"web_search"}],messages:msgs})});
    if(!res.ok)throw new Error(`API ${res.status}`);
    const data=await res.json();
    const textBlocks=(data.content||[]).filter(b=>b.type==="text");
    const toolUseBlocks=(data.content||[]).filter(b=>b.type==="tool_use");
    if(data.stop_reason==="end_turn"||toolUseBlocks.length===0){return{content:data.content,text:textBlocks.map(b=>b.text||"").join("")};}
    msgs.push({role:"assistant",content:data.content});
    const toolResults=toolUseBlocks.map(tu=>({type:"tool_result",tool_use_id:tu.id,content:tu.input?.query?`Search results for: ${tu.input.query} — completed`:"Search completed"}));
    msgs.push({role:"user",content:toolResults});
    if(onStatus)onStatus("Researching treaty rates…");
  }
  throw new Error("Max tool turns reached");
}

export default function App() {
  const [screen,setScreen]=useState("welcome");
  const [messages,setMessages]=useState([]);
  const [history,setHistory]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [loadingStatus,setLoadingStatus]=useState("Thinking…");
  const [solutions,setSolutions]=useState([]);
  const [activeSol,setActiveSol]=useState(0);

  // Intake form state
  const [lead,setLead]=useState({name:'',email:'',phone:'',country:''});
  const [leadErrors,setLeadErrors]=useState({});
  const [pendingQuery,setPendingQuery]=useState('');
  const systemPromptRef=useRef(SYSTEM_PROMPT);

  const chartRef=useRef(null);
  const messagesEndRef=useRef(null);

  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);
  useEffect(()=>{if(solutions.length>0&&chartRef.current)setTimeout(()=>chartRef.current.scrollIntoView({behavior:"smooth",block:"start"}),200);},[solutions.length]);

  const dispatch=useCallback(async(text)=>{
    const userMsg={role:"user",content:text};
    const newHistory=[...history,userMsg];
    setHistory(newHistory);
    setMessages(prev=>[...prev,{role:"user",text}]);
    setLoading(true);
    setLoadingStatus("Thinking…");
    try{
      const{content,text:full}=await callWithTools(newHistory,(s)=>setLoadingStatus(s),systemPromptRef.current);
      let parsed=null;
      const jm=full.match(/```json\s*([\s\S]*?)```/);
      if(jm){try{parsed=JSON.parse(jm[1].trim());}catch(e){const obj=jm[1].trim().match(/\{[\s\S]*\}/);if(obj)try{parsed=JSON.parse(obj[0]);}catch(e2){}}}
      const display=full.replace(/```json[\s\S]*?```/g,"").replace(/```[\s\S]*?```/g,"").trim();
      setHistory(prev=>[...prev,{role:"assistant",content}]);
      setMessages(prev=>[...prev,{role:"ai",text:display||"Here are my recommendations."}]);
      if(parsed?.ready&&Array.isArray(parsed?.solutions)&&parsed.solutions.length>0){setSolutions(parsed.solutions);setActiveSol(0);}
    }catch(e){setMessages(prev=>[...prev,{role:"ai",text:`Error: ${e.message}. Please try again.`}]);}
    setLoading(false);
  },[history]);

  // Validate intake form and start the conversation
  function submitIntake(){
    const errors={};
    if(!lead.name.trim())errors.name='Required';
    if(!lead.email.trim()||!/\S+@\S+\.\S+/.test(lead.email))errors.email='Valid email required';
    if(!lead.country.trim())errors.country='Required';
    if(Object.keys(errors).length){setLeadErrors(errors);return;}
    setLeadErrors({});
    // Inject user context into system prompt so AI greets them by name and skips asking for country
    systemPromptRef.current=SYSTEM_PROMPT+`\n\nUSER CONTEXT:\nName: ${lead.name}\nEmail: ${lead.email}\nCountry of Residence: ${lead.country}${lead.phone?`\nPhone: ${lead.phone}`:''}\n\nAddress the user by their first name in your opening. You already know their country of residence — do not ask for it again.`;
    setScreen('chat');
    dispatch(pendingQuery);
  }

  const send=useCallback(()=>{
    const t=input.trim();
    if(!t||loading)return;
    setInput("");
    if(screen==="welcome"){
      setPendingQuery(t);
      setScreen("intake");
    } else {
      dispatch(t);
    }
  },[input,loading,screen,dispatch]);

  const handleKey=useCallback((e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}},[send]);

  const pickStarter=useCallback((i)=>{
    setPendingQuery(STARTER_PROMPTS[i]);
    setScreen("intake");
  },[]);

  const reset=useCallback(()=>{
    setScreen("welcome");
    setMessages([]);
    setHistory([]);
    setSolutions([]);
    setInput("");
    setActiveSol(0);
    setLead({name:'',email:'',phone:'',country:''});
    setLeadErrors({});
    setPendingQuery('');
    systemPromptRef.current=SYSTEM_PROMPT;
  },[]);

  const canSend=input.trim().length>0&&!loading;
  const sol=solutions[activeSol];
  const inputSx={flex:1,background:"#fff",border:"none",borderRadius:14,padding:"16px 20px",fontSize:15,fontFamily:"Inter,sans-serif",color:"#0d1b3e",outline:"none",boxShadow:"0 2px 10px rgba(0,0,0,0.07)",opacity:loading?0.7:1};
  const btnSx=(on)=>({width:44,height:44,borderRadius:12,border:"none",flexShrink:0,background:on?"#3b5bdb":"#c8d3e8",cursor:on?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.15s"});

  return(
    <div style={{fontFamily:"Inter,sans-serif",background:"#dce3ec",minHeight:"100vh",color:"#0d1b3e"}}>
      <div style={{display:"flex",justifyContent:"flex-end",padding:"14px 40px 6px"}}>
        <span style={{fontSize:13,fontWeight:500,cursor:"pointer"}}>English ↗</span>
      </div>
      <nav style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 40px 20px"}}>
        <img src="https://amicorp.com/wp-content/uploads/thegem/logos/logo_6c2ca70d8c35e30ed0f4be7ec2bfd9bb_1x.png" alt="Amicorp" style={{height:50}} onError={e=>e.target.style.display="none"}/>
        <div style={{display:"flex",flexDirection:"column",gap:5,cursor:"pointer"}}>{[0,1,2].map(i=><span key={i} style={{display:"block",width:24,height:2.5,background:"#0d1b3e",borderRadius:2}}/>)}</div>
      </nav>

      {/* ── WELCOME SCREEN ── */}
      {screen==="welcome"&&(
        <div style={{background:"#f0f4f8",borderRadius:24,margin:"0 28px 28px",padding:"48px 36px 36px",display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,border:"1.5px solid #3b5bdb",borderRadius:999,padding:"5px 18px",fontSize:13,fontWeight:500,color:"#3b5bdb",marginBottom:26}}>✦ AI-Powered Structure Assistant</div>
          <h1 style={{fontSize:36,fontWeight:700,textAlign:"center",letterSpacing:"-0.02em",marginBottom:16,lineHeight:1.15}}>Amicorp AI Welcome Hub</h1>
          <p style={{fontSize:15,color:"#4a5568",textAlign:"center",maxWidth:660,lineHeight:1.65,marginBottom:36}}>Need assistance in deciding how to structure your cross border investment, family wealth, or your investment fund? Our Amicorp Structuring Assistant will help you on your way.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,width:"100%",maxWidth:860,marginBottom:28}}>
            {STARTERS.map((s,i)=>(
              <div key={i} onClick={()=>pickStarter(i)}
                style={{background:"#fff",borderRadius:14,padding:"22px 24px",fontSize:14.5,color:"#0d1b3e",cursor:"pointer",border:"1.5px solid transparent",lineHeight:1.5,transition:"border-color 0.15s,box-shadow 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#3b5bdb";e.currentTarget.style.boxShadow="0 4px 16px rgba(59,91,219,0.10)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="transparent";e.currentTarget.style.boxShadow="none";}}>
                {s}
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",width:"100%",maxWidth:860}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} placeholder="Describe your business situation and what you need..." style={inputSx}/>
            <button onClick={send} style={btnSx(canSend)}><SendIcon/></button>
          </div>
        </div>
      )}

      {/* ── INTAKE SCREEN ── */}
      {screen==="intake"&&(
        <div style={{background:"#f0f4f8",borderRadius:24,margin:"0 28px 28px",padding:"48px 36px 36px",display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,border:"1.5px solid #3b5bdb",borderRadius:999,padding:"5px 18px",fontSize:13,fontWeight:500,color:"#3b5bdb",marginBottom:26}}>✦ Amicorp Structuring Assistant</div>
          <h1 style={{fontSize:28,fontWeight:700,textAlign:"center",letterSpacing:"-0.02em",marginBottom:12,lineHeight:1.2}}>Before we begin</h1>
          <p style={{fontSize:15,color:"#4a5568",textAlign:"center",maxWidth:480,lineHeight:1.65,marginBottom:36}}>Please share a few details so we can personalise your recommendations.</p>
          <div style={{width:"100%",maxWidth:480,display:"flex",flexDirection:"column",gap:18}}>
            {/* Full Name */}
            <div>
              <label style={{display:"block",fontSize:13,fontWeight:600,color:"#0d1b3e",marginBottom:6}}>Full Name <span style={{color:"#e53e3e"}}>*</span></label>
              <input type="text" placeholder="e.g. Sarah Johnson" value={lead.name}
                onChange={e=>setLead({...lead,name:e.target.value})}
                style={{width:"100%",background:"#fff",border:leadErrors.name?"1.5px solid #e53e3e":"1.5px solid #d1d9e6",borderRadius:12,padding:"13px 16px",fontSize:14,fontFamily:"Inter,sans-serif",color:"#0d1b3e",outline:"none",boxSizing:"border-box"}}/>
              {leadErrors.name&&<p style={{color:"#e53e3e",fontSize:12,marginTop:4,marginBottom:0}}>{leadErrors.name}</p>}
            </div>
            {/* Email */}
            <div>
              <label style={{display:"block",fontSize:13,fontWeight:600,color:"#0d1b3e",marginBottom:6}}>Email Address <span style={{color:"#e53e3e"}}>*</span></label>
              <input type="email" placeholder="e.g. sarah@company.com" value={lead.email}
                onChange={e=>setLead({...lead,email:e.target.value})}
                style={{width:"100%",background:"#fff",border:leadErrors.email?"1.5px solid #e53e3e":"1.5px solid #d1d9e6",borderRadius:12,padding:"13px 16px",fontSize:14,fontFamily:"Inter,sans-serif",color:"#0d1b3e",outline:"none",boxSizing:"border-box"}}/>
              {leadErrors.email&&<p style={{color:"#e53e3e",fontSize:12,marginTop:4,marginBottom:0}}>{leadErrors.email}</p>}
            </div>
            {/* Phone */}
            <div>
              <label style={{display:"block",fontSize:13,fontWeight:600,color:"#0d1b3e",marginBottom:6}}>Phone <span style={{color:"#9aa5b4",fontWeight:400}}>(optional)</span></label>
              <input type="tel" placeholder="e.g. +91 98765 43210" value={lead.phone}
                onChange={e=>setLead({...lead,phone:e.target.value})}
                style={{width:"100%",background:"#fff",border:"1.5px solid #d1d9e6",borderRadius:12,padding:"13px 16px",fontSize:14,fontFamily:"Inter,sans-serif",color:"#0d1b3e",outline:"none",boxSizing:"border-box"}}/>
            </div>
            {/* Country */}
            <div>
              <label style={{display:"block",fontSize:13,fontWeight:600,color:"#0d1b3e",marginBottom:6}}>Country of Residence <span style={{color:"#e53e3e"}}>*</span></label>
              <input type="text" placeholder="e.g. India" value={lead.country}
                onChange={e=>setLead({...lead,country:e.target.value})}
                onKeyDown={e=>{if(e.key==='Enter')submitIntake();}}
                style={{width:"100%",background:"#fff",border:leadErrors.country?"1.5px solid #e53e3e":"1.5px solid #d1d9e6",borderRadius:12,padding:"13px 16px",fontSize:14,fontFamily:"Inter,sans-serif",color:"#0d1b3e",outline:"none",boxSizing:"border-box"}}/>
              {leadErrors.country&&<p style={{color:"#e53e3e",fontSize:12,marginTop:4,marginBottom:0}}>{leadErrors.country}</p>}
            </div>
            {/* Submit */}
            <button onClick={submitIntake}
              style={{background:"#0d1b3e",color:"#fff",border:"none",borderRadius:12,padding:"15px 24px",fontSize:15,fontWeight:700,fontFamily:"Inter,sans-serif",cursor:"pointer",marginTop:4,transition:"background 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="#1a2f5e"}
              onMouseLeave={e=>e.currentTarget.style.background="#0d1b3e"}>
              Start Conversation →
            </button>
            <button onClick={()=>setScreen("welcome")}
              style={{background:"none",border:"none",color:"#9aa5b4",fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif",padding:"4px 0",textAlign:"center"}}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* ── CHAT SCREEN ── */}
      {screen==="chat"&&(
        <div style={{margin:"0 28px 28px"}}>
          <div className="chat-outer-row">

            {/* LEFT: chat panel */}
            <div className="chat-left-col">
              <div style={{background:"#f0f4f8",borderRadius:24,padding:"28px 32px 24px",display:"flex",flexDirection:"column",height:"100%"}}>

                {/* Header */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,paddingBottom:16,borderBottom:"1px solid #e2e8f0",flexShrink:0}}>
                  <div style={{width:34,height:34,borderRadius:10,background:"#0d1b3e",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",padding:5}}>
                    <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
                      <circle cx="30" cy="30" r="26" fill="none" stroke="white" strokeWidth="2.5"/>
                      <ellipse cx="30" cy="30" rx="26" ry="11" fill="none" stroke="white" strokeWidth="2"/>
                      <line x1="4" y1="30" x2="56" y2="30" stroke="white" strokeWidth="2"/>
                      <ellipse cx="30" cy="30" rx="13" ry="26" fill="none" stroke="white" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>Structuring Assistant</div>
                    <div style={{fontSize:11,color:"#9aa5b4",marginTop:1}}>Amicorp · AI-Powered</div>
                  </div>
                  <button onClick={reset} style={{marginLeft:"auto",fontSize:12,color:"#9aa5b4",background:"none",border:"1px solid #e2e8f0",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>← New</button>
                </div>

                {/* Messages */}
                <div className="messages-scroll" style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:14,marginBottom:20,minHeight:0}}>
                  {messages.map((m,i)=>(
                    <div key={i} style={{display:"flex",gap:10,flexDirection:m.role==="user"?"row-reverse":"row",alignItems:"flex-start"}}>
                      <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,background:m.role==="user"?"#3b5bdb":"#0d1b3e",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>
                        {m.role==="user"?"You":"AI"}
                      </div>
                      <div style={{maxWidth:"80%",background:m.role==="user"?"#0d1b3e":"#fff",color:m.role==="user"?"rgba(255,255,255,0.92)":"#0d1b3e",borderRadius:14,borderBottomRightRadius:m.role==="user"?4:14,borderBottomLeftRadius:m.role==="ai"?4:14,padding:"11px 15px",fontSize:13.5,lineHeight:1.65,border:m.role==="ai"?"1px solid #e2e8f0":"none"}}
                        dangerouslySetInnerHTML={{__html:renderMd(m.text)}}/>
                    </div>
                  ))}
                  {loading&&(
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <div style={{width:30,height:30,borderRadius:"50%",background:"#0d1b3e",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>AI</div>
                      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,borderBottomLeftRadius:4,padding:"12px 16px",display:"flex",alignItems:"center",gap:8}}>
                        <div style={{display:"flex",gap:4}}>{[0,0.18,0.36].map((d,i)=><span key={i} style={{width:6,height:6,borderRadius:"50%",background:"#9aa5b4",display:"inline-block",animation:`bounce 1.2s ${d}s infinite ease-in-out`}}/>)}</div>
                        <span style={{fontSize:12,color:"#9aa5b4"}}>{loadingStatus}</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef}/>
                </div>

                {/* Input */}
                <div style={{flexShrink:0}}>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} placeholder="Reply here…" disabled={loading} style={inputSx}/>
                    <button onClick={send} disabled={loading} style={btnSx(canSend)}><SendIcon/></button>
                  </div>
                  <p style={{fontSize:11,color:"#9aa5b4",textAlign:"center",marginTop:8,lineHeight:1.5}}>Illustrative only — not legal, tax or financial advice. Seek independent counsel.</p>
                </div>
              </div>
            </div>

            {/* RIGHT: chart panel */}
            <div className="chart-right-col">
              <div style={{background:"#f0f4f8",borderRadius:24,padding:"24px",height:"100%",display:"flex",flexDirection:"column"}}>

                {/* Chart header + tabs */}
                <div style={{flexShrink:0,marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:solutions.length>0?12:0}}>
                    <div>
                      <div style={{display:"inline-flex",alignItems:"center",gap:5,border:"1.5px solid #3b5bdb",borderRadius:999,padding:"3px 12px",fontSize:11,fontWeight:500,color:"#3b5bdb",marginBottom:4}}>✦ Structure</div>
                      <h3 style={{fontSize:15,fontWeight:700,color:"#0d1b3e",letterSpacing:"-0.01em"}}>
                        {solutions.length===0?"Awaiting recommendation…":solutions.length===1?"Your Structuring Solution":`${solutions.length} Options`}
                      </h3>
                    </div>
                    {solutions.length>1&&(
                      <div style={{display:"flex",gap:6}}>
                        {solutions.map((s,i)=>(
                          <button key={i} onClick={()=>setActiveSol(i)} style={{padding:"5px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",border:"1.5px solid",transition:"all 0.15s",borderColor:i===activeSol?"#0d1b3e":"#d1d9e6",background:i===activeSol?"#0d1b3e":"#fff",color:i===activeSol?"#fff":"#6b7280"}}>
                            {String.fromCharCode(65+i)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Chart body */}
                <div style={{flex:1,overflowY:"auto",minHeight:0}}>
                  {solutions.length===0?(
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",textAlign:"center",padding:"40px 20px",color:"#c8d3e8"}}>
                      <div style={{fontSize:40,marginBottom:14,opacity:0.5}}>🏛</div>
                      <p style={{fontSize:13,lineHeight:1.6,color:"#9aa5b4"}}>Your structure chart will appear here as the conversation progresses.</p>
                    </div>
                  ):(
                    sol&&(
                      <div>
                        <p style={{fontSize:12,color:"#4a5568",marginBottom:14,lineHeight:1.5,fontStyle:"italic"}}>{sol.summary}</p>

                        {/* SVG diagram */}
                        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"16px 10px",marginBottom:14}}>
                          <div dangerouslySetInnerHTML={{__html:buildSVG(sol)}}/>
                          <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #f0f4f8",display:"flex",flexWrap:"wrap",gap:"4px 14px",justifyContent:"center"}}>
                            {[["person","👤","Person"],["company","🏢","Company"],["trust","▲","Trust"],["foundation","◆","Foundation"],["partnership","⬭","LP / Compartment"]].map(([k,em,l])=>(
                              <span key={k} style={{fontSize:9,color:"#9aa5b4",display:"flex",alignItems:"center",gap:2}}>{em} {l}</span>
                            ))}
                            <span style={{fontSize:9,color:"#c8d3e8",display:"flex",alignItems:"center",gap:2}}>🏢 <em>Faded = existing</em></span>
                          </div>
                        </div>

                        {/* Entity cards */}
                        {(()=>{
                          const toSetup=(sol.entities||[]).filter(e=>e.shape!=="person"&&e.existing!==true&&findProduct(e.name));
                          const existingEnts=(sol.entities||[]).filter(e=>e.shape!=="person"&&e.existing===true);
                          return(
                            <>
                              {toSetup.length>0&&(
                                <>
                                  <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"#9aa5b4",marginBottom:8}}>Entities to Set Up</div>
                                  <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
                                    {toSetup.map((e,i)=>{
                                      const prod=findProduct(e.name);
                                      const isCompartment=prod?.compartment===true;
                                      const borderCol=isCompartment?"#0891b2":"#3b5bdb";
                                      const btnCol=isCompartment?"#0891b2":"#0d1b3e";
                                      const btnHover=isCompartment?"#0e7490":"#1a2f5e";
                                      return(
                                        <div key={i} style={{background:"#fff",border:`1.5px solid ${borderCol}`,borderRadius:12,padding:"11px 13px"}}>
                                          <div style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:6}}>
                                            <span style={{fontSize:15,flexShrink:0}}>{SHAPE_EMOJI[e.shape]||"🏢"}</span>
                                            <div style={{flex:1,minWidth:0}}>
                                              <div style={{fontWeight:700,fontSize:12,color:"#0d1b3e",lineHeight:1.3}}>{e.name}</div>
                                              <div style={{fontSize:9.5,color:"#9aa5b4",marginTop:1}}>{e.jurisdiction}{e.role?` · ${e.role}`:""}</div>
                                            </div>
                                            <div style={{display:"flex",flexDirection:"column",gap:2,alignItems:"flex-end",flexShrink:0}}>
                                              <span style={{fontSize:8.5,fontWeight:700,background:"#eff6ff",color:"#3b5bdb",borderRadius:4,padding:"1px 5px"}}>NEW</span>
                                              {isCompartment&&<span style={{fontSize:8.5,fontWeight:700,background:"#ecfeff",color:"#0891b2",borderRadius:4,padding:"1px 5px",whiteSpace:"nowrap"}}>COMPARTMENT</span>}
                                            </div>
                                          </div>
                                          {prod&&(
                                            <>
                                              <p style={{fontSize:11,color:"#4a5568",lineHeight:1.45,marginBottom:7}}>{prod.d}</p>
                                              {isCompartment&&(
                                                <div style={{background:"#ecfeff",border:"1px solid #a5f3fc",borderRadius:7,padding:"6px 9px",marginBottom:7}}>
                                                  <div style={{fontSize:10,fontWeight:700,color:"#0e7490",marginBottom:2}}>⚡ Faster to market</div>
                                                  <div style={{fontSize:9.5,color:"#164e63",lineHeight:1.45}}>The vehicle already exists — no separate incorporation or regulatory approval required. Managed by Amicorp's locally licensed investment manager.</div>
                                                </div>
                                              )}
                                              <div style={{display:"flex",gap:4,marginBottom:7,flexWrap:"wrap"}}>
                                                <div style={{background:"#f0f4f8",borderRadius:5,padding:"2px 8px",fontSize:10.5,color:"#374151"}}>⏱ <strong>{prod.t}</strong></div>
                                                <div style={{background:"#f0f4f8",borderRadius:5,padding:"2px 8px",fontSize:10.5,color:"#374151"}}>💰 <strong>{prod.f}</strong></div>
                                              </div>
                                            </>
                                          )}
                                          <a href="https://www.amicorp.com/uat" target="_blank" rel="noreferrer"
                                            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,background:btnCol,color:"#fff",borderRadius:7,padding:"7px 10px",fontSize:11,fontWeight:600,textDecoration:"none"}}
                                            onMouseEnter={el=>el.currentTarget.style.background=btnHover}
                                            onMouseLeave={el=>el.currentTarget.style.background=btnCol}>
                                            🛒 Add to Cart
                                          </a>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                              {existingEnts.length>0&&(
                                <div style={{marginBottom:10}}>
                                  <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"#c8d3e8",marginBottom:7}}>Existing Entities</div>
                                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                    {existingEnts.map((e,i)=>(
                                      <div key={i} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:9,padding:"8px 11px",display:"flex",alignItems:"center",gap:7,opacity:0.65}}>
                                        <span style={{fontSize:13}}>{SHAPE_EMOJI[e.shape]||"🏢"}</span>
                                        <div>
                                          <div style={{fontWeight:600,fontSize:11,color:"#0d1b3e"}}>{e.name}</div>
                                          <div style={{fontSize:9.5,color:"#9aa5b4"}}>{e.jurisdiction}{e.role?` · ${e.role}`:""}</div>
                                        </div>
                                        <span style={{marginLeft:"auto",fontSize:8.5,fontWeight:700,background:"#f0f4f8",color:"#9aa5b4",borderRadius:4,padding:"1px 5px"}}>EXISTING</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Request Consultation CTA */}
                              <div style={{background:"#f0f4f8",border:"1px solid #d1d9e6",borderRadius:10,padding:"12px",textAlign:"center"}}>
                                <button onClick={()=>{
                                  const subject=encodeURIComponent(`Structuring Enquiry – ${lead.name||'New Enquiry'}`);
                                  const solutionNames=solutions.map((s,i)=>`Option ${String.fromCharCode(65+i)}: `+(s.entities||[]).filter(e=>e.existing!==true&&e.shape!=="person").map(e=>e.name).join(" + ")).join("\n");
                                  const body=encodeURIComponent(`Dear Amicorp Team,\n\nI would like to request a consultation regarding the following structuring options:\n\n${solutionNames||'(see conversation)'}\n\nMy details:\nName: ${lead.name||'–'}\nEmail: ${lead.email||'–'}\nPhone: ${lead.phone||'–'}\nCountry of Residence: ${lead.country||'–'}\n\nPlease feel free to contact me to arrange a call.\n\nKind regards,\n${lead.name||''}`);
                                  window.open(`mailto:info@amicorp.com?subject=${subject}&body=${body}`);
                                }}
                                  style={{background:"#0d1b3e",color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",width:"100%",marginBottom:8,transition:"background 0.15s"}}
                                  onMouseEnter={e=>e.currentTarget.style.background="#1a2f5e"}
                                  onMouseLeave={e=>e.currentTarget.style.background="#0d1b3e"}>
                                  📧 Request a Consultation
                                </button>
                                <a href="https://www.amicorp.com/uat" target="_blank" rel="noreferrer"
                                  style={{fontSize:10.5,color:"#9aa5b4",textDecoration:"none"}}>amicorp.com/uat →</a>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box} input::placeholder{color:#9aa5b4}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#c8d3e8;border-radius:4px}
        ul{list-style:disc} li{margin-bottom:2px}

        .chat-outer-row {
          display: flex;
          gap: 20px;
          align-items: stretch;
          height: calc(100vh - 160px);
          min-height: 520px;
        }
        .chat-left-col {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .chat-left-col > div {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .chat-right-col {
          width: 400px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .chat-right-col > div {
          flex: 1;
          min-height: 0;
        }
        .messages-scroll {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }

        @media (max-width: 768px) {
          .chat-outer-row {
            flex-direction: column;
            height: auto;
            min-height: unset;
          }
          .chat-left-col { width: 100%; }
          .chat-left-col > div { height: auto; }
          .chat-right-col { width: 100%; height: auto; }
          .chat-right-col > div { height: auto; min-height: 300px; }
          .messages-scroll { max-height: 50vh; }
        }
      `}</style>
    </div>
  );
}
