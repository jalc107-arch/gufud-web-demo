import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash,randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";

// Simulate the existing main-branch D1 schema, not a newly-created database.
const sqlite=new DatabaseSync(":memory:");
for(const sql of [
  "CREATE TABLE gufud_sessions(token_hash TEXT PRIMARY KEY,role TEXT NOT NULL,expires INTEGER NOT NULL)",
  "CREATE TABLE gufud_attempts(ip_hash TEXT PRIMARY KEY,count INTEGER NOT NULL,window_ms INTEGER NOT NULL)",
  "CREATE TABLE gufud_revisions(day TEXT NOT NULL,rev INTEGER NOT NULL,payload TEXT NOT NULL,content_hash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(day,rev))",
  "CREATE TABLE gufud_published(day TEXT PRIMARY KEY,rev INTEGER NOT NULL,published_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE gufud_services(day TEXT NOT NULL,person_id TEXT NOT NULL,service TEXT NOT NULL,verified_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(day,person_id,service))",
  "CREATE TABLE gufud_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,day TEXT,rev INTEGER,at TEXT DEFAULT CURRENT_TIMESTAMP)"
])sqlite.exec(sql);

const hash=value=>createHash("sha256").update(value).digest("hex");
const day="2026-10-29";
const payload=JSON.stringify({people:[{id:"P001",rank:"CT",name:"Funcionario de prueba 001",point:"Punto Alfa",status:"Disponible"}],logistics:{vehicles_total:1,vehicles_service:1,radios:1,pdas:1},notes:"Datos sintéticos heredados"});
const token=randomUUID();
sqlite.prepare("INSERT INTO gufud_revisions(day,rev,payload,content_hash) VALUES(?,?,?,?)").run(day,4,payload,hash(payload));
sqlite.prepare("INSERT INTO gufud_published(day,rev) VALUES(?,?)").run(day,4);
sqlite.prepare("INSERT INTO gufud_services(day,person_id,service) VALUES(?,?,?)").run(day,"P001","Ministerio");
sqlite.prepare("INSERT INTO gufud_audit(action,day,rev) VALUES(?,?,?)").run("publish",day,4);
sqlite.prepare("INSERT INTO gufud_sessions(token_hash,role,expires) VALUES(?,?,?)").run(hash(token),"admin",Date.now()+3600000);

const db={prepare(sql){const stmt=sqlite.prepare(sql);const bind=(...values)=>({first:async()=>stmt.get(...values)??null,all:async()=>({results:stmt.all(...values)}),run:async()=>({meta:{changes:Number(stmt.run(...values).changes)}})});return {...bind(),bind}}};
const src=readFileSync(new URL("../functions/api/gufud.js",import.meta.url),"utf8");
const api=await import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"));
const request=new Request("https://gufud-web-demo.pages.dev/api/gufud?day="+day,{headers:{Cookie:"gufud_session="+token}});
const response=await api.onRequestGet({request,env:{GUFUD_DB:db}});
const result=await response.json();
assert.equal(response.status,200,"the existing legacy administrator should retain access");
assert.equal(result.draftRev,4);
assert.equal(result.publishedRev,4);
assert.equal(result.part.notes,"Datos sintéticos heredados");
assert.deepEqual(result.services.map(x=>x.service),["Ministerio"]);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM gufud_revisions").get().n,1,"old revisions must not be replaced or reseeded");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM gufud_audit").get().n,1,"old audit entries must remain");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM gufud_sessions").get().n,1,"old sessions must remain until voluntary cutover");
for(const table of ["gufud_users","gufud_invites","gufud_account_sessions","gufud_user_audit","gufud_auth_settings"]){
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?").get(table).n,1,"missing additive table "+table);
}
assert.equal(sqlite.prepare("SELECT value FROM gufud_auth_settings WHERE key='legacy_enabled'").get().value,"1");
console.log("PASS: simulated existing D1 schema migrated additively; legacy session, publication, audit and confirmed service preserved.");
