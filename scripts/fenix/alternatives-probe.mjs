import https from 'node:https';import fs from 'node:fs/promises'
const base='https://fenixflix.fenixhub.online/qualities=4k,1080p,720p,sd%7Caudio=dublado,legendado%7Ccatalogs=populares_movie,populares_series,recentes_movie,recentes_series/'
const titles=[['Black Clover','series','tt7441658:1:1'],['Os Simpsons','series','tt0096697:1:1'],['Barbie (2023)','movie','tt1517268'],['Apenas um Show','series','tt1710308:1:1'],['Dr. House','series','tt0412142:1:1']]
const results=[]
for(const [title,type,id] of titles){const row=await new Promise(resolve=>{const req=https.get(base+`stream/${type}/${encodeURIComponent(id)}.json`,{timeout:60000},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>{let data;try{data=JSON.parse(body)}catch{}resolve({title,type,id,status:res.statusCode,data})})});req.on('timeout',()=>req.destroy(Error('timeout')));req.on('error',e=>resolve({title,type,id,error:e.message}))});results.push(row)
console.log(title,row.status,row.data?.streams?.length)
for(const s of row.data?.streams??[]){let u;try{u=new URL(s.url)}catch{}console.log(JSON.stringify({name:s.name,title:s.description??s.title,origin:u?.origin,path:u?.pathname.slice(0,90),notWebReady:s.behaviorHints?.notWebReady,headers:Object.keys(s.behaviorHints?.proxyHeaders?.request??{}),keys:Object.keys(s)}))}}
await fs.mkdir('.cache/fenix-alternatives',{recursive:true});await fs.writeFile('.cache/fenix-alternatives/sources.json',JSON.stringify({at:new Date().toISOString(),base,results},null,2))
