// GUFUD WEB - Cloudflare Pages Function, demonstration only.
// D1 binding required: GUFUD_DB. No real operational information is accepted.
const ADMIN_HASH = "70c77f7d9127cdbd07b34ed2d69cd6d158aee0e334863c9e1caf5360d72b3337";
const J1_HASH = "f32cf445a303965db6a956ce2f598e4eab66a23f30dbe5fb86ba09b6a9d592de";
const POINTS = ["Punto Alfa","Punto Bravo","Punto Charlie","Punto Delta","Punto Eco","Apoyo administrativo",""];
const STATES = ["Disponible","PERMISO","VACACIONES","CITA MÉDICA"];
const HASH = async s => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");

const ID_PATTERN=/^demo_[a-z0-9_]{3,24}$/;
const tokenValue=()=>crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
const cookieFor=token=>"gufud_session="+token+"; Max-Age=86400; HttpOnly; Secure; SameSite=Strict; Path=/";
async function passwordHash(password,saltHex){
  const bytes=Uint8Array.from(saltHex.match(/../g),byte=>parseInt(byte,16));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const hash=await crypto.subtle.deriveBits({name:"PBKDF2",salt:bytes,iterations:210000,hash:"SHA-256"},key,256);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function equalHash(a,b){
  if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;
  let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;
}
async function authSchema(db){
  await db.prepare("CREATE TABLE IF NOT EXISTS gufud_users (id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,role TEXT NOT NULL CHECK(role IN ('admin','j1')),salt TEXT NOT NULL,password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS gufud_invites (token_hash TEXT PRIMARY KEY,role TEXT NOT NULL CHECK(role IN ('admin','j1')),expires INTEGER NOT NULL,used_at INTEGER,created_by TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS gufud_account_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL)").run();
}
async function failure(db,ipHash,now){
  await db.prepare("INSERT INTO gufud_attempts(ip_hash,count,window_ms) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET count=CASE WHEN ?-window_ms>900000 THEN 1 ELSE count+1 END,window_ms=CASE WHEN ?-window_ms>900000 THEN excluded.window_ms ELSE window_ms END").bind(ipHash,now,now,now).run();
}
async function blocked(db,ipHash,now){
  const prev=await db.prepare("SELECT count,window_ms FROM gufud_attempts WHERE ip_hash=?").bind(ipHash).first();
  return !!(prev&&prev.count>=7&&now-prev.window_ms<900000);
}
function accountPublic(row){return {id:row.id,username:row.username,role:row.role,active:!!row.active,createdAt:row.created_at};}

function answer(value,status=200,cookie=null) {
  const h={"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
  if(cookie)h["Set-Cookie"]=cookie;
  return new Response(JSON.stringify(value),{status,headers:h});
}
const validDay = d=>{if(typeof d!=="string"||!/^20[2-9]\d-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(d))return false;const t=new Date(d+"T12:00:00Z");return !Number.isNaN(t.getTime())&&t.toISOString().slice(0,10)===d;};
function synthetic(){
  const ranks=["CT","TE","IJ","IT","SI","SI","PT","PT","PT","PT","PT","PP","PP","PP","PP","PP","AXP","AXP","AXP","AXP"];
  const points=POINTS.slice(0,6);
  const people=ranks.map((rank,i)=>({id:"P"+String(i+1).padStart(3,"0"),rank,name:"Funcionario de prueba "+String(i+1).padStart(3,"0"),point:i<17?points[i%6]:"",status:i<17?"Disponible":["PERMISO","VACACIONES","CITA MÉDICA"][i-17]}));
  return JSON.stringify({people,logistics:{vehicles_total:8,vehicles_service:7,radios:6,pdas:3},notes:"Programación de prueba, no acredita prestación de servicio"});
}
async function ready(db){
  try {await db.prepare("SELECT rev FROM gufud_revisions LIMIT 1").first();await authSchema(db);return;}
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
  await authSchema(db);
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
  const user=await db.prepare("SELECT s.expires,u.id,u.username,u.role FROM gufud_account_sessions s JOIN gufud_users u ON s.user_id=u.id WHERE s.token_hash=? AND u.active=1").bind(h).first();
  if(user&&Number(user.expires)>=Date.now())return {role:user.role,hash:h,userId:user.id,username:user.username,legacy:false};
  const sess=await db.prepare("SELECT role,expires FROM gufud_sessions WHERE token_hash=?").bind(h).first();
  if(!sess||Number(sess.expires)<Date.now())return null;
  return {role:sess.role,hash:h,userId:null,username:null,legacy:true};
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
  // J1 never sees confirmations from an unpublished day. Administrator can review its drafts.
  const svc=(role==="j1" && !pub)?{results:[]}:await db.prepare("SELECT person_id,service,verified_at FROM gufud_services WHERE day=? ORDER BY person_id,service").bind(day).all();
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
    const manage=url.searchParams.get("manage");
    if(manage){
      if(sess.role!=="admin")return answer({ok:false,error:"Consulta reservada a Administrador"},403);
      if(manage==="sessions"){
        const legacy=await db.prepare("SELECT token_hash,role,expires FROM gufud_sessions WHERE expires>? ORDER BY expires DESC LIMIT 100").bind(Date.now()).all();
        const named=await db.prepare("SELECT s.token_hash,u.role,u.username,s.expires FROM gufud_account_sessions s JOIN gufud_users u ON s.user_id=u.id WHERE s.expires>? AND u.active=1 ORDER BY s.expires DESC LIMIT 100").bind(Date.now()).all();
        const sessions=[...(legacy.results||[]).map(x=>({id:x.token_hash.slice(0,16),role:x.role,expires:x.expires,current:x.token_hash===sess.hash,username:null,legacy:true})),...(named.results||[]).map(x=>({id:x.token_hash.slice(0,16),role:x.role,expires:x.expires,current:x.token_hash===sess.hash,username:x.username,legacy:false}))];
        return answer({ok:true,sessions});
      }
      if(manage==="compare"){
        const historyDay=url.searchParams.get("day");
        const fromRev=Number(url.searchParams.get("from"));
        const toRev=Number(url.searchParams.get("to"));
        if(!validDay(historyDay)||!Number.isInteger(fromRev)||!Number.isInteger(toRev)||fromRev<1||toRev<1)
          return answer({ok:false,error:"Seleccione dos revisiones válidas de la misma jornada"},400);
        const from=await db.prepare("SELECT payload FROM gufud_revisions WHERE day=? AND rev=?").bind(historyDay,fromRev).first();
        const to=await db.prepare("SELECT payload FROM gufud_revisions WHERE day=? AND rev=?").bind(historyDay,toRev).first();
        if(!from||!to)return answer({ok:false,error:"Las revisiones solicitadas no existen"},404);
        const a=JSON.parse(from.payload),b=JSON.parse(to.payload);
        const left=new Map((a.people||[]).map(p=>[p.id,p]));
        const right=new Map((b.people||[]).map(p=>[p.id,p]));
        const changes=[];
        for(const id of new Set([...left.keys(),...right.keys()])){
          const p=left.get(id),q=right.get(id);
          if(!p||!q||p.rank!==q.rank||p.point!==q.point||p.status!==q.status){
            changes.push({id,rank:q?.rank||p?.rank,name:q?.name||p?.name,
              before:p?{status:p.status,point:p.point,rank:p.rank}:null,
              after:q?{status:q.status,point:q.point,rank:q.rank}:null});
          }
        }
        const mediaChanges=[];
        for(const k of ["vehicles_total","vehicles_service","radios","pdas"]){
          if(a.logistics?.[k]!==b.logistics?.[k])mediaChanges.push({field:k,before:a.logistics?.[k],after:b.logistics?.[k]});
        }
        return answer({ok:true,day:historyDay,fromRev,toRev,peopleChanges:changes.slice(0,100),mediaChanges});
      }
      if(manage==="accounts"){
        const rows=await db.prepare("SELECT id,username,role,active,created_at FROM gufud_users ORDER BY created_at DESC LIMIT 100").all();
        return answer({ok:true,accounts:(rows.results||[]).map(accountPublic),session:{username:sess.username,legacy:sess.legacy}});
      }
      if(manage==="history"){
        const historyDay=url.searchParams.get("day");
        if(!validDay(historyDay))return answer({ok:false,error:"Fecha inválida"},400);
        const published=await db.prepare("SELECT rev,published_at FROM gufud_published WHERE day=?").bind(historyDay).first();
        const revisions=await db.prepare("SELECT rev,payload,created_at FROM gufud_revisions WHERE day=? ORDER BY rev DESC LIMIT 80").bind(historyDay).all();
        const changes=await db.prepare("SELECT action,rev,at FROM gufud_audit WHERE day=? ORDER BY id DESC LIMIT 80").bind(historyDay).all();
        const entries=(revisions.results||[]).map(row=>{
          const part=JSON.parse(row.payload),people=part.people||[];
          return {rev:row.rev,createdAt:row.created_at,published:row.rev===published?.rev,
            effective:people.length,available:people.filter(p=>p.status==="Disponible").length,
            novelties:people.filter(p=>p.status!=="Disponible").length,
            logistics:part.logistics||{}};
        });
        return answer({ok:true,day:historyDay,publishedRev:published?.rev||0,
          publishedAt:published?.published_at||null,revisions:entries,audit:changes.results||[]});
      }
      return answer({ok:false,error:"Consulta administrativa no reconocida"},400);
    }
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
    if(raw.length>32000)return answer({ok:false,error:"Entrada demasiado grande"},413);
    let input;try{input=JSON.parse(raw);}catch(_){return answer({ok:false,error:"JSON inválido"},400);}
    if(!input||typeof input!=="object")return answer({ok:false,error:"Solicitud inválida"},400);
    await ready(db);

    if(input.action==="accept_invite"){
      const invite=String(input.invite||"");
      const username=String(input.username||"").trim().toLowerCase();
      const password=String(input.password||"");
      if(!/^[a-f0-9]{64}$/.test(invite)||!ID_PATTERN.test(username)||password.length<14||password.length>128)
        return answer({ok:false,error:"Invitación, usuario o contraseña de prueba no válidos"},400);
      const now=Date.now(),hash=await HASH(invite);
      const row=await db.prepare("SELECT role,expires,used_at FROM gufud_invites WHERE token_hash=?").bind(hash).first();
      if(!row||row.used_at!==null||row.expires<now)return answer({ok:false,error:"Invitación inválida o vencida"},401);
      const dup=await db.prepare("SELECT id FROM gufud_users WHERE username=?").bind(username).first();
      if(dup)return answer({ok:false,error:"El usuario ya está registrado"},409);
      const salt=Array.from(crypto.getRandomValues(new Uint8Array(16))).map(n=>n.toString(16).padStart(2,"0")).join("");
      const digest=await passwordHash(password,salt);
      const marked=await db.prepare("UPDATE gufud_invites SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires>=?").bind(now,hash,now).run();
      if(Number(marked.meta?.changes||0)!==1)return answer({ok:false,error:"Esta invitación ya se utilizó"},409);
      const id=crypto.randomUUID();
      await db.prepare("INSERT INTO gufud_users(id,username,role,salt,password_hash,active) VALUES(?,?,?,?,?,1)").bind(id,username,row.role,salt,digest).run();
      await db.prepare("INSERT INTO gufud_audit(action,day,rev) VALUES(?,NULL,NULL)").bind("account_activated_"+row.role).run();
      return answer({ok:true,message:"Cuenta de prueba activada. Inicie sesión con su usuario."},201);
    }
    if(input.action==="login_user"){
      const username=String(input.username||"").trim().toLowerCase();
      const password=String(input.password||"");
      if(!ID_PATTERN.test(username)||password.length<1||password.length>128)return answer({ok:false,error:"Credenciales incorrectas"},401);
      const now=Date.now(),ipHash=await HASH(request.headers.get("CF-Connecting-IP")||"unknown");
      if(await blocked(db,ipHash,now))return answer({ok:false,error:"Demasiados intentos. Intente más tarde."},429);
      const row=await db.prepare("SELECT id,role,active,salt,password_hash FROM gufud_users WHERE username=?").bind(username).first();
      const salt=row?.salt||"00000000000000000000000000000000";
      const computed=await passwordHash(password,salt);
      if(!row||row.active!==1||!equalHash(computed,row.password_hash)){
        await failure(db,ipHash,now);
        return answer({ok:false,error:"Credenciales incorrectas"},401);
      }
      await db.prepare("DELETE FROM gufud_attempts WHERE ip_hash=?").bind(ipHash).run();
      const token=tokenValue();
      await db.prepare("INSERT INTO gufud_account_sessions(token_hash,user_id,expires) VALUES(?,?,?)").bind(await HASH(token),row.id,now+86400000).run();
      return answer({ok:true,role:row.role,username,legacy:false},200,cookieFor(token));
    }
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
      if(sess){
        if(sess.legacy)await db.prepare("DELETE FROM gufud_sessions WHERE token_hash=?").bind(sess.hash).run();
        else await db.prepare("DELETE FROM gufud_account_sessions WHERE token_hash=?").bind(sess.hash).run();
      }
      return answer({ok:true},200,"gufud_session=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/");
    }
    if(!sess)return answer({ok:false,error:"Se requiere iniciar sesión"},401);
    if(sess.role!=="admin")return answer({ok:false,error:"J1 tiene permisos de lectura únicamente"},403);

    if(input.action==="create_invite"){
      if(input.role!=="admin"&&input.role!=="j1")return answer({ok:false,error:"Rol de invitación inválido"},400);
      const token=tokenValue();
      const expires=Date.now()+60*60*1000; // 60 minutes, one use, disclosed only once.
      await db.prepare("INSERT INTO gufud_invites(token_hash,role,expires,used_at,created_by) VALUES(?,?,?,NULL,?)")
        .bind(await HASH(token),input.role,expires,sess.username||"admin_legacy_demo").run();
      await db.prepare("INSERT INTO gufud_audit(action,day,rev) VALUES(?,NULL,NULL)").bind("invite_created_"+input.role).run();
      return answer({ok:true,role:input.role,invite:token,expires,message:"Invitación de un solo uso (60 minutos). No compartirá datos reales."});
    }
    if(input.action==="set_account_active"){
      if(sess.legacy)return answer({ok:false,error:"Solo un administrador con cuenta individual puede desactivar cuentas"},403);
      const username=String(input.username||"");
      if(!ID_PATTERN.test(username)||typeof input.active!=="boolean")return answer({ok:false,error:"Solicitud de cuenta inválida"},400);
      const target=await db.prepare("SELECT id,role,active FROM gufud_users WHERE username=?").bind(username).first();
      if(!target)return answer({ok:false,error:"Cuenta no encontrada"},404);
      if(target.id===sess.userId&&!input.active)return answer({ok:false,error:"No puede desactivar su propia cuenta activa"},400);
      if(target.role==="admin"&&!input.active){
        const admins=await db.prepare("SELECT COUNT(*) AS n FROM gufud_users WHERE role='admin' AND active=1").first();
        if(Number(admins?.n||0)<=1)return answer({ok:false,error:"No se puede desactivar al último administrador individual"},409);
      }
      await db.prepare("UPDATE gufud_users SET active=? WHERE id=?").bind(input.active?1:0,target.id).run();
      if(!input.active)await db.prepare("DELETE FROM gufud_account_sessions WHERE user_id=?").bind(target.id).run();
      await db.prepare("INSERT INTO gufud_audit(action,day,rev) VALUES(?,NULL,NULL)").bind("account_"+(input.active?"reactivated_":"disabled_")+target.role).run();
      return answer({ok:true,username,active:input.active,message:"Estado de la cuenta de prueba actualizado."});
    }
    if(input.action==="revoke_sessions"){
      if(input.target!=="j1"&&input.target!=="all_other")
        return answer({ok:false,error:"Seleccione el tipo de sesiones que desea cerrar"},400);
      const query=input.target==="j1"?
        "DELETE FROM gufud_sessions WHERE role='j1'":
        "DELETE FROM gufud_sessions WHERE token_hash<>?";
      const result=input.target==="j1"?await db.prepare(query).run():await db.prepare(query).bind(sess.hash).run();
      const named=input.target==="j1"?
        await db.prepare("DELETE FROM gufud_account_sessions WHERE user_id IN (SELECT id FROM gufud_users WHERE role='j1')").run():
        (sess.legacy?await db.prepare("DELETE FROM gufud_account_sessions").run():await db.prepare("DELETE FROM gufud_account_sessions WHERE token_hash<>?").bind(sess.hash).run());
      await db.prepare("INSERT INTO gufud_audit(action,day,rev) VALUES(?,NULL,NULL)").bind(input.target==="j1"?"revoke_j1":"revoke_others").run();
      const closed=Number(result.meta?.changes||0)+Number(named.meta?.changes||0);
      return answer({ok:true,closed,message:"Sesiones de prueba cerradas: "+closed});
    }
    const day=input.day;
    if(input.action!=="revoke_sessions" && !validDay(day))return answer({ok:false,error:"Fecha de servicio inválida"},400);
    if(input.action==="restore"){
      if(input.demo_type!=="SOLO_FICTICIO"||!Number.isInteger(input.rev)||input.rev<1||!Number.isInteger(input.expectedRev))
        return answer({ok:false,error:"Solicitud de recuperación inválida"},400);
      const last=await db.prepare("SELECT rev,content_hash FROM gufud_revisions WHERE day=? ORDER BY rev DESC LIMIT 1").bind(day).first();
      if(!last)return answer({ok:false,error:"No existe la jornada indicada"},404);
      if(input.expectedRev!==last.rev)return answer({ok:false,error:"Otra sesión modificó el parte. Actualice y revise antes de recuperar."},409);
      const old=await db.prepare("SELECT payload,content_hash FROM gufud_revisions WHERE day=? AND rev=?").bind(day,input.rev).first();
      if(!old)return answer({ok:false,error:"La versión solicitada no existe"},404);
      if(old.content_hash===last.content_hash)
        return answer({ok:true,changed:false,message:"Esta versión ya coincide con el último borrador."});
      const newRev=last.rev+1;
      await db.prepare("INSERT INTO gufud_revisions(day,rev,payload,content_hash) VALUES(?,?,?,?)").bind(day,newRev,old.payload,old.content_hash).run();
      await db.prepare("INSERT INTO gufud_audit(action,day,rev) VALUES(?,?,?)").bind("restore_from_v"+input.rev,day,newRev).run();
      return answer({ok:true,changed:true,rev:newRev,message:"Recuperada v"+input.rev+" como nuevo BORRADOR v"+newRev+". J1 no cambia hasta publicar."});
    }
    if(input.expectedRev!==undefined && (!Number.isInteger(input.expectedRev)||input.expectedRev<0))
      return answer({ok:false,error:"Versión esperada inválida"},400);
    if(input.action==="import_demo"){
      // This endpoint deliberately accepts NO real names, identifiers or locations.
      // Only the rigid synthetic GUFUD demo workbook is supported.
      const rawPart=input.part;
      const ranks=["CR","TC","MY","CT","TE","ST","CM","SC","IJ","IT","SI","PT","PP","AXP"];
      if(input.demo_type!=="SOLO_FICTICIO"||!rawPart||typeof rawPart!=="object"||!Array.isArray(rawPart.people))
        return answer({ok:false,error:"Solo se admite la plantilla ficticia GUFUD_DEMO"},400);
      if(rawPart.people.length<1||rawPart.people.length>60)
        return answer({ok:false,error:"La plantilla admite entre 1 y 60 registros ficticios"},400);
      const ids=new Set();
      const clean=[];
      for(const p of rawPart.people){
        if(!p||typeof p!=="object"||typeof p.id!=="string"||!/^P\d{3}$/.test(p.id))return answer({ok:false,error:"ID ficticio inválido"},400);
        const nameExpected="Funcionario de prueba "+p.id.slice(1);
        if(p.name!==nameExpected||!ranks.includes(p.rank)||!STATES.includes(p.status)||!POINTS.includes(p.point)||ids.has(p.id))
          return answer({ok:false,error:"La importación contiene datos ajenos a la plantilla ficticia"},400);
        if(p.status==="Disponible"&&!p.point)
          return answer({ok:false,error:"Cada funcionario disponible debe tener una facción de prueba"},400);
        ids.add(p.id);
        clean.push({id:p.id,rank:p.rank,name:nameExpected,point:p.status==="Disponible"?p.point:"",status:p.status});
      }
      const l=rawPart.logistics;
      const lk=["vehicles_total","vehicles_service","radios","pdas"];
      if(!l||typeof l!=="object"||lk.some(k=>!Number.isInteger(l[k])||l[k]<0||l[k]>100)||l.vehicles_service>l.vehicles_total)
        return answer({ok:false,error:"Matriz de medios ficticios inválida"},400);
      clean.sort((a,b)=>ranks.indexOf(a.rank)-ranks.indexOf(b.rank)||a.id.localeCompare(b.id));
      const part={people:clean,logistics:{vehicles_total:l.vehicles_total,vehicles_service:l.vehicles_service,radios:l.radios,pdas:l.pdas},notes:"Parte de ejemplo. Importación ficticia de Excel, no acredita prestación del servicio."};
      const payload=JSON.stringify(part),fingerprint=await HASH(payload);
      const last=await db.prepare("SELECT rev,content_hash FROM gufud_revisions WHERE day=? ORDER BY rev DESC LIMIT 1").bind(day).first();
      if(input.expectedRev!==undefined && input.expectedRev!==(last?.rev||0))
        return answer({ok:false,error:"La fecha fue actualizada en otro dispositivo. Recargue y vuelva a revisar el Excel."},409);
      if(last?.content_hash===fingerprint)
        return answer({ok:true,changed:false,rev:last.rev,message:"La plantilla es idéntica; no se generó una revisión duplicada."});
      const rev=(last?.rev||0)+1;
      await db.prepare("INSERT INTO gufud_revisions(day,rev,payload,content_hash) VALUES(?,?,?,?)").bind(day,rev,payload,fingerprint).run();
      await db.prepare("INSERT INTO gufud_audit(action,day,rev) VALUES(?,?,?)").bind("import_demo",day,rev).run();
      return answer({ok:true,changed:true,rev,message:"Excel ficticio importado como borrador v"+rev+". J1 no lo verá hasta que pulse Publicar."});
    }
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
      if(input.expectedRev!==undefined && input.expectedRev!==last.rev)
        return answer({ok:false,error:"Existe una revisión más reciente. Actualice antes de guardar."},409);
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
      if(input.expectedRev!==undefined && input.expectedRev!==last.rev)
        return answer({ok:false,error:"El borrador cambió desde su última consulta. Recargue antes de publicar."},409);
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
