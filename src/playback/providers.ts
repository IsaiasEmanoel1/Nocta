import {StremioAddonAdapter,AddonError} from '../experimental/StremioAddonAdapter'
import type {AddonConfig,AddonTitle,AddonSource} from '../experimental/StremioAddonAdapter'
import type {Media} from '../domain/media'
import type {EpisodeSelection} from '../domain/episodes'
import type {PlayerInput} from '../experimental/playbackEngine'
import type {PlaybackSession} from '../services/playback'
import {authorizedDevelopmentAddons} from '../config/stremioServices'
import {isCinemaCapture,languageDeclaration,qualityScore} from './sourcePolicy'
import type {LanguageDeclaration} from './sourcePolicy'
export interface PlaybackContext {media:Media;episode?:EpisodeSelection;native:boolean}
export interface Candidate {id:string;providerId:string;engine:'web'|'native';input?:PlayerInput;session?:PlaybackSession;language:LanguageDeclaration;score:number;receivedAt:number;validateMediaUrl?:(url:string)=>void;identity:string;quality?:string;serverName?:string}
export interface SourceProvider {id:string;lastScan?:{returned:number;eligible:number};find(context:PlaybackContext,signal:AbortSignal):Promise<Candidate[]>}
export type ProviderOutcome={id:string;state:'waiting'|'checking'|'unverified'|'sources'|'empty'|'filtered'|'timeout'|'network'|'http'|'unsupported'|'response'|'policy';count:number}
const fenix=authorizedDevelopmentAddons.find(config=>config.id==='fenixflix-diagnostics')!
const sharedOrigins=['https://cdn-sv01.maximaimg.online','https://nsrv.classotaku.app']
export const automaticAddonConfigs:AddonConfig[]=[{...fenix,id:'fenixflix',timeoutMs:10000},
 {id:'zeus',manifestUrl:'https://zeus-br.shardweb.app/manifest.json',apiOrigins:['https://zeus-br.shardweb.app'],mediaOrigins:['https://zeus-br.shardweb.app',...sharedOrigins],nativeOrigins:['https://zeus-br.shardweb.app',...sharedOrigins],rights:{reference:'Serviço configurado explicitamente pelo operador Nocta.',expiresAt:Date.UTC(2027,0,1)},timeoutMs:10000,playbackAllowed:true},
 {id:'brazuca',manifestUrl:'https://brazuca-play-stremio.vercel.app/manifest.json',apiOrigins:['https://brazuca-play-stremio.vercel.app'],mediaOrigins:['https://brazuca-play-stremio.vercel.app',...sharedOrigins],nativeOrigins:['https://brazuca-play-stremio.vercel.app',...sharedOrigins],rights:{reference:'Serviço configurado explicitamente pelo operador Nocta.',expiresAt:Date.UTC(2027,0,1)},timeoutMs:10000,playbackAllowed:true}]
export function addonTitle(context:PlaybackContext,config:AddonConfig):AddonTitle {
 const match=/^tmdb-(movie|tv)-([1-9]\d*)$/.exec(context.media.id)
 if(!match)throw new AddonError('unsupported','Título sem correspondência confiável.')
 const identity=context.media.imdbId&&/^tt\d+$/.test(context.media.imdbId)?{imdb:context.media.imdbId}:config.tmdbPrefix?{tmdb:Number(match[2])}:undefined
 if(!identity)throw new AddonError('unsupported','IMDb não informado pelo TMDB; nenhum ID próprio será adivinhado.')
 return {type:context.media.kind==='tv'?'series':'movie',...identity,...(context.episode?{episode:context.episode}:{})}
}
export class StremioSourceProvider implements SourceProvider {
 readonly id:string
 lastScan?:{returned:number;eligible:number}
 constructor(readonly config:AddonConfig,private fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){this.id=config.id}
 async find(context:PlaybackContext,signal:AbortSignal){
  const adapter=new StremioAddonAdapter(this.config,this.fetcher)
  const sources=await adapter.streams(addonTitle(context,this.config),signal)
  const found:Candidate[]=[];const seen=new Set<string>()
  for(const source of sources){
   if(isCinemaCapture(`${source.name} ${source.description}`))continue
   const native=context.native?source.nativeCandidate:undefined
   if(!native&&!source.url)continue
   if(source.notWebReady&&!native)continue
   const input=native?{...native}:undefined
   const identity=JSON.stringify([native?.url??source.url,input?.mimeType??source.format,Object.entries(input?.headers??{}).sort()])
   if(seen.has(identity))continue;seen.add(identity)
   found.push({id:`${this.id}:${source.id}`,providerId:this.id,engine:native?'native':'web',input,session:native?undefined:{...adapter.session(source,context.media.id,context.media.title),title:context.media.title,poster:context.media.backdrop,attribution:'',license:{name:'',url:'',projectUrl:''}},quality:source.quality,serverName:(source.description.match(/(?:🐉|🚗|☂️|🦡|Fonte:)\s*([^\n]+)/)?.[1]??source.name).replace(/https?:\/\/\S+/g,'').slice(0,55),language:languageDeclaration(source),score:qualityScore(source.quality),receivedAt:Date.now(),validateMediaUrl:adapter.validateMediaUrl,identity})
  }
  this.lastScan={returned:sources.length,eligible:found.length}
  return found.sort((a,b)=>b.score-a.score)
 }
}
export class FenixFlixProvider extends StremioSourceProvider {constructor(fetcher?:typeof fetch){super(automaticAddonConfigs[0],fetcher)}}
export class ZeusBrProvider extends StremioSourceProvider {constructor(fetcher?:typeof fetch){super(automaticAddonConfigs[1],fetcher)}}
export class BrazucaPlayProvider extends StremioSourceProvider {constructor(fetcher?:typeof fetch){super(automaticAddonConfigs[2],fetcher)}}
export const createSourceProviders=():SourceProvider[]=>[new FenixFlixProvider(),new BrazucaPlayProvider(),new ZeusBrProvider()]
export function providerFailure(id:string,error:unknown):ProviderOutcome{return {id,count:0,state:error instanceof AddonError?error.code==='cancelled'?'timeout':error.code==='manifest'?'response':error.code:'network'}}
export type {AddonSource}
