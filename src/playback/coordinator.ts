import type {PlaybackSession,PlaybackProvider} from '../services/playback'
import type {Candidate,PlaybackContext,ProviderOutcome,SourceProvider} from './providers'
import {providerFailure} from './providers'
import type {LanguageChoice} from './sourcePolicy'
export type PlaybackPhase='searching'|'sources'|'language'|'preparing'|'buffering'|'playing'|'paused'|'ended'|'stopped'|'language-exhausted'|'embed-offer'|'embedded'|'error'
export interface PlaybackState {phase:PlaybackPhase;candidate?:Candidate;runId?:string;language?:LanguageChoice;options:LanguageChoice[];position:number;duration:number;outcomes:ProviderOutcome[];alternatives:Candidate[];failedIds:string[];fallback?:PlaybackSession;attempts:number;hasStarted?:boolean;errorStage?:'initialization'|'playback'}
export const SOURCE_QUERY_BUDGET_MS=6500
export const MAX_SOURCES_PER_PROVIDER=2
export const SOURCE_MAX_AGE_MS=90000
export const PROVIDER_ORDER=['fenixflix','brazuca','embedmovies','zeus'] as const
const BACKGROUND_STAGGER_MS=700
const PRIORITY_GRACE_MS=2200
export class PlaybackCoordinator {
 state:PlaybackState={phase:'searching',options:[],position:0,duration:0,outcomes:[],alternatives:[],failedIds:[],attempts:0}
 private controller=new AbortController();private candidates:Candidate[]=[];private tried=new Set<string>();private failed=new Set<string>();private listeners=new Set<(state:PlaybackState)=>void>();private serial=0;private disposed=false;private embedTried=false;private embedReady=false;private runPlayed=false;private began=Date.now();private lastCandidate?:Candidate
 private activeQueries=new Set<string>();private refreshed=new Set<string>();private embedPromise?:Promise<void>;private started=false;private returnToEmbed=false
 private rows=new Map<string,ProviderOutcome>()
 private providers:SourceProvider[]
 constructor(providers:SourceProvider[],private embed:PlaybackProvider,private context:PlaybackContext,private preferred?:LanguageChoice){
  this.providers=[...providers].sort((a,b)=>PROVIDER_ORDER.indexOf(a.id as typeof PROVIDER_ORDER[number])-PROVIDER_ORDER.indexOf(b.id as typeof PROVIDER_ORDER[number]))
  for(const id of PROVIDER_ORDER)if(id==='embedmovies'||this.providers.some(p=>p.id===id))this.rows.set(id,{id,state:'waiting',count:0})
  this.state.outcomes=[...this.rows.values()]
 }
 subscribe(listener:(state:PlaybackState)=>void){this.listeners.add(listener);listener(this.state);return()=>{this.listeners.delete(listener)}}
 private update(patch:Partial<PlaybackState>){if(this.disposed)return;this.state={...this.state,...patch};this.listeners.forEach(listener=>listener(this.state))}
 private publish(){this.update({outcomes:[...this.rows.values()],alternatives:[...this.candidates],failedIds:[...this.failed],options:[...new Set(this.candidates.flatMap(c=>c.language.modes).filter(mode=>mode!=='unknown'))]})}
 private async delay(ms:number){if(this.disposed)return;await new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);this.controller.signal.removeEventListener('abort',finish);resolve()};const timer=setTimeout(finish,ms);this.controller.signal.addEventListener('abort',finish,{once:true})})}
 private async lookup(provider:SourceProvider){
  if(this.disposed||this.activeQueries.has(provider.id))return
  this.activeQueries.add(provider.id);this.rows.set(provider.id,{id:provider.id,state:'checking',count:0});this.publish()
  const child=new AbortController();const cancel=()=>child.abort();this.controller.signal.addEventListener('abort',cancel,{once:true})
  const timer=setTimeout(()=>child.abort(),SOURCE_QUERY_BUDGET_MS)
  let cancelWait=()=>{}
  const aborted=new Promise<Candidate[]>((_,reject)=>{cancelWait=()=>reject(Error('Query timeout'));child.signal.addEventListener('abort',cancelWait,{once:true})})
  try{
   const candidates=await Promise.race([provider.find(this.context,child.signal),aborted])
   if(this.disposed)return
   this.candidates=this.candidates.filter(c=>c.providerId!==provider.id).concat(candidates)
   this.rows.set(provider.id,{id:provider.id,state:candidates.length?'sources':provider.lastScan?.returned?'filtered':'empty',count:candidates.length})
  }catch(error){if(!this.disposed)this.rows.set(provider.id,child.signal.aborted?{id:provider.id,state:'timeout',count:0}:providerFailure(provider.id,error))}
  finally{clearTimeout(timer);child.signal.removeEventListener('abort',cancelWait);this.controller.signal.removeEventListener('abort',cancel);this.activeQueries.delete(provider.id)}
  if(!this.disposed){this.publish();this.reconcile()}
 }
 private prepareEmbed(){
  if(this.embedPromise)return this.embedPromise
  this.embedPromise=(async()=>{
   this.rows.set('embedmovies',{id:'embedmovies',state:'checking',count:0});this.publish()
   const abort=new AbortController();const cancel=()=>abort.abort();this.controller.signal.addEventListener('abort',cancel,{once:true});let timer:ReturnType<typeof setTimeout>|undefined
   try{
    const fallback=await Promise.race([this.embed.resolve({mediaId:this.context.media.id,...(this.context.episode?{seasonNumber:this.context.episode.seasonNumber,episodeNumber:this.context.episode.episodeNumber}:{})},abort.signal),new Promise<null>(resolve=>{timer=setTimeout(()=>{abort.abort();resolve(null)},3000)})])
    if(this.disposed)return
    this.update({fallback:fallback??undefined});this.rows.set('embedmovies',{id:'embedmovies',state:fallback?'unverified':'empty',count:fallback?1:0})
   }catch{if(!this.disposed)this.rows.set('embedmovies',{id:'embedmovies',state:'network',count:0})}
   finally{if(timer)clearTimeout(timer);this.controller.signal.removeEventListener('abort',cancel);this.embedReady=true}
   if(!this.disposed){this.publish();this.reconcile()}
  })();return this.embedPromise
 }
 async start(){
  if(this.started)return;this.started=true;this.began=Date.now();this.publish()
  const fenix=this.providers.find(p=>p.id==='fenixflix');const brazuca=this.providers.find(p=>p.id==='brazuca');const zeus=this.providers.find(p=>p.id==='zeus')
  const first=fenix?this.lookup(fenix):Promise.resolve()
  const grace=setTimeout(()=>this.reconcile(),PRIORITY_GRACE_MS)
  try{
   if(brazuca){if(fenix)await this.delay(BACKGROUND_STAGGER_MS);await this.lookup(brazuca)}
   await this.prepareEmbed()
   if(zeus&&!this.disposed)await this.lookup(zeus)
   await first
  }finally{clearTimeout(grace)}
  this.reconcile()
 }
 private pending(id:string){const state=this.rows.get(id)?.state;return state==='waiting'||state==='checking'}
 private hasLiveSelection(){return !!this.state.runId&&['preparing','buffering','playing','paused','ended','stopped','embedded'].includes(this.state.phase)}
 private reconcile(){
  if(this.disposed||this.hasLiveSelection()||this.state.phase==='sources')return
  const options=this.state.options
  if(!this.preferred&&options.includes('dub')&&options.includes('sub')){this.update({phase:'language'});return}
  if(!this.preferred)this.preferred=options[0]??(this.candidates.length?'unknown':undefined)
  if(this.preferred)this.update({language:this.preferred})
  this.advance()
 }
 choose(language:LanguageChoice){this.preferred=language;this.update({language,candidate:undefined,runId:undefined,phase:'searching'});this.advance()}
 private activate(candidate:Candidate){this.lastCandidate=candidate;this.tried.add(candidate.identity);this.runPlayed=false;this.update({phase:'preparing',candidate,duration:0,hasStarted:false,runId:`normal-${++this.serial}-${crypto.randomUUID()}`,attempts:this.state.attempts+1})}
 private advance(){
  if(this.disposed)return
  const language=this.preferred??'unknown'
  for(const id of PROVIDER_ORDER){
   if(id==='embedmovies'){
    if(!this.embedReady){this.update({candidate:undefined,runId:undefined,phase:'searching'});return}
    if(this.state.fallback&&!this.embedTried){this.update({candidate:undefined,runId:undefined,phase:'embed-offer'});return}
    continue
   }
   const provider=this.providers.find(p=>p.id===id);if(!provider)continue
   const items=this.candidates.filter(c=>c.providerId===id&&c.language.modes.includes(language)).sort((a,b)=>b.score-a.score)
   if(items.filter(c=>this.tried.has(c.identity)).length<MAX_SOURCES_PER_PROVIDER){
    const selected=items.find(c=>!this.tried.has(c.identity)&&Date.now()-c.receivedAt<SOURCE_MAX_AGE_MS)
    if(selected){this.activate(selected);return}
   }
   if(items.some(c=>Date.now()-c.receivedAt>=SOURCE_MAX_AGE_MS)&&!this.refreshed.has(id)){
    this.refreshed.add(id);this.update({candidate:undefined,runId:undefined,phase:'searching'});void this.lookup(provider);return
   }
   if(this.pending(id)){
    // An earlier slow provider gets a bounded head start; later usable results may then proceed.
    if(id==='fenixflix'&&Date.now()-this.began>=PRIORITY_GRACE_MS&&this.candidates.some(c=>c.providerId==='brazuca'&&c.language.modes.includes(language)))continue
    this.update({candidate:undefined,runId:undefined,phase:'searching'});return
   }
  }
  const other=this.candidates.some(c=>!c.language.modes.includes(language)&&!this.failed.has(c.id))
  this.update({candidate:undefined,runId:undefined,phase:other?'language-exhausted':'error'})
 }
 selectSource(id:string,language?:LanguageChoice){
  if(id==='embedmovies'){this.openEmbed(true);return true}
  const candidate=this.candidates.find(c=>c.id===id);if(!candidate)return false
  if(Date.now()-candidate.receivedAt>=SOURCE_MAX_AGE_MS){this.showSources();const provider=this.providers.find(p=>p.id===candidate.providerId);if(provider)void this.lookup(provider);return false}
  const mode=language&&candidate.language.modes.includes(language)?language:candidate.language.modes.includes(this.preferred??'unknown')?this.preferred:candidate.language.modes[0]
  this.preferred=mode;this.update({language:mode});this.activate(candidate);return true
 }
 showSources(){if(this.state.phase==='sources')return;this.returnToEmbed=this.state.phase==='embedded';this.update({phase:'sources',candidate:undefined,runId:undefined})}
 resume(){if(this.returnToEmbed){this.openEmbed(true)}else if(this.lastCandidate){this.selectSource(this.lastCandidate.id,this.preferred)}else{this.update({phase:'searching'});this.reconcile()}}
 position(runId:string,position:number,duration:number){if(runId!==this.state.runId)return;this.update({...(Number.isFinite(position)?{position}:{}),...(Number.isFinite(duration)&&duration>0?{duration}:{})})}
 openEmbed(manual=false){if(!this.state.fallback||this.embedTried&&!manual)return;this.embedTried=true;this.update({phase:'embedded',candidate:undefined,runId:`embed-${++this.serial}-${crypto.randomUUID()}`})}
 iframeFailed(runId?:string){if(runId&&runId!==this.state.runId)return;if(!this.state.runId?.startsWith('embed-'))return;this.embedTried=true;this.update({phase:'searching',candidate:undefined,runId:undefined});this.advance()}
 event(runId:string,event:'playing'|'progress'|'paused'|'buffering'|'failed'|'ended'|'closed',position?:number,duration?:number){
  if(this.disposed||runId!==this.state.runId)return
  if(event==='failed'){if(this.state.candidate)this.failed.add(this.state.candidate.id);this.update({phase:'searching',candidate:undefined,runId:undefined,errorStage:this.runPlayed?'playback':'initialization',failedIds:[...this.failed]});this.advance();return}
  if(event==='closed'){this.update({phase:'stopped'});return}
  if(event==='progress'||event==='playing')this.runPlayed=true
  const patch:Partial<PlaybackState>={phase:event==='progress'?'playing':event,...(event==='progress'||event==='playing'?{hasStarted:true}:{})}
  if(position!==undefined&&Number.isFinite(position))patch.position=Math.max(0,position)
  if(duration!==undefined&&Number.isFinite(duration)&&duration>0)patch.duration=duration
  this.update(patch)
 }
 dispose(){this.disposed=true;this.controller.abort();this.listeners.clear()}
}
