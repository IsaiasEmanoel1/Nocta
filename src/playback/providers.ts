import {StremioAddonAdapter,AddonError} from '../experimental/StremioAddonAdapter'
import type {AddonConfig,AddonTitle,AddonSource} from '../experimental/StremioAddonAdapter'
import type {Media} from '../domain/media'
import type {EpisodeSelection} from '../domain/episodes'
import type {PlayerInput} from '../experimental/playbackEngine'
import type {PlaybackSession} from '../services/playback'
import {authorizedDevelopmentAddons} from '../config/stremioServices'
import {isCinemaCapture,languageDeclaration,qualityScore} from './sourcePolicy'
import type {LanguageDeclaration} from './sourcePolicy'
import {discoveryCache} from './discoveryCache'
import {experimentalConfig,laboratoryProfiles,readExperimentalManifest} from '../config/experimentalProviders'
import {transportTrace} from './transportTrace'
export interface PlaybackContext {media:Media;episode?:EpisodeSelection;native:boolean;nativeOrigins?:readonly string[];publicMediaTransport?:boolean;manualIdentity?:{imdb:string}}
export interface SourceDiagnostic {id:string;format:string;engine?:'web'|'native';reason?:string;languages:LanguageDeclaration['modes']}
export interface DiscoveryDiagnostic {manifestId?:string;query?:{type:string;id:string};sources:SourceDiagnostic[]}
export interface Candidate {id:string;providerId:string;engine:'web'|'native';input?:PlayerInput;session?:PlaybackSession;language:LanguageDeclaration;score:number;receivedAt:number;expiresAt?:number;reuseUntil?:number;validateMediaUrl?:(url:string)=>void;validateStart?:(engine:'web'|'native')=>void;identity:string;quality?:string;serverName?:string;displayName?:string;resumeKey?:string;checkRedirect?:boolean}
type ConfirmedSource={candidate:Candidate;media:Media;language:LanguageDeclaration['modes'][number];confirmedAt:number;expiresAt:number}
export interface SourceProvider {id:string;queryBudgetMs?:number;lastScan?:{returned:number;eligible:number};cached?(context:PlaybackContext):Candidate[];confirmed?(context:PlaybackContext):ConfirmedSource|undefined;remember?(context:PlaybackContext,candidate:Candidate,language:ConfirmedSource['language']):void;invalidate?(context:PlaybackContext,identity:string):void;find(context:PlaybackContext,signal:AbortSignal):Promise<Candidate[]>}
export type ProviderOutcome={id:string;state:'waiting'|'checking'|'unverified'|'sources'|'empty'|'filtered'|'timeout'|'network'|'http'|'unsupported'|'response'|'policy';count:number;status?:number}
const fenix=authorizedDevelopmentAddons.find(config=>config.id==='fenixflix-diagnostics')!
const sharedOrigins=['https://cdn-sv01.maximaimg.online','https://nsrv.classotaku.app']
export const automaticAddonConfigs:AddonConfig[]=[{...fenix,id:'fenixflix',timeoutMs:10000},
 {id:'zeus',manifestUrl:'https://zeus-br.shardweb.app/manifest.json',apiOrigins:['https://zeus-br.shardweb.app'],mediaOrigins:['https://zeus-br.shardweb.app',...sharedOrigins],nativeOrigins:['https://zeus-br.shardweb.app',...sharedOrigins],rights:{reference:'Serviço configurado explicitamente pelo operador Nocta.',expiresAt:Date.UTC(2027,0,1)},timeoutMs:10000,playbackAllowed:true},
 {id:'brazuca',manifestUrl:'https://brazuca-play-stremio.vercel.app/manifest.json',apiOrigins:['https://brazuca-play-stremio.vercel.app'],mediaOrigins:['https://brazuca-play-stremio.vercel.app',...sharedOrigins],nativeOrigins:['https://brazuca-play-stremio.vercel.app',...sharedOrigins],rights:{reference:'Serviço configurado explicitamente pelo operador Nocta.',expiresAt:Date.UTC(2027,0,1)},timeoutMs:10000,playbackAllowed:true}]
export function addonTitle(context:PlaybackContext,config:AddonConfig):AddonTitle {
 const match=/^tmdb-(movie|tv)-([1-9]\d*)$/.exec(context.media.id)
 const imdb=context.manualIdentity?.imdb??context.media.imdbId
 if(!match&&!context.manualIdentity)throw new AddonError('unsupported','Título sem correspondência confiável.')
 const tmdb=match&&(config.tmdbPrefix||config.publicMediaTransport)?{tmdb:Number(match[2])}:undefined
 const identity=imdb&&/^tt\d+$/.test(imdb)?{imdb,...(config.publicMediaTransport?tmdb:undefined)}:tmdb
 if(!identity)throw new AddonError('unsupported','IMDb não informado pelo TMDB; nenhum ID próprio será adivinhado.')
 return {type:context.media.kind==='tv'?'series':'movie',...identity,...(context.episode?{episode:context.episode}:{})}
}
const recentSources = new Map<string,{expires:number;items:Candidate[]}>()
// Keep the playable descriptor in process memory only. Never put URLs or request headers in history.
const confirmedSources = new Map<string,ConfirmedSource>()
const discoveryLifetime = 30_000
const confirmedLifetime = 60_000
export function confirmedPlaybackMedia(id:string){
 const now=Date.now()
 return [...confirmedSources.values()].reverse().find(entry=>entry.media.id===id&&entry.expiresAt>now)?.media
}
export class StremioSourceProvider implements SourceProvider {
 readonly id:string
 get queryBudgetMs(){return this.id==='zeus-beta'?18_000:this.id==='vetela'?80_000:undefined}
 lastScan?:{returned:number;eligible:number}
 diagnostic:DiscoveryDiagnostic={sources:[]}
 constructor(readonly config:AddonConfig,private fetcher:typeof fetch=discoveryCache.forProfile(config.id+'|'+config.manifestUrl)){this.id=config.id}
 private cacheKey(context:PlaybackContext){
  return JSON.stringify([this.config,context.media.id,context.manualIdentity?.imdb??context.media.imdbId,context.episode,context.native,context.nativeOrigins,context.publicMediaTransport])
 }
 cached(context:PlaybackContext){
  const key=this.cacheKey(context), entry=recentSources.get(key)
  if(entry&&entry.expires>Date.now())return entry.items.filter(item=>(item.reuseUntil??0)>Date.now())
  recentSources.delete(key);return []
 }
 confirmed(context:PlaybackContext){
  const key=this.cacheKey(context), entry=confirmedSources.get(key)
  if(entry&&entry.expiresAt>Date.now())return entry
  confirmedSources.delete(key)
 }
 remember(context:PlaybackContext,candidate:Candidate,language:ConfirmedSource['language']){
  const now=Date.now(),expiresAt=Math.min(candidate.reuseUntil??0,now+confirmedLifetime)
  if(expiresAt<=now)return
  const key=this.cacheKey(context)
  confirmedSources.delete(key)
  confirmedSources.set(key,{candidate,media:context.media,language,confirmedAt:now,expiresAt})
  if(confirmedSources.size>60)confirmedSources.delete(confirmedSources.keys().next().value!)
 }
 invalidate(context:PlaybackContext,identity:string){
  const key=this.cacheKey(context), entry=recentSources.get(key)
  if(confirmedSources.get(key)?.candidate.identity===identity)confirmedSources.delete(key)
  if(!entry)return
  entry.items=entry.items.filter(item=>item.identity!==identity)
  if(!entry.items.length)recentSources.delete(key)
 }
 async find(context:PlaybackContext,signal:AbortSignal){
  const title=addonTitle(context,this.config)
  this.lastScan=undefined
  this.diagnostic={sources:[]}
  const request=crypto.randomUUID()
  let responseLifetime=Infinity
  const adapter=new StremioAddonAdapter(this.config,async (url,init)=>{
   const stage=new URL(String(url)).pathname.endsWith('/manifest.json')?'manifest':'stream'
   if(stage==='stream'){
    const [type,id]=new URL(String(url)).pathname.split('/').slice(-2)
    this.diagnostic.query={type,id:decodeURIComponent(id.replace(/\.json$/,''))}
   }
   const begin=performance.now()
   const response=await this.fetcher(url,init)
   if(stage==='stream'){
    const control=response.headers.get('cache-control')??''
    const maxAge=/(?:^|,)\s*max-age=(\d+)/i.exec(control)?.[1]
    const expires=Date.parse(response.headers.get('expires')??'')
    if(/\b(?:no-store|no-cache|private)\b/i.test(control)||/authorization|cookie|\*/i.test(response.headers.get('vary')??''))responseLifetime=0
    else if(maxAge!==undefined)responseLifetime=Math.min(responseLifetime,Math.max(0,(Number(maxAge)-Number(response.headers.get('age')??0))*1000))
    else if(Number.isFinite(expires))responseLifetime=Math.min(responseLifetime,Math.max(0,expires-Date.now()))
   }
   transportTrace('consulta-http',{request,provider:this.id,stage,status:response.status,ms:Math.round(performance.now()-begin)})
   return response
  })
  const manifest=await adapter.loadManifest(signal)
  if(/^[\w.-]{1,100}$/.test(manifest.id))this.diagnostic.manifestId=manifest.id
  const sources=await adapter.streams(title,signal)
  const found:Candidate[]=[];const seen=new Set<string>()
  const exclusions=new Map<string,string>()
  const receivedAt=Date.now()
  for(const source of sources){
   if(source.expiresAt!==undefined&&source.expiresAt<=receivedAt){exclusions.set(source.id,'URL de mídia expirada');continue}
   if(isCinemaCapture(`${source.name} ${source.description}`)){exclusions.set(source.id,'Captura de cinema');continue}
   const nativeOriginAllowed=source.nativeCandidate?.publicMediaTransport?context.publicMediaTransport===true:
    !context.nativeOrigins||!!source.origin&&context.nativeOrigins.includes(source.origin)
   const native=context.native&&nativeOriginAllowed?source.nativeCandidate:undefined
   const web=source.notWebReady!==true&&source.url?source.url:undefined
   if(context.native&&source.nativeCandidate&&!nativeOriginAllowed)source.nativeReason='Transporte indisponível neste APK.'
   if(!native&&!web){
    exclusions.set(source.id,source.nativeCandidate?'Transporte indisponível neste aparelho ou APK.':source.nativeReason??(source.notWebReady&&source.url?'O complemento declarou que a fonte exige reprodução nativa':source.reason?.startsWith('Exige proxyHeaders')?'Cabeçalhos especiais exigidos':source.reason??'Sem transporte compatível.'))
    continue
   }
   let session:PlaybackSession|undefined
   if(web){
    try{session={...adapter.session(source,context.media.id,context.media.title),title:context.media.title,poster:context.media.backdrop,attribution:'',license:{name:'',url:'',projectUrl:''}}}
    catch{if(!native){exclusions.set(source.id,'A fonte não pôde ser entregue ao player web.');continue}}
   }
   const input=native?{...native}:undefined
   const identity=JSON.stringify([native?.url??web,input?.mimeType??source.format,Object.entries(input?.headers??{}).sort()])
   if(seen.has(identity)){exclusions.set(source.id,'Transporte duplicado');continue}seen.add(identity)
   const serverName=(source.description.match(/(?:🐉|🚗|☂️|🦡|Fonte:)\s*([^\n]+)/)?.[1]??source.name).replace(/https?:\/\/\S+/g,'').slice(0,55)
   const language=languageDeclaration(source)
   // Semantic preference only: no URL, signed query, header value or response index is persisted.
   const semantic=JSON.stringify([this.id,serverName,source.quality,source.reportedFormat??source.format,language.modes]);let hash=2166136261;for(const char of semantic)hash=Math.imul(hash^char.charCodeAt(0),16777619)
   const checkRedirect=this.id==='fenixflix'&&!!web&&new URL(web).pathname.startsWith('/r/')
   const url=new URL(native?.url??web!)
   const shortLifetime=url.search&&source.expiresAt===undefined?discoveryLifetime:Infinity
   const reuseUntil=Math.min(receivedAt+Math.min(responseLifetime,shortLifetime),source.expiresAt??Infinity,this.config.rights?.expiresAt??Infinity)
   found.push({id:`${this.id}:${source.id}`,providerId:this.id,engine:native?'native':'web',input,session,quality:source.quality,serverName,language,resumeKey:`${this.id}:${(hash>>>0).toString(16)}`,score:qualityScore(source.quality),receivedAt,expiresAt:source.expiresAt,reuseUntil,validateMediaUrl:adapter.validateMediaUrl,validateStart:engine=>adapter.validatePlaybackUrl((engine==='native'?input?.url:web)??'',engine,input?.mimeType),identity,checkRedirect})
  }
  this.lastScan={returned:sources.length,eligible:found.length}
  this.diagnostic.sources=sources.map(source=>{
   const id=`${this.id}:${source.id}`
   return {id,format:source.reportedFormat??source.format,engine:found.find(candidate=>candidate.id===id)?.engine,reason:exclusions.get(source.id),languages:languageDeclaration(source).modes}
  })
  const accepted=new Set(found.map(candidate=>candidate.id))
  for(const source of sources)transportTrace('fonte',{
   request,provider:this.id,source:`${this.id}:${source.id}`,format:source.reportedFormat,
   accepted:accepted.has(`${this.id}:${source.id}`),
   reason:exclusions.get(source.id)??(source.reason?.startsWith('Exige proxyHeaders')?'Cabeçalhos especiais exigidos':source.reason),
   nativeReason:source.nativeReason,
  })
  found.sort((a,b)=>b.score-a.score)
  const key=this.cacheKey(context)
  // The hot cache is process-local. Header-dependent and query-signed media are fetched again.
  const reusable=found.filter(candidate=>{
   const url=candidate.input?.url??candidate.session?.sources[0]?.src
   return (candidate.reuseUntil??0)>receivedAt&&url&&!new URL(url).search&&!Object.keys(candidate.input?.headers??{}).length
  })
  signal.throwIfAborted()
  recentSources.delete(key)
  if(reusable.length){
   recentSources.set(key,{expires:receivedAt+discoveryLifetime,items:reusable})
   if(recentSources.size>60)recentSources.delete(recentSources.keys().next().value!)
  }
  return found
 }
}
export class FenixFlixProvider extends StremioSourceProvider {constructor(fetcher?:typeof fetch){super(automaticAddonConfigs[0],fetcher)}}
export class ZeusBrProvider extends StremioSourceProvider {constructor(fetcher?:typeof fetch){super(automaticAddonConfigs[1],fetcher)}}
export class BrazucaPlayProvider extends StremioSourceProvider {constructor(fetcher?:typeof fetch){super(automaticAddonConfigs[2],fetcher)}}
export function experimentalProviderConfig(profile:typeof laboratoryProfiles[number]){
 const base=automaticAddonConfigs.find(config=>config.id===profile.id)
 const manifest=readExperimentalManifest(profile,base?.manifestUrl)
 if(!manifest)return undefined
 return base?{...base,manifestUrl:manifest,rights:undefined,publicMediaTransport:true}:experimentalConfig(profile,manifest)
}
export const createSourceProviders=(options:{enableZeus?:boolean;experimental?:boolean}={}):SourceProvider[]=>options.experimental?
 laboratoryProfiles.map(profile=>{
  const config=experimentalProviderConfig(profile)
  return config?new StremioSourceProvider(config):{id:profile.id,async find(){throw new AddonError('policy','Configure o manifesto no laboratório.')}}
 }):[new FenixFlixProvider(),new BrazucaPlayProvider(),...((options.enableZeus??(import.meta.env.VITE_ENABLE_ZEUS_RESERVE==='true'))?[new ZeusBrProvider()]:[])]
export function providerFailure(id:string,error:unknown):ProviderOutcome{return {id,count:0,state:error instanceof AddonError?error.code==='cancelled'?'timeout':error.code==='manifest'?'response':error.code:'network',...(error instanceof AddonError&&error.status?{status:error.status}:{})}}
export type {AddonSource}
