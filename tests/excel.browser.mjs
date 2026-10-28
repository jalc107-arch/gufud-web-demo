import assert from "node:assert/strict";
import fs from "node:fs";
import {DOMParser} from "@xmldom/xmldom";
globalThis.DOMParser=DOMParser;
globalThis.window={};
const src=fs.readFileSync("app-web/gufud-excel.js","utf8");
await import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"));
const m=window.GUFUDExcelDemo;
assert(m&&typeof m.read==="function"&&typeof m.template==="function");
function file(blob,name="GUFUD_DEMO.xlsx"){return {name,size:blob.size,arrayBuffer:()=>blob.arrayBuffer()}}
const workbook=m.template("2026-10-28");
assert(workbook.size>1000 && workbook.size<500000);
const d=await m.read(file(workbook));
assert.equal(d.day,"2026-10-28");
assert.equal(d.demo_type,"SOLO_FICTICIO");
assert.equal(d.part.people.length,20);
assert.equal(d.summary.effective,20);
assert.equal(d.summary.available,17);
assert.equal(d.summary.novelties,3);
assert.equal(d.summary.points,6);
assert.deepEqual(d.part.logistics,{vehicles_total:8,vehicles_service:7,radios:6,pdas:3});
assert.equal(d.part.people.find(x=>x.id==="P001").point,"Punto Bravo");
assert.deepEqual(Object.keys(d.summary.schemes).sort(),["all","available","novelties"]);
const d2=await m.read(file(workbook,"demo.xlsm"));
assert.deepEqual(d2.part,d.part);
await assert.rejects(()=>m.read(file(workbook,"test.csv")),/xlsx|xlsm/);
await assert.rejects(()=>m.read({name:"test.xlsx",size:6*1024*1024,arrayBuffer:async()=>workbook.arrayBuffer()}),/grande/);
await assert.rejects(()=>m.read(file(m.template("2026-02-30"))),/Fecha de servicio inválida/);
const bytes=new Uint8Array(await workbook.arrayBuffer());
const match=new TextEncoder().encode("Funcionario de prueba 001");
let occurrence=-1;for(let i=0;i<bytes.length-match.length;i++){
 if(match.every((b,j)=>bytes[i+j]===b)){occurrence=i;break}
}
assert(occurrence!==-1,"Debe poder localizar el primer registro ficticio");
bytes.set(new TextEncoder().encode("Funcionario de prueba 999"),occurrence);
await assert.rejects(()=>m.read(file(new Blob([bytes]))),/Solo se permite el nombre sintético/);
console.log("PASS: .xlsx generado en navegador, lectura ZIP/XML, 20 fichas ficticias, 17 disponibles, 3 novedades, seis puntos, medios, .xlsm, fechas y rechazos.");
