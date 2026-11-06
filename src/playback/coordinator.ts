import type {PlaybackSession,PlaybackProvider} from '../services/playback'
import type {Candidate,PlaybackContext,ProviderOutcome,SourceProvider} from './providers'
import {providerFailure} from './providers'
import type {LanguageChoice} from './sourcePolicy'
import {transportTrace} from './transportTrace'
export type PlaybackPhase='searching'|'sources'|'language'|'preparing'|'buffering'|'playing'|'paused'|'ended'|'stopped'|'language-exhausted'|'embedded'|'error'
export interface PlaybackState {phase:PlaybackPhase;candidate?:Candidate;runId?:string;language?:LanguageChoice;options:LanguageChoice[];position:number;duration:number;outcomes:ProviderOutcome[];alternatives:Candidate[];failedIds:string[];fallback?:PlaybackSession;embedLabel?:string;attempts:number;hasStarted?:boolean;errorStage?:'initialization'|'playback'}
export const SOURCE_QUERY_BUDGET_MS=9000
export const SOURCE_MAX_AGE_MS=90000
export const PROVIDER_ORDER=['fenixflix','brazuca','bscine','magnetflix','zeus-beta','zeus','vetela','embedmovies'] as const
export const ALL_PROVIDER_ORDER=PROVIDER_ORDER
export interface ResumeHint {position:number;duration?:number;sourceKey?:string;providerId?:string}
const BACKGROUND_STAGGER_MS=700
const PRIORITY_GRACE_MS=2200
export class PlaybackCoordinator {
 state:PlaybackState={phase:'searching',options:[],position:0,duration:0,outcomes:[],alternatives:[],failedIds:[],attempts:0}
 private controller=new AbortController();private candidates:Candidate[]=[];private tried=new Set<string>();private failed=new Set<string>();private listeners=new Set<(state:PlaybackState)=>void>();private serial=0;private disposed=false;private embedTried=false;private embedReady=false;private runPlayed=false;private began=Date.now();private lastCandidate?:Candidate
 private activeQueries=new Set<string>();private refreshed=new Set<string>();private embedPromise?:Promise<void>;private started=false;private returnToEmbed=false
 private transientFailures=new Set<string>()
 private rejectedTransports=new Set<string>()
 private languageExpiry?:ReturnType<typeof setTimeout>
 private attemptStarted=0
 private milestones=new Set<string>()
 private rows=new Map<string,ProviderOutcome>();private labels=new Map<string,string>();private labelSerial=0
 private providers:SourceProvider[]
 private discoveryStarted=false
 private lastConfirmation=0
 private confirmedRun?:string
 constructor(providers:SourceProvider[],private embed:PlaybackProvider|undefined,private context:PlaybackContext,private preferred?:LanguageChoice,private resumeHint?:ResumeHint,private discoverAll=false,private automatic=false){
  // A source with no declared language is not a saved audio preference.
  if(this.preferred==='unknown')this.preferred=undefined
  this.providers=[...providers].sort((a,b)=>ALL_PROVIDER_ORDER.indexOf(a.id as typeof ALL_PROVIDER_ORDER[number])-ALL_PROVIDER_ORDER.indexOf(b.id as typeof ALL_PROVIDER_ORDER[number]))
  for(const id of ALL_PROVIDER_ORDER)if(id==='embedmovies'?Boolean(embed):this.providers.some(p=>p.id===id))this.rows.set(id,{id,state:'waiting',count:0})
  this.state={...this.state,outcomes:[...this.rows.values()],position:Math.max(0,resumeHint?.position??0),duration:resumeHint?.duration??0,language:this.preferred}
 }
 private label(identity:string){let label=this.labels.get(identity);if(!label){label=`Servidor ${++this.labelSerial}`;this.labels.set(identity,label)}return label}
 subscribe(listener:(state:PlaybackState)=>void){this.listeners.add(listener);listener(this.state);return()=>{this.listeners.delete(listener)}}
 private untried(){return this.candidates.filter(candidate=>!this.tried.has(candidate.identity))}
 private fresh(candidate:Candidate){const now=Date.now();return now-candidate.receivedAt<SOURCE_MAX_AGE_MS&&(candidate.expiresAt??Infinity)>now}
 private available(){return this.untried().filter(candidate=>this.fresh(candidate))}
 private update(patch:Partial<PlaybackState>){
  if(this.disposed)return
  const available=this.available()
  this.state={...this.state,...patch,options:[...new Set(available.flatMap(candidate=>candidate.language.modes))]}
  clearTimeout(this.languageExpiry)
  if(available.length&&(this.state.phase==='language'||this.state.phase==='language-exhausted')){
   const expiresAt=Math.min(...available.map(candidate=>candidate.receivedAt))+SOURCE_MAX_AGE_MS
   this.languageExpiry=setTimeout(()=>this.reconcile(),Math.max(1,expiresAt-Date.now()))
  }
  this.listeners.forEach(listener=>listener(this.state))
 }
 private publish(){this.update({outcomes:[...this.rows.values()],alternatives:[...this.candidates],failedIds:[...this.failed]})}
 private async delay(ms:number){if(this.disposed)return;await new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);this.controller.signal.removeEventListener('abort',finish);resolve()};const timer=setTimeout(finish,ms);this.controller.signal.addEventListener('abort',finish,{once:true})})}
 private async lookup(provider:SourceProvider,retryHlsFor?:LanguageChoice){
  if(this.disposed||this.activeQueries.has(provider.id))return
  const queryStarted=performance.now()
  this.activeQueries.add(provider.id);this.rows.set(provider.id,{id:provider.id,state:'checking',count:0});this.publish()
  const child=new AbortController();const cancel=()=>child.abort();this.controller.signal.addEventListener('abort',cancel,{once:true})
  const timer=setTimeout(()=>child.abort(),provider.queryBudgetMs??SOURCE_QUERY_BUDGET_MS)
  let cancelWait=()=>{}
  const aborted=new Promise<Candidate[]>((_,reject)=>{cancelWait=()=>reject(Error('Query timeout'));child.signal.addEventListener('abort',cancelWait,{once:true})})
  try{
   const candidates=(await Promise.race([provider.find(this.context,child.signal),aborted])).filter(candidate=>!this.rejectedTransports.has(candidate.identity))
   if(this.disposed)return
   if(retryHlsFor&&!candidates.some(c=>c.language.modes.includes(retryHlsFor)&&!this.tried.has(c.identity))){
    const renewed=candidates.find(c=>c.language.modes.includes(retryHlsFor)&&this.transientFailures.has(c.identity)
     &&(c.input?.mimeType??c.session?.sources[0]?.type)==='application/vnd.apple.mpegurl')
    // A fresh HLS response can point at new segments behind the same playlist URL.
    if(renewed)this.tried.delete(renewed.identity)
   }
   const changed=new Set(candidates.filter(c=>this.candidates.some(old=>old.id===c.id&&old.identity!==c.identity)).map(c=>c.id));for(const id of changed)this.failed.delete(id)
   this.candidates=this.candidates.filter(c=>c.providerId!==provider.id).concat(candidates.map(c=>({...c,displayName:this.label(c.identity)})))
   this.rows.set(provider.id,{id:provider.id,state:candidates.length?'sources':provider.lastScan?.returned?'filtered':'empty',count:candidates.length})
  }catch(error){if(!this.disposed)this.rows.set(provider.id,child.signal.aborted?{id:provider.id,state:'timeout',count:0}:providerFailure(provider.id,error))}
  finally{clearTimeout(timer);child.signal.removeEventListener('abort',cancelWait);this.controller.signal.removeEventListener('abort',cancel);this.activeQueries.delete(provider.id)}
  if(!this.disposed){
   const result=this.rows.get(provider.id)
   transportTrace('descoberta',{provider:provider.id,state:result?.state,returned:provider.lastScan?.returned,eligible:result?.count,ms:Math.round(performance.now()-queryStarted)})
   this.publish();this.reconcile()
  }
 }
 private prepareEmbed(){
  const embed=this.embed
  if(!embed)return Promise.resolve()
  if(this.embedPromise)return this.embedPromise
  this.embedPromise=(async()=>{
   this.rows.set('embedmovies',{id:'embedmovies',state:'checking',count:0});this.publish()
   const abort=new AbortController();const cancel=()=>abort.abort();this.controller.signal.addEventListener('abort',cancel,{once:true});let timer:ReturnType<typeof setTimeout>|undefined
   try{
    let fallback=await Promise.race([embed.resolve({mediaId:this.context.media.id,...(this.context.episode?{seasonNumber:this.context.episode.seasonNumber,episodeNumber:this.context.episode.episodeNumber}:{})},abort.signal),new Promise<null>(resolve=>{timer=setTimeout(()=>{abort.abort();resolve(null)},3000)})])
    if(fallback?.availability?.status==='unavailable'&&(fallback.availability.expiresAt??0)>Date.now())fallback=null
    if(this.disposed)return
    this.update({fallback:fallback?{...fallback,title:this.context.media.title}:undefined,...(fallback?{embedLabel:this.label('embedmovies')}:{})});this.rows.set('embedmovies',{id:'embedmovies',state:fallback?'unverified':'empty',count:fallback?1:0})
   }catch{if(!this.disposed)this.rows.set('embedmovies',{id:'embedmovies',state:'network',count:0})}
   finally{if(timer)clearTimeout(timer);this.controller.signal.removeEventListener('abort',cancel);this.embedReady=true}
   if(!this.disposed){this.publish();this.reconcile()}
  })();return this.embedPromise
 }
 async start(){
  if(this.started)return;this.started=true;this.began=Date.now();this.publish()
  if(this.automatic){
   const began=performance.now()
   const confirmed=this.providers.map(provider=>provider.confirmed?.(this.context)).flatMap(item=>item?[item]:[])
    .sort((a,b)=>b.confirmedAt-a.confirmedAt)[0]
   transportTrace('cache-retomada',{hit:!!confirmed,ms:Math.round(performance.now()-began)})
   if(confirmed){
    const candidate={...confirmed.candidate,receivedAt:Date.now(),checkRedirect:false,displayName:this.label(confirmed.candidate.identity)}
    this.candidates=[candidate];this.preferred=confirmed.language
    this.update({language:confirmed.language});this.publish();this.activate(candidate,true);return
   }
   this.candidates=this.providers.flatMap(provider=>(provider.cached?.(this.context)??[]).map(c=>({...c,displayName:this.label(c.identity)})))
   this.publish()
   if(this.available().length){this.reconcile();return}
   await this.discoverAutomatically();return
  }
  const fenix=this.providers.find(p=>p.id==='fenixflix');const brazuca=this.providers.find(p=>p.id==='brazuca')
  const first=fenix?this.lookup(fenix):Promise.resolve()
  const grace=setTimeout(()=>this.reconcile(),PRIORITY_GRACE_MS)
  try{
   if(this.discoverAll){
    await Promise.all([first,...this.providers.filter(p=>p!==fenix).map(async (provider,index)=>{
     await this.delay(BACKGROUND_STAGGER_MS*(index+1));await this.lookup(provider)
    })]);return
   }
   if(brazuca){if(fenix)await this.delay(BACKGROUND_STAGGER_MS);await this.lookup(brazuca)}
   await this.prepareEmbed()
   await first
  }finally{clearTimeout(grace)}
  this.reconcile()
 }
 private async discoverAutomatically(){
  if(this.discoveryStarted||this.disposed)return
  this.discoveryStarted=true
  await Promise.all([...this.providers.map(async(provider,index)=>{
   if(index)await this.delay(index*180)
   await this.lookup(provider)
  }),this.prepareEmbed()])
 }
 private pending(id:string){const state=this.rows.get(id)?.state;return state==='waiting'||state==='checking'}
 private hasLiveSelection(){return !!this.state.runId&&['preparing','buffering','playing','paused','ended','stopped','embedded'].includes(this.state.phase)}
 private reconcile(){
  if(this.disposed||this.hasLiveSelection()||this.state.phase==='sources')return
  if(this.automatic){this.advance();return}
  // Keep the primary head start. Late replies update the menu without changing a live run.
  const primaryPending=this.pending('fenixflix')&&Date.now()-this.began<PRIORITY_GRACE_MS
  const available=this.available()
  const leading=primaryPending?available.filter(c=>c.providerId==='fenixflix'):this.providers.map(p=>available.filter(c=>c.providerId===p.id)).find(items=>items.length)??[]
  const options=[...new Set(leading.flatMap(c=>c.language.modes))]
  if(!this.preferred&&options.includes('dub')&&options.includes('sub')){this.update({phase:'language'});return}
  if(!this.preferred)this.preferred=options[0]
  if(this.preferred)this.update({language:this.preferred})
  this.advance()
 }
 choose(language:LanguageChoice){
  if(!this.available().some(candidate=>candidate.language.modes.includes(language))){this.reconcile();return}
  this.preferred=language;this.update({language});this.advance()
 }
 private activate(candidate:Candidate,confirmedReuse=false){
  const runId=`normal-${++this.serial}-${crypto.randomUUID()}`
  this.confirmedRun=confirmedReuse?runId:undefined
  this.lastCandidate=candidate;this.tried.add(candidate.identity);this.runPlayed=false
  this.attemptStarted=performance.now();this.milestones.clear()
  this.update({phase:'preparing',candidate,duration:0,hasStarted:false,runId,attempts:this.state.attempts+1})
  this.trace(runId,'selecionada',{format:candidate.input?.mimeType??candidate.session?.sources[0]?.type})
  try{candidate.validateStart?.(candidate.engine)}
  catch{this.rejectTransport(runId,'Autorização de reprodução ausente ou expirada.')}
 }
 retryInWeb(runId:string){
  const candidate=this.state.candidate
  if(this.disposed||runId!==this.state.runId||this.runPlayed||candidate?.engine!=='native'||!candidate.session)return false
  this.trace(runId,'alternativa-web',{reason:'Media3 não iniciou; a fonte permite HTML5.'})
  this.activate({...candidate,engine:'web',input:undefined})
  return true
 }
 trace(runId:string,event:string,fields:Record<string,string|number|boolean|undefined>={}){
  if(this.disposed||this.state.runId!==runId||this.milestones.has(event))return
  this.milestones.add(event)
  const candidate=this.state.candidate
  transportTrace(event,{runId,source:candidate?.id,provider:candidate?.providerId,engine:candidate?.engine,attemptMs:Math.round(performance.now()-this.attemptStarted),totalMs:Date.now()-this.began,...fields})
 }
 private advance(){
  if(this.disposed)return
  if(this.automatic){
   const ready=this.available()
   const preference=[...new Set([this.preferred,'dub','sub','unknown'] as const)].filter((mode):mode is LanguageChoice=>!!mode)
   for(const mode of preference){
    const options=ready.filter(source=>source.language.modes.includes(mode)).sort((a,b)=>
     Number(b.resumeKey!==undefined&&b.resumeKey===this.resumeHint?.sourceKey)-Number(a.resumeKey!==undefined&&a.resumeKey===this.resumeHint?.sourceKey)
     ||this.providers.findIndex(p=>p.id===a.providerId)-this.providers.findIndex(p=>p.id===b.providerId)||b.score-a.score)
    if(options[0]){this.preferred=mode;this.update({language:mode});this.activate(options[0]);return}
   }
   if(!this.discoveryStarted){void this.discoverAutomatically();return}
   if(this.providers.some(provider=>this.pending(provider.id))){this.update({phase:'searching'});return}
  }
  const language=this.preferred??'unknown'
  if(this.resumeHint?.sourceKey&&!this.tried.size){
   const remembered=this.candidates.find(c=>c.providerId===this.resumeHint?.providerId&&c.resumeKey===this.resumeHint.sourceKey&&c.language.modes.includes(language)&&Date.now()-c.receivedAt<SOURCE_MAX_AGE_MS)
   if(remembered){this.activate(remembered);return}
   const rememberedProvider=this.resumeHint.providerId
   const otherReady=Date.now()-this.began>=PRIORITY_GRACE_MS&&this.available().some(candidate=>candidate.language.modes.includes(language))
   if(!otherReady&&rememberedProvider&&(this.rows.get(rememberedProvider)?.state==='checking'||(['fenixflix','brazuca'].includes(rememberedProvider)&&this.pending(rememberedProvider)))){
    this.update({phase:'searching'});return
   }
   this.resumeHint.sourceKey=undefined
  }
  for(const id of ALL_PROVIDER_ORDER){
   if(id==='embedmovies'){
    const refresh=this.providers.find(provider=>!this.refreshed.has(provider.id)
     &&this.candidates.some(c=>c.providerId===provider.id&&c.language.modes.includes(language)&&this.transientFailures.has(c.identity)))
    if(refresh){
     this.refreshed.add(refresh.id)
     this.update({candidate:undefined,runId:undefined,phase:'searching'})
     void this.lookup(refresh,language)
     return
    }
    if(this.available().some(c=>c.language.modes.some(mode=>mode!==language))){
     this.update({candidate:undefined,runId:undefined,hasStarted:false,phase:'language-exhausted'});return
    }
    // Expired alternatives must be refreshed before advertising a language switch.
    const stale=this.untried().find(c=>!this.fresh(c)&&!this.refreshed.has(c.providerId))
    const provider=stale&&this.providers.find(p=>p.id===stale.providerId)
    if(provider){
     this.refreshed.add(provider.id)
     this.update({candidate:undefined,runId:undefined,phase:'searching'})
     void this.lookup(provider)
     return
    }
    if(!this.embed)continue
    if(!this.embedReady){this.update({candidate:undefined,runId:undefined,phase:'searching'});return}
    if(this.state.fallback&&!this.embedTried){this.openEmbed();return}
    continue
   }
   const provider=this.providers.find(p=>p.id===id);if(!provider)continue
   const items=this.untried().filter(c=>c.providerId===id&&c.language.modes.includes(language)).sort((a,b)=>b.score-a.score)
   const selected=items.find(c=>this.fresh(c))
   if(selected){this.activate(selected);return}
   if(items.length&&!this.refreshed.has(id)){
    if(this.discoverAll&&this.available().some(c=>c.language.modes.includes(language)))continue
    this.refreshed.add(id);this.update({candidate:undefined,runId:undefined,phase:'searching'});void this.lookup(provider);return
   }
   if(this.pending(id)){
    // An earlier slow provider gets a bounded head start; later usable results may then proceed.
    if((this.discoverAll||id==='fenixflix')&&Date.now()-this.began>=PRIORITY_GRACE_MS&&this.available().some(c=>(this.discoverAll||c.providerId==='brazuca')&&c.language.modes.includes(language)))continue
    this.update({candidate:undefined,runId:undefined,phase:'searching'})
    if(!this.discoverAll&&id!=='fenixflix'&&id!=='brazuca'&&this.rows.get(id)?.state==='waiting')void this.lookup(provider)
    return
   }
  }
  this.update({candidate:undefined,runId:undefined,hasStarted:false,phase:'error'})
 }
 selectSource(id:string,language?:LanguageChoice){
  if(id==='embedmovies'){this.openEmbed(true);return true}
  const candidate=this.candidates.find(c=>c.id===id);if(!candidate)return false
  if(!this.fresh(candidate)){this.showSources();const provider=this.providers.find(p=>p.id===candidate.providerId);if(provider)void this.lookup(provider);return false}
  const mode=language&&candidate.language.modes.includes(language)?language:candidate.language.modes.includes(this.preferred??'unknown')?this.preferred:candidate.language.modes[0]
  this.preferred=mode;this.update({language:mode});this.activate(candidate);return true
 }
 showSources(){if(this.state.phase==='sources')return;this.returnToEmbed=this.state.phase==='embedded';this.update({phase:'sources',candidate:undefined,runId:undefined});if(this.automatic)void this.discoverAutomatically()}
 retryProvider(id:string){const provider=this.providers.find(provider=>provider.id===id);if(!provider||this.disposed||this.activeQueries.has(id))return Promise.resolve();return this.lookup(provider)}
 resume(){
  if(this.returnToEmbed){this.openEmbed(true);return}
  const last=this.lastCandidate
  const exact=last&&this.candidates.find(c=>c.providerId===last.providerId&&c.identity===last.identity)
  if(exact){this.selectSource(exact.id,this.preferred);return}
  this.update({phase:'searching'});this.reconcile()
 }
 position(runId:string,position:number,duration:number){if(runId!==this.state.runId)return;this.update({...(Number.isFinite(position)?{position}:{}),...(Number.isFinite(duration)&&duration>0?{duration}:{})})}
 openEmbed(manual=false){if(!this.state.fallback||this.embedTried&&!manual)return;this.embedTried=true;this.update({phase:'embedded',candidate:undefined,hasStarted:false,runId:`embed-${++this.serial}-${crypto.randomUUID()}`})}
 iframeFailed(runId?:string){if(runId&&runId!==this.state.runId)return;if(!this.state.runId?.startsWith('embed-'))return;this.embedTried=true;this.update({phase:'searching',candidate:undefined,runId:undefined});this.advance()}
 rejectTransport(runId:string,reason:string,status?:number){
  const candidate=this.state.candidate
  if(this.disposed||runId!==this.state.runId||!candidate)return
  this.rejectedTransports.add(candidate.identity)
  this.candidates=this.candidates.filter(item=>item.identity!==candidate.identity)
  this.fail(runId,false,reason,status)
 }
 fail(runId:string,revalidate=false,reason='Falha de reprodução',status?:number){
  if(this.disposed||runId!==this.state.runId)return
  const candidate=this.state.candidate
  if(candidate){
   this.providers.find(provider=>provider.id===candidate.providerId)?.invalidate?.(this.context,candidate.identity)
   this.failed.add(candidate.id)
   if(revalidate&&this.confirmedRun!==runId)this.transientFailures.add(candidate.identity)
  }
  this.trace(runId,'falha',{reason,status})
  this.update({phase:'searching',candidate:undefined,runId:undefined,hasStarted:false,errorStage:this.runPlayed?'playback':'initialization',failedIds:[...this.failed],alternatives:[...this.candidates]})
  this.advance()
 }
 event(runId:string,event:'playing'|'progress'|'paused'|'buffering'|'failed'|'ended'|'closed',position?:number,duration?:number){
  if(this.disposed||runId!==this.state.runId)return
  if(event==='failed'){this.fail(runId);return}
  if(event==='closed'){this.update({phase:'stopped'});return}
  // A browser can emit "playing" before the clock has actually advanced.
  if(event==='playing'&&!this.runPlayed){this.update({phase:'preparing'});return}
  if(event==='progress'){
   const candidate=this.state.candidate
   const now=Date.now()
   if(candidate&&(!this.runPlayed||now-this.lastConfirmation>=4000)){
    this.providers.find(provider=>provider.id===candidate.providerId)?.remember?.(this.context,candidate,this.state.language??'unknown')
    this.lastConfirmation=now
   }
   this.runPlayed=true
   this.trace(runId,'primeiro-avanco',{position})
   if(this.state.candidate)this.failed.delete(this.state.candidate.id)
  }
  const patch:Partial<PlaybackState>={phase:event==='progress'?'playing':event,...(event==='progress'?{hasStarted:true}:{})}
  if(position!==undefined&&Number.isFinite(position))patch.position=Math.max(0,position)
  if(duration!==undefined&&Number.isFinite(duration)&&duration>0)patch.duration=duration
  if(event==='progress')patch.failedIds=[...this.failed]
  this.update(patch)
 }
 dispose(){this.disposed=true;clearTimeout(this.languageExpiry);this.controller.abort();this.listeners.clear()}
}
