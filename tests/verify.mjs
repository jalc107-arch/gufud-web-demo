import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html=fs.readFileSync("app-web/index.html","utf8");
const worker=fs.readFileSync("functions/api/gufud.js","utf8");
const routes=JSON.parse(fs.readFileSync("app-web/_routes.json","utf8"));
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join("\n");
assert(script.length>1000,"El navegador debe tener lógica de aplicación");
new vm.Script(script,{filename:"gufud-inline.js"});
assert.equal(routes.version,1);
assert.deepEqual(routes.include,["/api/*"]);
assert.equal(routes.exclude.length,0);
for(const required of [
 "newday","draft","publish","confirm","logout","login",
 "credentials:'same-origin'","J1","Punto Alfa","Punto Bravo",
 "Sincronización de prueba"
]) assert(html.includes(required),"Falta: "+required);
for(const required of [
 "export async function onRequestGet","export async function onRequestPost",
 "GUFUD_DB","gufud_sessions","gufud_revisions","gufud_published",
 "gufud_services","gufud_audit","HttpOnly; Secure; SameSite=Strict",
 "role!==\"admin\"","INSERT OR IGNORE INTO gufud_services"
]) assert(worker.includes(required),"Falta: "+required);
assert(!html.includes("service_role"),"Nunca colocar service_role en navegador");
assert(!html.includes("Funcionarios reales"),"El piloto es exclusivamente ficticio");
assert(worker.includes('["PERMISO","VACACIONES","CITA MÉDICA"][i-17]'),"Tres novedades ficticias");
const groupR=/<button[^>]+data-tab="admin"/;
assert(groupR.test(html),"Botón Admin conectado");
for(const required of ["Comparar","Recuperar","Consultar sesiones","Cerrar sesiones J1","revisionCompare","expectedRev","adminHistory"])
  assert(html.includes(required),"Falta el control del panel: "+required);
for(const required of ['manage==="history"','manage==="compare"','manage==="sessions"','action==="restore"','action==="revoke_sessions"','expectedRev'])
  assert(worker.includes(required),"Falta seguridad/gestión en servidor: "+required);
assert(html.includes("current.role==='admin'&&tab==='admin'"),"No debe borrar el Excel seleccionado al refrescar Administrador");

for(const required of ["user-sign-in","user-activate","login_user","accept_invite","invite-token","invite-j1","invite-admin","legacy-switch","load-activity","load-accounts"])
 assert(html.includes(required),"La interfaz no tiene la opción individual: "+required);
for(const required of ["cutover-confirm","verifiedAdmins","verifiedJ1","adminPassword"])
 assert(html.includes(required),"Falta la confirmación de recuperación para retirar el acceso compartido: "+required);
for(const required of ["gufud_users","gufud_invites","gufud_account_sessions","gufud_user_audit","gufud_auth_settings","passwordHash","PBKDF2","equalHash","create_invite","accept_invite","set_account_active","legacy_access","login_user","manage===\"accounts\"","manage===\"activity\""])
 assert(worker.includes(required),"Falta gestión/autenticación: "+required);
assert(worker.includes("COUNT(DISTINCT u.id)"),"La migración requiere sesiones de usuarios distintos");
assert(worker.includes("legacy_enabled"),"Claves antiguas deben poder retirarse");
console.log("OK: HTML JS válido, API y rutas presentes, roles, publicaciones y datos ficticios.");
