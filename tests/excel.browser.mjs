import assert from "node:assert/strict";
import fs from "node:fs";
import {DOMParser} from "@xmldom/xmldom";
import {deflateRawSync} from "node:zlib";
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
function compressXlsx(input){
  const buf=new Uint8Array(input),dv=new DataView(buf.buffer),u16=(i)=>dv.getUint16(i,true),u32=(i)=>dv.getUint32(i,true);
  const outputs=[],centers=[];let pos=0,offset=0;
  const write16=(d,i,v)=>d.setUint16(i,v,true),write32=(d,i,v)=>d.setUint32(i,v,true);
  while(pos+30<buf.length&&u32(pos)===0x04034b50){
    const nameLen=u16(pos+26),extraLen=u16(pos+28),len=u32(pos+18);
    const name=buf.subarray(pos+30,pos+30+nameLen);
    const data=buf.subarray(pos+30+nameLen+extraLen,pos+30+nameLen+extraLen+len);
    const zip=deflateRawSync(data);
    const head=new Uint8Array(30+name.length),d=new DataView(head.buffer);
    write32(d,0,0x04034b50);write16(d,4,20);write16(d,6,0x800);write16(d,8,8);write32(d,14,u32(pos+14));write32(d,18,zip.length);write32(d,22,len);write16(d,26,name.length);head.set(name,30);
    const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);
    write32(c,0,0x02014b50);write16(c,4,20);write16(c,6,20);write16(c,8,0x800);write16(c,10,8);write32(c,16,u32(pos+14));write32(c,20,zip.length);write32(c,24,len);write16(c,28,name.length);write32(c,42,offset);central.set(name,46);
    outputs.push(head,zip);centers.push(central);offset+=head.length+zip.length;
    pos+=30+nameLen+extraLen+len;
  }
  assert(centers.length>=6);
  const end=new Uint8Array(22),e=new DataView(end.buffer);
  write32(e,0,0x06054b50);write16(e,8,centers.length);write16(e,10,centers.length);write32(e,12,centers.reduce((n,x)=>n+x.length,0));write32(e,16,offset);
  return new Blob([...outputs,...centers,end]);
}
const deflated=compressXlsx(await workbook.arrayBuffer());
const compressedResult=await m.read(file(deflated,"externo.xlsx"));
assert.deepEqual(compressedResult.part,d.part,"Excel comprimido DEFLATE debe ser leído correctamente");

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
