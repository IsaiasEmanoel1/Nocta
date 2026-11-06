import {appendFileSync,existsSync,readFileSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {parseArgs} from 'node:util'
import {setMaxListeners} from 'node:events'
import {collectTitles,configuredManifests} from './tmdb.mjs'
import {additionalCoverage,checkPublicHost,classifyManifest,concurrency,createQueue,csv,fetchJson,manifestInputs,rankings,resumable,streamRequest,summarizeStreams} from './core.mjs'

const {values}=parseArgs({options:{
 titles:{type:'string',default:'20'},sources:{type:'string',default:'../fontes.txt'},out:{type:'string'},
 concurrency:{type:'string',default:'4'},rate:{type:'string',default:'10'},limits:{type:'string'},'ttl-hours':{type:'string',default:'24'},'budget-seconds':{type:'string'},'report-only':{type:'boolean'}
}})
function integer(value,min,max,name) {
 if(!/^\d+$/.test(String(value))||Number(value)<min||Number(value)>max)throw Error(`${name} deve estar entre ${min} e ${max}.`)
 return Number(value)
}
const total=integer(values.titles,1,100,'--titles')
const defaultRate=integer(values.rate,1,60,'--rate')
const ttl=integer(values['ttl-hours'],1,168,'--ttl-hours')*3600000
const gate=concurrency(integer(values.concurrency,1,6,'--concurrency'))
const folder=path.resolve(values.out??`reports/nocta-cobertura-${total}`)
const limits=values.limits?JSON.parse(await fs.readFile(values.limits,'utf8')):{}
if(!limits||Array.isArray(limits)||typeof limits!=='object')throw Error('--limits espera um objeto JSON de host para requisições por minuto.')
for(const value of Object.values(limits))integer(value,1,60,'Limite por host')

const configured=await configuredManifests()
const {entries,invalid}=manifestInputs([await fs.readFile(values.sources,'utf8'),...configured.map(item=>item.manifestUrl)].join('\n'))
const baseline=manifestInputs(configured.filter(item=>['fenixflix','brazuca'].includes(item.id)).map(item=>item.manifestUrl).join('\n')).entries.map(input=>input.key)
if(!entries.length)throw Error('Informe pelo menos uma URL HTTPS pública em --sources.')
await fs.mkdir(folder,{recursive:true})
const sampleFile=path.join(folder,'sample.json')
const journal=path.join(folder,'progress.jsonl')
const controller=new AbortController()
const signal=controller.signal
// A paused queue owns one cancellation listener until its next request.
setMaxListeners(entries.length+10,signal)
const cancel=()=>controller.abort()
const budget=values['budget-seconds']?setTimeout(cancel,integer(values['budget-seconds'],1,7200,'--budget-seconds')*1000):undefined
process.on('SIGINT',cancel)
process.on('SIGTERM',cancel)
const activeKeys=new Set(entries.map(input=>input.key))
const providers=new Map(),rows=new Map()
const hostCooldown=new Map(),lastRequest=new Map(),hosts=new Map()
const rowKey=(provider,title)=>provider+':'+title.type+':'+title.tmdb

function restore() {
 if(!existsSync(journal))return
 for(const line of readFileSync(journal,'utf8').split('\n')){
  if(!line.trim())continue
  try {
   const entry=JSON.parse(line)
   const row=entry.value
   if(entry.kind==='provider'&&activeKeys.has(row.key))providers.set(row.key,row)
   if(entry.kind==='row'&&activeKeys.has(row.provider))rows.set(rowKey(row.provider,row),row)
   if(row.retryAt&&row.host)hostCooldown.set(row.host,Math.max(hostCooldown.get(row.host)??0,row.retryAt))
   if(row.requests>0&&row.host)lastRequest.set(row.host,Math.max(lastRequest.get(row.host)??0,row.at))
  }catch{ /* Ignore an incomplete final write. */ }
 }
 if(!values['report-only'])appendFileSync(journal,'\n')
}
function save(kind,value) {
 const row={...value,at:Date.now()}
 appendFileSync(journal,JSON.stringify({kind,value:row})+'\n','utf8')
 if(kind==='provider')providers.set(row.key,row)
 if(kind==='row')rows.set(rowKey(row.provider,row),row)
 return row
}
async function sample() {
 if(existsSync(sampleFile)){
  const previous=JSON.parse(await fs.readFile(sampleFile,'utf8'))
  if(previous.titles?.length!==total)throw Error('A pasta já contém outra amostra. Informe um --out diferente.')
  return previous.titles
 }
 const titles=await collectTitles(total,signal)
 const temporary=sampleFile+'.tmp'
 await fs.writeFile(temporary,JSON.stringify({at:new Date().toISOString(),titles},null,2)+'\n')
 await fs.rename(temporary,sampleFile)
 return titles
}

async function get(input,queue,url) {
 return queue.request(()=>gate(async()=>{
  signal.throwIfAborted()
  if(!hosts.has(input.host))hosts.set(input.host,checkPublicHost(input.host).then(()=>true,()=>false))
  if(!await hosts.get(input.host))return {error:'dns-ou-origem-nao-publica'}
  if(input.host==='addon.vetela.cc')save('limite',{host:input.host,retryAt:Date.now()+6000})
  return fetchJson(url,signal)
 }),signal)
}
async function service(inputs,titles) {
 const host=inputs[0].host
 const configured=Math.min(Number(limits[host]??defaultRate),host==='addon.vetela.cc'?10:Infinity)
 let rate=Math.min(configured,...inputs.map(input=>providers.get(input.key)?.declaredRate??configured))
 const onCooldown=(retryAt,http)=>save('limite',{host,retryAt,http})
 let queue=createQueue(rate,{onCooldown})
 queue.defer(Math.max(hostCooldown.get(host)??0,(lastRequest.get(host)??0)+Math.ceil(60000/rate)))
 for(const input of inputs){
  signal.throwIfAborted()
  let provider=providers.get(input.key)
  if(!resumable(provider,Date.now(),ttl)){
   const response=await get(input,queue,input.url)
   provider=save('provider',{...classifyManifest(input,response),rate,rateLimited:response.rateLimited,retryAt:response.retryAt,requests:response.requests})
  }
  if(provider.declaredRate&&provider.declaredRate<rate){
   rate=provider.declaredRate
   queue=createQueue(rate,{onCooldown})
   queue.defer(Math.max(Date.now()+Math.ceil(60000/rate),provider.retryAt??0))
  }
  provider.rate=rate
  console.log(`${provider.name??provider.host} [${provider.key}] ${provider.status}, ${rate}/min`)
  if(provider.status!=='stremio')continue
  for(const title of titles){
   signal.throwIfAborted()
   const previous=rows.get(rowKey(input.key,title))
   if(resumable(previous,Date.now(),ttl))continue
   const route=streamRequest({...provider,url:input.url},title)
   const base={...title,provider:input.key,host,name:provider.name??provider.id}
   if(!route.url){
    save('row',{...base,status:route.reason,count:0,httpCount:0,webCount:0,nativeCount:0})
    continue
   }
   const response=await get(input,queue,route.url)
   const stats=response.status===200&&Array.isArray(response.data?.streams)?summarizeStreams(response.data.streams):undefined
   save('row',{...base,id:route.id,resourceType:route.type,ms:response.ms,http:response.requests?response.status:undefined,requests:response.requests,rateLimited:response.rateLimited,retryAt:response.retryAt,
    status:stats?(stats.count?'fontes':'vazio'):response.status===429?'rate-limit':response.error??(response.status===200?'resposta-invalida':'erro-http'),
    count:0,httpCount:0,webCount:0,nativeCount:0,...stats,playbackVerified:false})
  }
 }
}

function interleaveCategories(titles) {
 const categories=[...new Set(titles.map(title=>title.category))]
 const groups=categories.map(category=>titles.filter(title=>title.category===category))
 return Array.from({length:Math.max(0,...groups.map(group=>group.length))},(_,index)=>
  groups.flatMap(group=>group[index]?[group[index]]:[])).flat()
}

async function exportReports(titles) {
 const selected=new Set(titles.map(title=>title.type+':'+title.tmdb))
 const currentRows=[...rows.values()].filter(row=>selected.has(row.type+':'+row.tmdb))
 const ranking=rankings(currentRows)
 const providerRows=[...providers.values()].map(row=>{
  const queried=currentRows.filter(item=>item.provider===row.key)
  return {...row,consultas:queried.filter(item=>item.requests>0).length,observed429:queried.reduce((count,item)=>count+(item.rateLimited??0),row.rateLimited??0)}
 })
 const write=(name,columns,values)=>fs.writeFile(path.join(folder,name),csv(columns,values))
 await Promise.all([
  write('adicional.csv',['provider','nome','categoria','pares','com_fontes','adicionais','adicionais_android','ganho_android_potencial','base_ja_tem','base_inconclusiva'],additionalCoverage(currentRows,baseline)),
  write('fontes.csv',['provider','name','category','title','id','index','reference','protocol','format','container','codecs','androidState','reason','web','native','notWebReady','requiresHeaders','requestHeaders','responseHeaders','mediaStatus'],currentRows.flatMap(row=>(row.sources??[]).map(source=>({
   ...source,provider:row.provider,name:row.name,category:row.category,title:row.title,id:row.id,
   reference:source.reference??({torrent:'infoHash',externo:'externalUrl',youtube:'ytId',usenet:'nzbUrl'}[source.format]??(source.http?'url':undefined)),
   container:['mp4','webm','matroska'].includes(source.format)?source.format:undefined,
   androidState:source.androidState??(source.native?'suportado-em-potencial':'requer-revisao'),
   reason:source.reason??'captura-anterior-sem-metadados-por-fonte',
   codecs:source.codecs?.join(', '),requestHeaders:source.requestHeaders?.join(', '),responseHeaders:source.responseHeaders?.join(', '),mediaStatus:'nao-testado'
  })))),
  write('fornecedores.csv',['key','host','id','name','version','status','http','ms','rate','declaredRate','observed429','consultas','error'],providerRows),
  write('resultados.csv',['provider','providerId','name','category','title','year','tmdb','imdb','season','episode','episodeTmdb','id','resourceType','status','http','ms','requests','rateLimited','count','httpCount','webCount','nativeCount','formats','quality','languages','playbackVerified','checkedAt','retryAt'],currentRows.map(row=>({...row,
   providerId:providers.get(row.provider)?.id,
   checkedAt:new Date(row.at).toISOString(),
   formats:[...new Set(row.sources?.map(source=>source.format))].join(' | '),
   quality:[...new Set(row.sources?.flatMap(source=>source.quality))].join(' | '),
   languages:[...new Set(row.sources?.flatMap(source=>source.languages))].join(' | ')
  }))),
  write('ranking.csv',['ranking','posicao','provider','nome','elegiveis','respostas','com_fontes','com_android','cobertura_pct','android_pct','mediana_ms'],ranking)
 ])
 console.log(JSON.stringify({titulos:titles.length,manifestos:providerRows.length,pares:currentRows.length,linhasInvalidas:invalid,ranking:ranking.filter(row=>row.ranking==='total')}))
}

let titles=[]
try {
 restore()
 if(values['report-only']&&!existsSync(sampleFile))throw Error('A amostra precisa existir para exportar relatórios.')
 titles=await sample()
 if(!values['report-only']){
  const groups=Map.groupBy?Map.groupBy(entries,input=>input.host):entries.reduce((map,input)=>map.set(input.host,[...(map.get(input.host)??[]),input]),new Map())
  const ordered=interleaveCategories(titles)
  const outcomes=await Promise.allSettled([...groups.values()].map(inputs=>service(inputs,ordered)))
  if(!signal.aborted&&outcomes.some(result=>result.status==='rejected'))throw Error('Uma ou mais filas não terminaram. Os resultados parciais foram preservados.')
 }
}catch(error){
 if(!signal.aborted)throw error
}finally{
 await exportReports(titles)
 clearTimeout(budget)
 process.removeListener('SIGINT',cancel)
 process.removeListener('SIGTERM',cancel)
 if(signal.aborted)process.exitCode=130
}
