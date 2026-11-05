import https from 'node:https'
import fs from 'node:fs/promises'
const manifestUrl=process.argv[2]||'https://fenixflix.fenixhub.online/qualities=4k,1080p,720p,sd%7Caudio=dublado,legendado%7Ccatalogs=populares_movie,populares_series,recentes_movie,recentes_series/manifest.json'
const manifest=new URL(manifestUrl)
if(manifest.origin!=='https://fenixflix.fenixhub.online'||!manifest.pathname.endsWith('/manifest.json')||manifest.search||manifest.hash||manifest.username)throw Error('Use manifesto do host FenixFlix informado, preservando a configuração no caminho.')
const base=manifestUrl.slice(0,-'manifest.json'.length)
async function get(relative){const url=new URL(relative,base);return new Promise(resolve=>{
 const req=https.get(url,{headers:{'Origin':'http://127.0.0.1:5176'},timeout:60000},res=>{let body='';res.on('data',chunk=>{if(body.length<2000000)body+=chunk});res.on('end',()=>{let data;try{data=JSON.parse(body)}catch{}resolve({path:url.pathname,status:res.statusCode,cors:res.headers['access-control-allow-origin']??null,type:res.headers['content-type'],redirect:res.headers.location?new URL(res.headers.location,url).origin:null,data})})});req.on('timeout',()=>req.destroy(Error('timeout')));req.on('error',e=>resolve({path:url.pathname,error:e.message}))
})}
const results=[];const m=await get('manifest.json');results.push(m);console.log('manifest',m.status,m.data?.id,m.data?.version)
if(m.status===200){
 for(const type of ['movie','series']){
  const spec=m.data.catalogs.find(c=>c.type===type);if(!spec)continue
  const c=await get(`catalog/${type}/${encodeURIComponent(spec.id)}.json`);results.push(c);console.log('catalog',type,c.status,c.data?.metas?.length)
  const meta=c.data?.metas?.find(item=>/^tt\d+$|^tmdb:\d+$/.test(item.id));if(!meta)continue
  const id=meta.id+(type==='series'?':1:1':'')
  const s=await get(`stream/${type}/${encodeURIComponent(id)}.json`);results.push(s)
  console.log('streams',type,id,s.status,s.data?.streams?.length)
  for(const stream of s.data?.streams??[]){let url;try{url=new URL(stream.url)}catch{}console.log(JSON.stringify({name:stream.name,description:stream.description??stream.title,origin:url?.origin,format:stream.externalUrl?'embed':stream.infoHash?'torrent':url?.pathname.match(/\.(mp4|webm|m3u8)$/i)?.[1]??'other',specialHeaders:!!stream.behaviorHints?.proxyHeaders}))}
 }
}
await fs.mkdir('.cache/fenix-configured',{recursive:true});await fs.writeFile('.cache/fenix-configured/probe.json',JSON.stringify({at:new Date().toISOString(),manifestUrl,results},null,2))

