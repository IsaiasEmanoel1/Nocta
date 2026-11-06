import {createHash} from 'node:crypto'
import {lookup} from 'node:dns/promises'
import {BlockList, isIP} from 'node:net'
import {setTimeout as sleep} from 'node:timers/promises'

export const quotas = {filmes:30, animacoes:20, series:15, desenhos:15, animes:10, novelas:10}
export function sampleQuotas(total) {
 const shares=Object.entries(quotas).map(([category,weight])=>({category,exact:total*weight/100,count:Math.floor(total*weight/100)}))
 const left=total-shares.reduce((sum,row)=>sum+row.count,0)
 const remainderOrder=[...shares].sort((a,b)=>(b.exact-b.count)-(a.exact-a.count))
 for(const row of remainderOrder.slice(0,left))row.count++
 return Object.fromEntries(shares.map(({category,count})=>[category,count]))
}
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,16)
const privateAddresses = new BlockList()
for(const [address,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',3]]) privateAddresses.addSubnet(address,bits)
for(const [address,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]]) privateAddresses.addSubnet(address,bits,'ipv6')

export function manifestInputs(text) {
 const entries=new Map()
 let invalid=0
 for(const line of text.split(/\r?\n/)){
  const value=line.trim()
  if(!value||value.startsWith('#'))continue
  try {
   const url=new URL(value.replace(/^stremio:\/\//i,'https://'))
   if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||
    isIP(url.hostname.replace(/^\[|\]$/g,''))||/\.(local|localhost|internal|test|invalid)\.?$/i.test(url.hostname))throw Error()
   url.hash=''
   if(url.pathname==='/')url.pathname='/manifest.json'
   entries.set(url.href,{key:hash(url.href),host:url.hostname,url})
  }catch{invalid++}
 }
 return {entries:[...entries.values()],invalid}
}

export async function checkPublicHost(host) {
 const addresses=await lookup(host,{all:true})
 if(!addresses.length||addresses.some(({address,family})=>privateAddresses.check(address,family===6?'ipv6':'ipv4')))throw Error('origem-nao-publica')
}

const strings = value => Array.isArray(value) && value.every(item=>typeof item==='string')
const identifier = /^[a-zA-Z0-9._-]{1,100}$/
function safeName(value) {
 return String(value??'').replace(/https?:\/\/\S+|stremio:\/\/\S+/gi,'').replace(/\b(?:token|api[_-]?key|secret|password|authorization)\s*[:=]\s*\S+/gi,'').replace(/[\r\n\t]+/g,' ').trim().slice(0,80)
}
export function classifyManifest(input,response) {
 const data=response.data
 const base={key:input.key,host:input.host,http:response.status,ms:response.ms}
 if(response.status!==200)return {...base,status:'indisponivel',error:response.error??'http'}
 if(!data||typeof data!=='object'){
  return {...base,status:response.html?'pagina-configuracao-ou-site':'resposta-invalida'}
 }
 const name=safeName(data.name)
 if(!identifier.test(data.id??'')||!strings(data.types)||!Array.isArray(data.resources)){
  const nuvio=/nuvio/i.test(name)||Array.isArray(data.plugins)&&data.plugins.some(plugin=>plugin?.scriptUrl)
  return {...base,name,status:nuvio?'nuvio':'outro-protocolo'}
 }
 const resources=data.resources.filter(r=>r==='stream'||r?.name==='stream')
  .map(r=>({types:strings(r.types)?r.types:data.types,prefixes:strings(r.idPrefixes)?r.idPrefixes:strings(data.idPrefixes)?data.idPrefixes:undefined}))
 const description=String(data.description??'')
 const rate=/\b(\d{1,4})\s*(?:requests?|req\.?|requisi(?:ç|c)[õo]es)\s*(?:\/|per\s+|por\s+)\s*(?:min(?:ute|uto)?s?)\b/i.exec(description)
 return {...base,id:data.id,name,version:identifier.test(data.version??'')?data.version:undefined,resources,
  declaredRate:rate&&Number(rate[1])>0?Number(rate[1]):undefined,
  status:data.behaviorHints?.configurationRequired===true?'requer-configuracao':resources.length?'stremio':'stremio-sem-stream'}
}

export function streamRequest(provider,title) {
 if(title.type==='series'&&(!Number.isSafeInteger(title.season)||title.season<1||!Number.isSafeInteger(title.episode)||title.episode<1))return {reason:'episodio-nao-confirmado'}
 const imdb=/^tt\d+$/.test(title.imdb??'')?title.imdb:undefined
 const tmdb=Number.isSafeInteger(title.tmdb)&&title.tmdb>0?`tmdb:${title.tmdb}`:undefined
 let compatibleType=false
 for(const type of title.category==='animes'?['series','anime']:[title.type]){
  for(const resource of provider.resources??[]){
   if(!resource.types.includes(type))continue
   compatibleType=true
   const prefixes=resource.prefixes
   const base=imdb&&(prefixes===undefined||prefixes.some(prefix=>imdb.startsWith(prefix)))&&(type!=='anime'||prefixes?.some(prefix=>imdb.startsWith(prefix)))?imdb
    :tmdb&&prefixes?.includes('tmdb:')?tmdb:undefined
   if(base){
    const id=type==='movie'?base:`${base}:${title.season}:${title.episode}`
    const url=new URL(provider.url)
    if(!url.pathname.endsWith('/manifest.json'))return {reason:'base-do-recurso-nao-verificada'}
    url.pathname=url.pathname.replace(/manifest\.json$/,`stream/${type}/${encodeURIComponent(id)}.json`)
    return {url,id,type}
   }
  }
 }
 return {reason:compatibleType?'id-nao-compativel':'tipo-nao-compativel'}
}

function formatOf(source,url) {
 if(source.infoHash)return 'torrent'
 if(source.externalUrl)return 'externo'
 if(source.ytId)return 'youtube'
 if(source.nzbUrl)return 'usenet'
 if(source.rarUrls||source.zipUrls)return 'arquivo'
 if(!url)return 'desconhecido'
 const path=url.pathname.toLowerCase()
 const mime=String(source.mimeType??'').split(';',1)[0].trim().toLowerCase()
 if(path.endsWith('.m3u8')||/^(application\/vnd\.apple\.mpegurl|application\/x-mpegurl)$/.test(mime))return 'hls'
 for(const [extension,kind,type] of [['mp4','mp4','video/mp4'],['webm','webm','video/webm'],['mkv','matroska','video/x-matroska'],['mpd','dash','application/dash+xml']])if(path.endsWith('.'+extension)||mime===type)return kind
 return 'http-opaco'
}
export function summarizeStreams(streams) {
 const sources=streams.map((raw,index)=>{
  const source=raw&&typeof raw==='object'?raw:{}
  let declaredUrl,url
  try{declaredUrl=new URL(source.url);if(['http:','https:'].includes(declaredUrl.protocol))url=declaredUrl}catch{}
  const format=formatOf(source,url)
  const description=[source.name,source.title,source.description,...(Array.isArray(source.languages)?source.languages:[])].join(' ')
  const quality=[...new Set(description.match(/\b(?:2160p|1080p|720p|480p|360p|4K|FHD|FullHD|HD|SD)\b/gi)??[])].map(value=>value.toLowerCase())
  const languages=[]
  for(const [name,pattern] of [['pt-BR',/🇧🇷|\bpt[-_]br\b|portugu[eê]s brasileiro/i],['dublado',/dublad/i],['legendado',/legendad|\bleg\b/i],['dual',/\bdual\b/i],['inglês',/🇺🇸|\bingl[eê]s\b|\benglish\b|\ben-us\b/i]])if(pattern.test(description))languages.push(name)
  const hints=source.behaviorHints
  const headers=hints?.proxyHeaders
  const requestHeaders=Object.keys(headers?.request??{})
  const codecs=String(source.codecs??String(source.mimeType??'').match(/codecs="?([^";]+)/i)?.[1]??'')
   .split(',').map(value=>value.trim()).filter(value=>/^[a-z0-9][a-z0-9._-]{0,39}$/i.test(value)).slice(0,6)
  const reference=['infoHash','externalUrl','ytId','nzbUrl','rarUrls','zipUrls','url'].find(field=>source[field])??'ausente'
  const safeHttps=url?.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.hostname.includes('.')&&
   !isIP(url.hostname)&&!/\.(local|localhost|internal|test|invalid)\.?$/i.test(url.hostname)&&
   !source.drm&&!source.infoHash&&!source.externalUrl&&!source.ytId
  const web=Boolean(safeHttps&&!hints?.notWebReady&&!headers&&['hls','mp4','webm'].includes(format))
  const supportedHeaders=!headers||!Object.keys(headers.response??{}).length&&requestHeaders.every(key=>['Referer','User-Agent'].includes(key))
  const native=Boolean(safeHttps&&supportedHeaders&&['hls','mp4','webm','matroska'].includes(format))
  let androidState='suportado-em-potencial',reason='origem-e-codec-a-verificar'
  if(source.drm||!['url','ausente'].includes(reference)){
   androidState='modalidade-nao-suportada';reason=source.drm?'drm':'requer-integracao-'+reference
  }else if(reference==='ausente'){
   androidState='recurso-invalido';reason='referencia-ausente'
  }else if(!url){
   androidState='recurso-invalido-ou-outro-protocolo';reason='url-http-nao-identificada'
  }else if(!safeHttps||!supportedHeaders){
   androidState='fora-da-politica-atual';reason=!safeHttps?'origem-ou-transporte-nao-aceito':'cabecalhos-nao-suportados'
  }else if(format==='dash'){
   androidState='suportavel-com-adaptacao';reason='modulo-dash-e-mime-a-integrar'
  }else if(!native){
   androidState='informacao-insuficiente';reason='formato-opaco-sem-declaracao-util'
  }
  const safeHeaderNames=names=>names.filter(key=>/^[a-z0-9-]{1,50}$/i.test(key)).slice(0,12)
  return {index,reference,protocol:declaredUrl?.protocol.slice(0,-1),format,codecs,androidState,reason,quality:[...new Set(quality)],languages,http:Boolean(url),web,native,notWebReady:hints?.notWebReady===true,requiresHeaders:Boolean(headers),requestHeaders:safeHeaderNames(requestHeaders),responseHeaders:safeHeaderNames(Object.keys(headers?.response??{}))}
 })
 return {count:sources.length,httpCount:sources.filter(s=>s.http).length,webCount:sources.filter(s=>s.web).length,nativeCount:sources.filter(s=>s.native).length,sources}
}

export function retryAfter(value, now=Date.now()) {
 if(!value)return undefined
 if(/^\s*\d+\s*$/.test(value))return now+Number(value)*1000
 const date=Date.parse(value)
 return Number.isFinite(date)?Math.max(now,date):undefined
}

export function createQueue(rate,{now=Date.now,pause=(ms,signal)=>sleep(ms,undefined,{signal}),maxWait=60000,onCooldown}={}) {
 let next=0
 const interval=Math.ceil(60000/rate)
 return {
  async request(fetchOnce,signal){
   let rateLimited=0
   for(let attempt=0;attempt<2;attempt++){
    signal?.throwIfAborted()
    const delay=Math.max(0,next-now())
    if(delay>maxWait)return {error:'consulta-adiada',retryAt:next,requests:attempt,rateLimited}
    if(delay)await pause(delay,signal)
    const response=await fetchOnce()
    // Count from completion, so waiting for a global slot cannot bunch requests.
    next=now()+interval
    const limited=response.status===429
    if(limited)rateLimited++
    if(!limited&&![502,503,504].includes(response.status))return {...response,requests:attempt+1,rateLimited}
    const until=retryAfter(response.retryAfter,now())??now()+(limited?60000:5000)
    next=Math.max(next,until)
    onCooldown?.(next,response.status)
    if(attempt===1||next-now()>maxWait)return {...response,retryAt:next,requests:attempt+1,rateLimited}
   }
  },
  defer(until){next=Math.max(next,until??0)}
 }
}

export function concurrency(limit) {
 const waiting=[]
 let active=0
 return async task=>{
  if(active>=limit)await new Promise(resolve=>waiting.push(resolve))
  else active++
  try{return await task()}finally{
   const next=waiting.shift()
   if(next)next()
   else active--
  }
 }
}

export async function fetchJson(url,signal) {
 const started=performance.now()
 const ms=()=>Math.round(performance.now()-started)
 try{
  const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),redirect:'manual',cache:'no-store',headers:{Accept:'application/json'}})
  const info={status:response.status,retryAfter:response.headers.get('retry-after')}
  if(!response.ok){await response.body?.cancel();return {...info,ms:ms()}}
  const html=(response.headers.get('content-type')??'').includes('text/html')
  if(html){await response.body?.cancel();return {...info,html:true,ms:ms()}}
  const reader=response.body?.getReader()
  if(!reader)return {...info,error:'resposta-vazia',ms:ms()}
  const decoder=new TextDecoder()
  let size=0,text=''
  try{
   for(;;){
    const {value,done}=await reader.read()
    if(done)break
    size+=value.byteLength
    if(size>2_000_000)return {...info,error:'resposta-excessiva',ms:ms()}
    text+=decoder.decode(value,{stream:true})
   }
   try{return {...info,data:JSON.parse(text+decoder.decode()),ms:ms()}}
   catch{return {...info,error:'json-invalido',ms:ms()}}
  }finally{await reader.cancel().catch(()=>{})}
 }catch(error){
  signal.throwIfAborted()
  return {error:error.name==='TimeoutError'?'timeout':'rede',ms:ms()}
 }
}

export function resumable(row,now,ttl) {
 return Boolean(row&&(row.retryAt?row.retryAt>now:now-row.at<ttl))
}

export function rankings(rows) {
 const all=[]
 const eligible=rows.filter(row=>row.id&&row.requests!==0)
 for(const category of ['total',...Object.keys(quotas),'velocidade','android']){
  const groups=new Map()
  for(const row of eligible){
   if(category in quotas&&row.category!==category)continue
   const group=groups.get(row.provider)??{ranking:category,provider:row.provider,nome:row.name,elegiveis:0,respostas:0,com_fontes:0,com_android:0,tempos:[]}
   group.elegiveis++
   if(row.status==='fontes'||row.status==='vazio'){
    group.respostas++
    if(row.count)group.com_fontes++
    if(row.nativeCount)group.com_android++
    if(Number.isFinite(row.ms))group.tempos.push(row.ms)
   }
   groups.set(row.provider,group)
  }
  const scored=[...groups.values()].map(({tempos,...group})=>{
   tempos.sort((a,b)=>a-b)
   const middle=Math.floor(tempos.length/2)
   const mediana_ms=tempos.length?(tempos[middle]+tempos[Math.floor((tempos.length-1)/2)])/2:undefined
   return {...group,cobertura_pct:100*group.com_fontes/group.elegiveis,android_pct:100*group.com_android/group.elegiveis,mediana_ms}
  })
  scored.sort((a,b)=>{
   const score=category==='velocidade'?(a.mediana_ms??Infinity)-(b.mediana_ms??Infinity)||b.respostas-a.respostas:
    category==='android'?b.com_android-a.com_android||b.android_pct-a.android_pct:b.com_fontes-a.com_fontes||b.cobertura_pct-a.cobertura_pct
   return score||a.nome.localeCompare(b.nome,'pt-BR')||a.provider.localeCompare(b.provider)
  })
  all.push(...scored.map((row,index)=>({...row,posicao:index+1})))
 }
 return all
}

export function additionalCoverage(rows,baseline) {
 const titleKey=row=>row.type+':'+row.tmdb
 const original=new Map(rows.filter(row=>baseline.includes(row.provider)).map(row=>[row.provider+':'+titleKey(row),row]))
 const result=new Map()
 for(const row of rows){
  if(baseline.includes(row.provider))continue
  const reference=baseline.map(provider=>original.get(provider+':'+titleKey(row)))
  const observed=reference.some(base=>base?.status==='fontes')
  const confirmedEmpty=reference.length>0&&reference.every(base=>base?.status==='vazio')
  const noAndroidCandidate=reference.length>0&&reference.every(base=>(base?.status==='vazio'||base?.status==='fontes')&&!base.nativeCount)
  for(const category of ['total',row.category]){
   const key=row.provider+':'+category
   const entry=result.get(key)??{provider:row.provider,nome:row.name,categoria:category,pares:0,com_fontes:0,adicionais:0,adicionais_android:0,ganho_android_potencial:0,base_ja_tem:0,base_inconclusiva:0}
   entry.pares++
   if(row.status==='fontes'){
    entry.com_fontes++
    if(observed)entry.base_ja_tem++
    else if(confirmedEmpty){entry.adicionais++;if(row.nativeCount)entry.adicionais_android++}
    else entry.base_inconclusiva++
    if(row.nativeCount&&noAndroidCandidate)entry.ganho_android_potencial++
   }
   result.set(key,entry)
  }
 }
 return [...result.values()].sort((a,b)=>a.categoria.localeCompare(b.categoria)||b.adicionais-a.adicionais||b.com_fontes-a.com_fontes||a.nome.localeCompare(b.nome))
}

export function csv(columns,rows) {
 const quote=value=>{
  let cell=String(value??'')
  if(typeof value==='string'&&/^\s*[=+@-]|^[\t\r\n]/.test(cell))cell="'"+cell
  return '"'+cell.replaceAll('"','""')+'"'
 }
 return '\uFEFF'+[columns.map(quote).join(';'),...rows.map(row=>columns.map(key=>quote(row[key])).join(';'))].join('\r\n')+'\r\n'
}
