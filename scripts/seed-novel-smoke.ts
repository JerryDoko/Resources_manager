import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import iconv from "iconv-lite";
import { getActiveProfileId } from "../src/lib/profiles";
import { getSqlite,closeDb } from "../src/lib/db";
import { importChapters } from "../src/lib/novel/repository";
async function main(){
  const root=process.env.RESOURCES_MANAGER_DATA;
  if(!root||!root.includes("novel-smoke"))throw new Error("Requires isolated RESOURCES_MANAGER_DATA containing novel-smoke");
  fs.mkdirSync(root,{recursive:true});const profile=getActiveProfileId();
  const managed=importChapters(profile,"test:smoke-managed","听书测试",[{title:"第一章",text:'他说：“你先回去，明天我们再谈。”\n夜色渐深，窗外的风轻轻掠过树梢。\n她说：“我会回来的，请你放心。”'},{title:"第二章",text:"第二章的第一段。\n故事还在继续。"}]);
  const dir=path.join(root,"fixtures");fs.mkdirSync(dir,{recursive:true});
  const text="第一章 测试\n他说：“你先回去，明天我们再谈。”\n第二段的文字，保留原本的标点。\n第二章 继续\n这是下一章。";
  fs.writeFileSync(path.join(dir,"编码测试.txt"),iconv.encode(text,"gb18030"));
  const zip=new JSZip();zip.file("mimetype","application/epub+zip");zip.file("META-INF/container.xml",'<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file("OEBPS/content.opf",'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>EPUB测试</dc:title></metadata><manifest><item id="c1" href="one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="two.xhtml" media-type="application/xhtml+xml"/><item id="img" href="pixel.png" media-type="image/png"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>');
  zip.file("OEBPS/one.xhtml",'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>图片章节</title></head><body><h1>图片章节</h1><p>他说：“你先回去，明天我们再谈。”</p><img src="pixel.png" width="120" height="120"/><p>图片下方的正文，继续阅读。</p></body></html>');
  zip.file("OEBPS/two.xhtml",'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>下一章</title></head><body><p>下一章的正文。</p></body></html>');
  zip.file("OEBPS/pixel.png",Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64"));
  fs.writeFileSync(path.join(dir,"EPUB测试.epub"),await zip.generateAsync({type:"nodebuffer"}));
  const drawing='0.25 0.55 0.5 rg 40 80 160 100 re f\nBT /F1 18 Tf 40 220 Td (PDF regression fixture) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf='%PDF-1.4\n';const offsets=[0];for(const [i,obj] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(path.join(dir,'PDF测试.pdf'),pdf);
  for(const type of ['photo','manga']){fs.mkdirSync(path.join(dir,type),{recursive:true});fs.writeFileSync(path.join(dir,type,`${type}.png`),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'));}
  fs.writeFileSync(path.join(dir,'video.webm'),Buffer.alloc(0));
  const db=getSqlite(),now=Date.now();
  for(const [id,title,file,type] of [["smoke-txt","编码测试","编码测试.txt","novel"],["smoke-epub","EPUB测试","EPUB测试.epub","novel"],["smoke-pdf","PDF测试","PDF测试.pdf","novel"],["smoke-photo","照片回归","photo/photo.png","photo"],["smoke-manga","漫画回归","manga/manga.png","manga"],["smoke-video","视频回归","video.webm","video"]]){
    db.prepare("INSERT OR IGNORE INTO series (id,title,media_type,item_count,created_at,updated_at) VALUES (?,?,?,1,?,?)").run(id,title,type,now,now);
    db.prepare("INSERT OR IGNORE INTO media_items (id,series_id,title,path,media_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(id,id,title,path.join(dir,file),type,now,now);
  }
  fs.writeFileSync(path.join(root,"smoke.json"),JSON.stringify({profile,managed}));console.log(JSON.stringify({profile,managed,root}));closeDb();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
