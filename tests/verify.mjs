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
console.log("OK: HTML JS válido, API y rutas presentes, roles, publicaciones y datos ficticios.");
