/* GUFUD DEMO Excel .xlsx reader.
 * Only the three-sheet synthetic template is accepted. Parsing runs locally in the browser.
 * No institutional records, names, identities or locations are transmitted.
 */
(() => {
  "use strict";
  const MAX_UPLOAD=5*1024*1024;
  const MAX_ENTRY=8*1024*1024;
  const MAX_TOTAL=16*1024*1024;
  const GRADES=["CR","TC","MY","CT","TE","ST","CM","SC","IJ","IT","SI","PT","PP","AXP"];
  const POINTS=["Punto Alfa","Punto Bravo","Punto Charlie","Punto Delta","Punto Eco","Apoyo administrativo",""];
  const STATES=["Disponible","PERMISO","VACACIONES","CITA MÉDICA"];
  function fail(message){throw new Error(message)}
  function children(el, tag){return Array.from(el?.childNodes||[]).filter(x=>x.nodeType===1&&x.localName===tag)}
  function descendants(el, tag){return Array.from(el?.getElementsByTagNameNS("*",tag)||[])}
  function parseXml(raw){
    const document=new DOMParser().parseFromString(raw,"application/xml");
    if(descendants(document,"parsererror").length)fail("El archivo contiene XML incorrecto.");
    return document;
  }
  function pathOf(input){
    const parts=[];
    for(const p of input.split("/")){
      if(p==="."||p==="")continue;
      if(p===".."){if(!parts.length)fail("Ruta interna inválida");parts.pop();}
      else parts.push(p);
    }
    return parts.join("/");
  }
  async function readZip(file){
    if(!file||!/\.xlsx$|\.xlsm$/i.test(file.name))fail("Seleccione un archivo .xlsx o .xlsm");
    if(file.size>MAX_UPLOAD)fail("Archivo demasiado grande para este piloto (máximo 5 MB).");
    if(typeof DecompressionStream!=="function")fail("Este navegador no admite lectura ZIP moderna. Actualice Edge o Safari.");
    const bytes=new Uint8Array(await file.arrayBuffer());
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const u16=p=>view.getUint16(p,true),u32=p=>view.getUint32(p,true);
    let end=-1;
    for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){
      if(u32(p)===0x06054b50){end=p;break;}
    }
    if(end<0)fail("No se reconoce un archivo Excel ZIP válido.");
    const count=u16(end+10),dirSize=u32(end+12),dirStart=u32(end+16);
    if(count>1000||dirSize>3*1024*1024||dirStart+dirSize>bytes.length)fail("Estructura ZIP fuera de los límites.");
    const entries=new Map();let p=dirStart, total=0;
    for(let i=0;i<count;i++){
      if(p+46>bytes.length||u32(p)!==0x02014b50)fail("Directorio ZIP inválido.");
      const flag=u16(p+8),method=u16(p+10),comp=u32(p+20),len=u32(p+24),n=u16(p+28),extra=u16(p+30),comment=u16(p+32),offset=u32(p+42);
      if(flag&1)fail("No se permiten archivos Excel cifrados.");
      if(method!==0&&method!==8)fail("Método de compresión Excel no admitido.");
      if(len>MAX_ENTRY||comp>MAX_UPLOAD||((total+=len)>MAX_TOTAL))fail("El Excel descomprimido supera los límites.");
      if(p+46+n+extra+comment>bytes.length)fail("Entrada ZIP incompleta.");
      const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+n));
      if(entries.has(name))fail("El ZIP contiene archivos duplicados.");
      entries.set(name,{offset,comp,len,method});
      p+=46+n+extra+comment;
    }
    async function read(name){
      const e=entries.get(name);if(!e)fail("Falta una hoja obligatoria: "+name);
      if(e.offset+30>bytes.length||u32(e.offset)!==0x04034b50)fail("Entrada ZIP dañada.");
      const start=e.offset+30+u16(e.offset+26)+u16(e.offset+28);
      if(start+e.comp>bytes.length)fail("Contenido ZIP incompleto.");
      const compressed=bytes.slice(start,start+e.comp);
      let data;
      if(e.method===0)data=compressed;
      else{
        const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        data=new Uint8Array(await new Response(stream).arrayBuffer());
      }
      if(data.length!==e.len||data.length>MAX_ENTRY)fail("La hoja descomprimida no coincide con su tamaño declarado.");
      return new TextDecoder().decode(data);
    }
    return {read,entries};
  }
  async function workbook(file){
    const zip=await readZip(file);
    const book=parseXml(await zip.read("xl/workbook.xml"));
    const rel=parseXml(await zip.read("xl/_rels/workbook.xml.rels"));
    const map=new Map(),targets=new Map();
    for(const x of descendants(rel,"Relationship"))targets.set(x.getAttribute("Id"),x.getAttribute("Target"));
    for(const el of descendants(book,"sheet")){
      const id=el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id")||el.getAttribute("r:id");
      let target=targets.get(id);
      if(target){
        if(target.startsWith("/"))target=target.slice(1);
        else target=pathOf("xl/"+target);
        map.set(el.getAttribute("name"),target);
      }
    }
    let shared=[];
    if(zip.entries.has("xl/sharedStrings.xml")){
      const xml=parseXml(await zip.read("xl/sharedStrings.xml"));
      shared=descendants(xml,"si").map(si=>descendants(si,"t").map(t=>t.textContent).join(""));
    }
    async function sheet(name){
      const filePath=map.get(name);if(!filePath)fail("No existe la hoja obligatoria «"+name+"»");
      const xml=parseXml(await zip.read(filePath));
      const rows=[];
      for(const row of descendants(xml,"row")){
        const cells={};
        for(const c of children(row,"c")){
          const col=(c.getAttribute("r")||"").match(/^[A-Z]+/)?.[0];
          if(!col)continue;
          const type=c.getAttribute("t");
          let v=children(c,"v")[0]?.textContent??"";
          if(type==="s"){v=shared[Number(v)]??"";}
          else if(type==="inlineStr"){v=descendants(c,"t").map(x=>x.textContent).join("");}
          else if(v!==""&&(!type||type==="n")){const n=Number(v);if(Number.isFinite(n))v=n;}
          cells[col]=v;
        }
        rows.push(cells);
      }
      return rows;
    }
    return {sheet};
  }
  function str(x){return String(x??"").trim();}
  function readDate(x){
    const v=str(x);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v))fail("La fecha debe estar en CONFIG como AAAA-MM-DD.");
    const d=new Date(v+"T12:00:00Z");
    if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==v)fail("Fecha de servicio inválida.");
    return v;
  }
  async function read(file){
    const wb=await workbook(file);
    const config=await wb.sheet("CONFIG");
    const opts=new Map(config.slice(1).map(r=>[str(r.A),str(r.B)]));
    const day=readDate(opts.get("FECHA_SERVICIO"));
    if(opts.get("TIPO")!=="SOLO_FICTICIO")fail("No se admite información real. El libro debe indicar TIPO = SOLO_FICTICIO.");
    const rows=await wb.sheet("GUFUD_DEMO");
    if(["ID","GRADO","NOMBRE","PUNTO","ESTADO"].some((v,i)=>str(rows[0]?.["ABCDE"[i]])!==v))
      fail("Las columnas de GUFUD_DEMO deben ser ID, GRADO, NOMBRE, PUNTO y ESTADO.");
    const people=[],seen=new Set();
    for(const r of rows.slice(1)){
      if(!Object.values(r).some(v=>str(v)))continue;
      const id=str(r.A),rank=str(r.B).toUpperCase(),name=str(r.C),point=str(r.D),status=str(r.E);
      if(!/^P\d{3}$/.test(id)||seen.has(id))fail("Los ID ficticios deben ser P001, P002… sin repetirse.");
      if(name!=="Funcionario de prueba "+id.slice(1))fail("Solo se permite el nombre sintético correspondiente al ID "+id+".");
      if(!GRADES.includes(rank)||!POINTS.includes(point)||!STATES.includes(status))fail("Grado, punto o novedad no admitidos para "+id+".");
      if(status==="Disponible"&&!point)fail("Al funcionario disponible "+id+" le falta punto de prueba.");
      people.push({id,rank,name,point:status==="Disponible"?point:"",status});seen.add(id);
    }
    if(people.length<1||people.length>60)fail("La plantilla debe contener entre 1 y 60 personas ficticias.");
    people.sort((a,b)=>GRADES.indexOf(a.rank)-GRADES.indexOf(b.rank)||a.id.localeCompare(b.id));
    const medios=await wb.sheet("MEDIOS_DEMO");
    const expected=["vehicles_total","vehicles_service","radios","pdas"];
    const vals=new Map(medios.slice(1).map(x=>[str(x.A),x.B]));
    const logistics={};
    for(const key of expected){
      const value=Number(vals.get(key));
      if(!vals.has(key)||str(vals.get(key))===""||!Number.isInteger(value)||value<0||value>100)fail("Medio ficticio incorrecto: "+key);
      logistics[key]=value;
    }
    if(logistics.vehicles_service>logistics.vehicles_total)fail("No puede haber más vehículos en servicio que registrados.");
    const available=people.filter(p=>p.status==="Disponible");
    const novelties=people.filter(p=>p.status!=="Disponible");
    const countGroup=a=>[0,1,2,3].map(n=>a.filter(p=>{const i=GRADES.indexOf(p.rank);const g=i<5?0:i<11?1:i<13?2:3;return g===n;}).length).join("-");
    return {day,demo_type:"SOLO_FICTICIO",part:{people,logistics},summary:{effective:people.length,available:available.length,novelties:novelties.length,points:new Set(available.map(x=>x.point)).size,schemes:{all:countGroup(people),available:countGroup(available),novelties:countGroup(novelties)}}};
  }

  const utf8 = new TextEncoder();
  function xmlEsc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));}
  function zipStore(files){
    // ZIP store format (no compression). No external CDN, no uploads.
    const output=[],central=[];let offset=0;
    const u16=(dv,i,n)=>dv.setUint16(i,n,true),u32=(dv,i,n)=>dv.setUint32(i,n>>>0,true);
    function crc32(a){
      let crc=0xffffffff;
      for(let i=0;i<a.length;i++){crc^=a[i];for(let b=0;b<8;b++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1}
      return (crc^0xffffffff)>>>0;
    }
    for(const [name,content] of files){
      const nb=utf8.encode(name),db=utf8.encode(content),crc=crc32(db);
      const local=new Uint8Array(30+nb.length),lv=new DataView(local.buffer);
      u32(lv,0,0x04034b50);u16(lv,4,20);u16(lv,6,0x800);u16(lv,8,0);
      u32(lv,14,crc);u32(lv,18,db.length);u32(lv,22,db.length);u16(lv,26,nb.length);local.set(nb,30);
      const hdr=new Uint8Array(46+nb.length),hv=new DataView(hdr.buffer);
      u32(hv,0,0x02014b50);u16(hv,4,20);u16(hv,6,20);u16(hv,8,0x800);u16(hv,10,0);
      u32(hv,16,crc);u32(hv,20,db.length);u32(hv,24,db.length);u16(hv,28,nb.length);u32(hv,42,offset);hdr.set(nb,46);
      output.push(local,db);central.push(hdr);offset+=local.length+db.length;
    }
    const directorySize=central.reduce((a,p)=>a+p.length,0);
    const end=new Uint8Array(22),ev=new DataView(end.buffer);
    u32(ev,0,0x06054b50);u16(ev,8,central.length);u16(ev,10,central.length);u32(ev,12,directorySize);u32(ev,16,offset);
    return new Blob([...output,...central,end],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  }
  function template(day){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))fail("Fecha de plantilla incorrecta.");
    const cell=(col,row,value)=>{
      const r=col+row;
      return typeof value==="number"?'<c r="'+r+'"><v>'+value+'</v></c>':'<c r="'+r+'" t="inlineStr"><is><t>'+xmlEsc(value)+'</t></is></c>';
    };
    const sheet=rows=>'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows.map((r,i)=>'<row r="'+(i+1)+'">'+r.map((v,j)=>cell(String.fromCharCode(65+j),i+1,v)).join('')+'</row>').join('')+'</sheetData></worksheet>';
    const ranks=["CT","TE","IJ","IT","SI","SI","PT","PT","PT","PT","PT","PP","PP","PP","PP","PP","AXP","AXP","AXP","AXP"];
    const people=[["ID","GRADO","NOMBRE","PUNTO","ESTADO"]];
    for(let i=1;i<=20;i++){
      let point=i<=17?POINTS[(i-1)%6]:"";
      if(i===1)point="Punto Bravo"; // Demonstrate a difference from the default seed.
      people.push(["P"+String(i).padStart(3,"0"),ranks[i-1],"Funcionario de prueba "+String(i).padStart(3,"0"),point,i<=17?"Disponible":["PERMISO","VACACIONES","CITA MÉDICA"][i-18]]);
    }
    const work='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+["GUFUD_DEMO","MEDIOS_DEMO","CONFIG"].map((n,i)=>'<sheet name="'+n+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>';
    const rels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+[1,2,3].map(i=>'<Relationship Id="rId'+i+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+i+'.xml"/>').join('')+'</Relationships>';
    const rootRel='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const types='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+[1,2,3].map(i=>'<Override PartName="/xl/worksheets/sheet'+i+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
    return zipStore([
      ["[Content_Types].xml",types],["_rels/.rels",rootRel],["xl/workbook.xml",work],["xl/_rels/workbook.xml.rels",rels],
      ["xl/worksheets/sheet1.xml",sheet(people)],
      ["xl/worksheets/sheet2.xml",sheet([["CONCEPTO","CANTIDAD"],["vehicles_total",8],["vehicles_service",7],["radios",6],["pdas",3]])],
      ["xl/worksheets/sheet3.xml",sheet([["CAMPO","VALOR"],["FECHA_SERVICIO",day],["TIPO","SOLO_FICTICIO"]])]
    ]);
  }
  function downloadTemplate(day){
    const url=URL.createObjectURL(template(day));
    const a=document.createElement("a");a.href=url;a.download="GUFUD_DEMO_"+day+".xlsx";a.style.display="none";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  window.GUFUDExcelDemo={read,template,downloadTemplate};
})();
