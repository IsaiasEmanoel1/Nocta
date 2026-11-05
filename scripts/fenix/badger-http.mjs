import https from 'node:https';import fs from 'node:fs/promises'
const data=JSON.parse(await fs.readFile('.cache/fenix-alternatives/sources.json','utf8'))
const rows=[]
for(const title of data.results){const badger=title.data?.streams?.find(s=>/badger/i.test(s.description??s.title??''));if(!badger)continue
let url=new URL(badger.url);const row={title:title.title,hops:[]}
for(let n=0;n<4;n++){
 if(url.protocol!=='https:'||!url.hostname.includes('.')||/^[\d.]+$|:|\.local$|\.internal$/.test(url.hostname)){row.blocked=true;break}
 const hop=await new Promise(resolve=>{const req=https.get(url,{headers:{Range:'bytes=0-4095'},timeout:20000},res=>{let chunks=[];let length=0;let finished=false;function done(){if(finished)return;finished=true;const b=Buffer.concat(chunks);resolve({status:res.statusCode,origin:url.origin,mime:res.headers['content-type'],cors:res.headers['access-control-allow-origin']??null,disposition:res.headers['content-disposition']?.replace(/filename=.*/, 'filename=<redacted>'),location:res.headers.location,signature:b.toString('ascii',0,12).replace(/[^\x20-\x7e]/g,'.')});res.destroy()};res.on('data',c=>{chunks.push(c.subarray(0,4096-length));length+=c.length;if(length>=4096)done()});res.on('end',done);res.on('error',done)});req.on('timeout',()=>req.destroy(Error('timeout')));req.on('error',e=>resolve({error:e.message,origin:url.origin}))})
 const location=hop.location;delete hop.location;row.hops.push(hop)
 if(!location||![301,302,303,307,308].includes(hop.status))break
 url=new URL(location,url)
}
rows.push(row);console.log(JSON.stringify(row))}
await fs.writeFile('.cache/fenix-alternatives/badger-http.json',JSON.stringify(rows,null,2))
