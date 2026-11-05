import https from 'node:https';import http from 'node:http';import fs from 'node:fs/promises'
const p=JSON.parse(await fs.readFile('.cache/fenix-alternatives/sources.json','utf8'));const s=p.results.flatMap(r=>r.data?.streams??[]).find(s=>/badger/i.test(s.description??s.title??''));let url=new URL(s.url)
for(let i=0;i<6;i++){
 if(!['fenixflix.fenixhub.online','dbonline.tech-cdn.top','zjo.lat','icy-meadow-dc81.8ee7klupb4z1.workers.dev'].includes(url.hostname)||url.username)break
 const r=await new Promise(resolve=>{const req=(url.protocol==='https:'?https:http).get(url,{headers:{Range:'bytes=0-4095'},timeout:15000},res=>{const head={status:res.statusCode,origin:url.origin,mime:res.headers['content-type'],cors:res.headers['access-control-allow-origin'],location:res.headers.location};let done=false;function finish(buffer){if(done)return;done=true;resolve({...head,signature:buffer?.toString('ascii',0,12).replace(/[^\x20-\x7e]/g,'.')});res.destroy()};res.once('data',finish);res.once('end',()=>finish())});req.on('timeout',()=>req.destroy(Error('timeout')));req.on('error',e=>resolve({error:e.message}))})
 const location=r.location;delete r.location;console.log(JSON.stringify(r));if(!location)break;url=new URL(location,url);console.log('redirect destination',url.origin)
}



