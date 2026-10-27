// GUFUD WEB - Cloudflare Pages Function, demonstration only.
// D1 binding required: GUFUD_DB. No real operational information is accepted.
const ADMIN_HASH = "70c77f7d9127cdbd07b34ed2d69cd6d158aee0e334863c9e1caf5360d72b3337";
const J1_HASH = "f32cf445a303965db6a956ce2f598e4eab66a23f30dbe5fb86ba09b6a9d592de";
const POINTS = ["Punto Alfa","Punto Bravo","Punto Charlie","Punto Delta","Punto Eco","Apoyo administrativo",""];
const STATES = ["Disponible","PERMISO","VACACIONES","CITA MÉDICA"];
const HASH = async s => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");
function answer(value,status=200,cookie=null) {
  const h={"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
  if(cookie)h["Set-Cookie"]=cookie;
  return new Response(JSON.stringify(value),{status,headers:h});
}
const validDay = d=>typeof d==="string" && /^20[2-9]\d-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(d) && new Date(d+"T12:00:00Z").toISOString().slice(0,10)===d;
function synthetic(){
  const ranks=["CT","TE","IJ","IT","SI","SI","PT","PT","PT","PT","PT","PP","PP","PP","PP","PP","AXP","AXP","AXP","AXP"];
  const points=POINTS.slice(0,6);
  const people=ranks.map((rank,i)=>({id:"P"+String(i+1).padStart(3,"0"),rank,name:"Funcionario de prueba "+String(i+1).padStart(3,"0"),point:i<17?points[i%6]:"",status:i<17?"Disponible":STATES[i-17]}));
  return JSON.stringify({people,logistics:{vehicles_total:8,vehicles_service:7,radios:6,pdas:3},notes:"Programación de prueba, no acredita prestación de servicio"});
}
async function ready(db){
  try {await db.prepare("SELECT rev FROM gufud_revisions LIMIT 1").first();return;}
  catch(_) { /* Initial D1 schema bootstrap, only synthetic data. */ }
  const statements=[
    "CREATE TABLE IF NOT EXISTS gufud_sessions(token_hash TEXT PRIMARY KEY,role TEXT NOT NULL,expires INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS gufud_attempts(ip_hash TEXT PRIMARY KEY,count INTEGER NOT NULL,window_ms INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS gufud_revisions(day TEXT NOT NULL,rev INTEGER NOT NULL,payload TEXT NOT NULL,content_hash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(day,rev))",
    "CREATE TABLE IF NOT EXISTS gufud_published(day TEXT PRIMARY KEY,rev INTEGER NOT NULL,published_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS gufud_services(day TEXT NOT NULL,person_id TEXT NOT NULL,service TEXT NOT NULL,verified_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(day,person_id,service))",
    "CREATE TABLE IF NOT EXISTS gufud_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,day TEXT,rev INTEGER,at TEXT DEFAULT CURRENT_TIMESTAMP)"
  ];
  for(const sql of statements)await db.prepare(sql).run();
  const payload=synthetic(),fingerprint=await HASH(payload);
  for(const day of ["2026-10-26","2026-10-27"]){
    await db.prepare("INSERT OR IGNORE INTO gufud_revisions(day,rev,payload,content_hash) VALUES(?,1,?,?)").bind(day,payload,fingerprint).run();
    await db.prepare("INSERT OR IGNORE INTO gufud_published(day,rev) VALUES(?,1)").bind(day).run();
  }
}
async function currentSession(req,db){
  const hit=(req.headers.get("Cookie")||"").split(";").map(s=>s.trim()).find(s=>s.startsWith("gufud_session="));
  const cookie=hit?.slice("gufud_session=".length)||"";
  if(!/^[a-f0-9-]{36,80}$/.test(cookie))return null;
  const h=await HASH(cookie);
  const sess=await db.prepare("SELECT role,expires FROM gufud_sessions WHERE token_hash=?").bind(h).first();
  if(!sess||Number(sess.expires)<Date.now())return null;
  return {role:sess.role,hash:h};
}
async function getDay(db,day,role){
  const pub=await db.prepare("SELECT rev,published_at FROM gufud_published WHERE day=?").bind(day).first();
  const latest=await db.prepare("SELECT rev FROM gufud_revisions WHERE day=? ORDER BY rev DESC LIMIT 1").bind(day).first();
  const viewedRev=role==="admin"?(latest?.rev||0):(pub?.rev||0);
  let part=null;
  if(viewedRev){
    const row=await db.prepare("SELECT payload FROM gufud_revisions WHERE day=? AND rev=?").bind(day,viewedRev).first();
    if(row)part=JSON.parse(row.payload);
  }
  const svc=await db.prepare("SELECT person_id,service,verified_at FROM gufud_services WHERE day=? ORDER BY person_id,service").bind(day).all();
  return {day,part,publishedRev:pub?.rev||0,draftRev:role==="admin"?(latest?.rev||0):undefined,viewedRev,services:svc.results||[],publishedAt:pub?.published_at||null};
}
export async function onRequestGet({request,env}){
  if(!env.GUFUD_DB)return answer({ok:false,error:"Base D1 no conectada: falta binding GUFUD_DB"},503);
  const db=env.GUFUD_DB;
  try{
    await ready(db);
    const sess=await currentSession(request,db);
    if(!sess)return answer({ok:false,error:"Se requiere iniciar sesión"},401);
    const url=new URL(request.url);
    const days=await db.prepare(sess.role==="admin"?"SELECT DISTINCT day FROM gufud_revisions ORDER BY day DESC LIMIT 60":"SELECT day FROM gufud_published ORDER BY day DESC LIMIT 60").all();
    const list=(days.results||[]).map(x=>x.day);
    const person=url.searchParams.get("person");
    if(person){
      if(!/^P\d{3}$/.test(person))return answer({ok:false,error:"Funcionario inválido"},400);
      const rows=await db.prepare("SELECT p.day,r.payload FROM gufud_published p JOIN gufud_revisions r ON r.day=p.day AND r.rev=p.rev ORDER BY p.day DESC LIMIT 60").all();
      const services=await db.prepare("SELECT day,service FROM gufud_services WHERE person_id=?").bind(person).all();
      const history=(rows.results||[]).map(row=>{
        const p=JSON.parse(row.payload).people.find(x=>x.id===person);
        return p?{day:row.day,point:p.point,status:p.status,services:(services.results||[]).filter(s=>s.day===row.day).map(s=>s.service)}:null;
      }).filter(Boolean);
      return answer({ok:true,history,role:sess.role});
    }
    const day=url.searchParams.get("day")||list[0]||"2026-10-27";
    if(!validDay(day))return answer({ok:false,error:"Fecha inválida"},400);
    return answer({ok:true,role:sess.role,days:list,...await getDay(db,day,sess.role)});
  }catch(e){console.error("GUFUD GET",e);return answer({ok:false,error:"Fallo al consultar la demostración"},503);}
}
export async function onRequestPost({request,env}){
  if(!env.GUFUD_DB)return answer({ok:false,error:"Base D1 no conectada: falta binding GUFUD_DB"},503);
  const db=env.GUFUD_DB;
  try{
    const origin=request.headers.get("Origin");
    if(origin && origin!==new URL(request.url).origin)return answer({ok:false,error:"Origen rechazado"},403);
    const raw=await request.text();
    if(raw.length>16000)return answer({ok:false,error:"Entrada demasiado grande"},413);
    let input;try{input=JSON.parse(raw);}catch(_){return answer({ok:false,error:"JSON inválido"},400);}
    if(!input||typeof input!=="object")return answer({ok:false,error:"Solicitud inválida"},400);
    await ready(db);
    if(input.action==="login"){
      const key=String(input.accessCode||"");
      if(key.length<20||key.length>100)return answer({ok:false,error:"Clave incorrecta"},401);
      const ipHash=await HASH(request.headers.get("CF-Connecting-IP")||"unknown");
      const now=Date.now();
      const prev=await db.prepare("SELECT count,window_ms FROM gufud_attempts WHERE ip_hash=?").bind(ipHash).first();
      if(prev&&prev.count>=7&&now-prev.window_ms<900000)return answer({ok:false,error:"Demasiados intentos. Regrese más tarde."},429);
      const hash=await HASH(key);
      const role=hash===ADMIN_HASH?"admin":hash===J1_HASH?"j1":null;
      if(!role){
        await db.prepare("INSERT INTO gufud_attempts(ip_hash,count,window_ms) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET count=CASE WHEN ?-window_ms>900000 THEN 1 ELSE count+1 END,window_ms=CASE WHEN ?-window_ms>900000 THEN excluded.window_ms ELSE window_ms END").bind(ipHash,now,now,now).run();
        return answer({ok:false,error:"Clave incorrecta"},401);
      }
      await db.prepare("DELETE FROM gufud_attempts WHERE ip_hash=?").bind(ipHash).run();
      const token=crypto.randomUUID()+crypto.randomUUID().replace(/-/g,"");
      await db.prepare("INSERT INTO gufud_sessions(token_hash,role,expires) VALUES(?,?,?)").bind(await HASH(token),role,now+86400000).run();
      return answer({ok:true,role},200,"gufud_session="+token+"; Max-Age=86400; HttpOnly; Secure; SameSite=Strict; Path=/");
    }
    const sess=await currentSession(request,db);
    if(input.action==="logout"){
      if(sess)await db.prepare("DELETE FROM gufud_sessions WHERE token_hash=?").bind(sess.hash).run();
      return answer({ok:true},200,"gufud_session=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/");
    }
    if(!sess)return answer({ok:false,error:"Se requiere iniciar sesión"},401);
    if(sess.role!=="admin")return answer({ok:false,error:"J1 tiene permisos de lectura únicamente"},403);
    const day=input.day;
    if(!validDay(day))return answer({ok:false,error:"Fecha de servicio inválida"},400);
    if(input.action==="newday"){
      const found=await db.prepare("SELECT rev FROM gufud_revisions WHERE day=? LIMIT 1").bind(day).first();
      if(found)return answer({ok:true,message:"La fecha ya existe, no se duplicó"});
      const last=await db.prepare("SELECT r.payload,r.content_hash FROM gufud_published p JOIN gufud_revisions r ON p.day=r.day AND p.rev=r.rev ORDER BY p.day DESC LIMIT 1").first();
      if(!last)return answer({ok:false,error:"Sin jornada de ejemplo para copiar"},404);
      await db.prepare("INSERT INTO gufud_revisions(day,rev,payload,content_hash) VALUES(?,1,?,?)").bind(day,last.payload,last.content_hash).run();
      await db.prepare("INSERT INTO gufud_audit(action,day,rev) VALUES(?,?,1)").bind("newday",day).run();
      return answer({ok:true,message:"Fecha creada como borrador, pendiente de publicar"});
    }
    const last=await db.prepare("SELECT rev,payload,content_hash FROM gufud_revisions WHERE day=? ORDER BY rev DESC LIMIT 1").bind(day).first();
    if(!last)return answer({ok:false,error:"La jornada no existe"},404);
    if(input.action==="draft"){
      if(!Array.isArray(input.edits)||input.edits.length>25)return answer({ok:false,error:"Cambios inválidos"},400);
      const next=JSON.parse(last.payload);
      for(const e of input.edits){
        if(!e||typeof e.id!=="string")return answer({ok:false,error:"Funcionario inválido"},400);
        const p=next.people.find(x=>x.id===e.id);
        if(!p)return answer({ok:false,error:"Funcionario desconocido"},400);
        if(e.status!==undefined){if(!STATES.includes(e.status))return answer({ok:false,error:"Novedad no permitida"},400);p.status=e.status;}
        if(e.point!==undefined){if(!POINTS.includes(e.point))return answer({ok:false,error:"Facción no permitida"},400);p.point=e.point;}
        if(p.status!=="Disponible")p.point="";
      }
      if(input.logistics!==undefined){
        const l=input.logistics;
        const k=["vehicles_total","vehicles_service","radios","pdas"];
        if(!l||typeof l!=="object"||k.some(key=>!Number.isInteger(l[key])||l[key]<0||l[key]>100)||l.vehicles_service>l.vehicles_total)return answer({ok:false,error:"Logística inválida"},400);
        next.logistics={vehicles_total:l.vehicles_total,vehicles_service:l.vehicles_service,radios:l.radios,pdas:l.pdas};
      }
      const payload=JSON.stringify(next),checksum=await HASH(payload);
      if(checksum===last.content_hash)return answer({ok:true,changed:false,message:"Sin cambios, no se creó duplicado"});
      const rev=last.rev+1;
      await db.prepare("INSERT INTO gufud_revisions(day,rev,payload,content_hash) VALUES(?,?,?,?)").bind(day,rev,payload,checksum).run();
      await db.prepare("INSERT INTO gufud_audit(action,day,rev) VALUES(?,?,?)").bind("draft",day,rev).run();
      return answer({ok:true,changed:true,rev,message:"Borrador guardado. J1 aún ve la versión anterior"});
    }
    if(input.action==="publish"){
      const current=await db.prepare("SELECT rev FROM gufud_published WHERE day=?").bind(day).first();
      if(current?.rev===last.rev)return answer({ok:true,changed:false,message:"Esta revisión ya estaba publicada"});
      await db.prepare("INSERT INTO gufud_published(day,rev,published_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(day) DO UPDATE SET rev=excluded.rev,published_at=CURRENT_TIMESTAMP").bind(day,last.rev).run();
      await db.prepare("INSERT INTO gufud_audit(action,day,rev) VALUES(?,?,?)").bind("publish",day,last.rev).run();
      return answer({ok:true,changed:true,rev:last.rev,message:"Publicado para J1 en todos sus dispositivos"});
    }
    if(input.action==="confirm"){
      const id=String(input.person_id||""),service=String(input.service||"");
      if(!["Ministerio","Aeropuerto","Otro servicio ficticio"].includes(service)||!JSON.parse(last.payload).people.some(p=>p.id===id))return answer({ok:false,error:"Servicio o persona inválidos"},400);
      const res=await db.prepare("INSERT OR IGNORE INTO gufud_services(day,person_id,service) VALUES(?,?,?)").bind(day,id,service).run();
      return answer({ok:true,changed:res.meta.changes>0,message:res.meta.changes>0?"Confirmación ficticia guardada":"Ese servicio ya estaba registrado"});
    }
    return answer({ok:false,error:"Acción no reconocida"},400);
  }catch(e){console.error("GUFUD POST",e);return answer({ok:false,error:"Fallo al procesar la solicitud"},503);}
}
