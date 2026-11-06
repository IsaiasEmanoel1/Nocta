import {afterEach,expect,it,vi} from 'vitest'
import {PlaybackCoordinator,SOURCE_MAX_AGE_MS,SOURCE_QUERY_BUDGET_MS} from '../playback/coordinator'
import {isCinemaCapture,languageDeclaration} from '../playback/sourcePolicy'
import {FenixFlixProvider,ZeusBrProvider,BrazucaPlayProvider,addonTitle,automaticAddonConfigs,createSourceProviders} from '../playback/providers'
import type {Candidate,SourceProvider,PlaybackContext} from '../playback/providers'
import {AddonError} from '../experimental/StremioAddonAdapter'
import type {Media} from '../domain/media'
const media:Media={id:'tmdb-tv-73223',imdbId:'tt7441658',kind:'tv',title:'Série',overview:'',year:2017,rating:8,genres:[],genreIds:[],poster:'',backdrop:'',cast:[],source:'tmdb'}
const context:PlaybackContext={media,episode:{seasonNumber:1,episodeNumber:2},native:true}
function source(providerId:string,id:string,mode:'dub'|'sub'|'unknown'='dub',engine:'native'|'web'='web'):Candidate{return{id,providerId,identity:id,engine,language:{modes:[mode],dual:false,confirmed:false},score:100,receivedAt:Date.now(),...(engine==='native'?{input:{url:'https://example.test/'+id,mimeType:'video/x-matroska'}}:{session:{id:media.id,title:media.title,sources:[{src:'https://example.test/'+id,type:'video/mp4'}],poster:'',sourceLabel:'',attribution:'',license:{name:'',url:'',projectUrl:''}}})}}
function provider(id:string,items:Candidate[]|Error):SourceProvider{return{id,find:vi.fn(async()=>{if(items instanceof Error)throw items;return items})}}
const iframe={id:media.id,title:'Alternativo',sources:[],poster:'',sourceLabel:'',attribution:'',license:{name:'',url:'',projectUrl:''},isIframe:true,iframeUrl:'https://example.test/player'}
const embed=()=>({resolve:vi.fn(async()=>iframe)})
afterEach(()=>vi.useRealTimers())
it.each(['native','web'] as const)('keeps Fenix priority with %s even if later providers finish first',async engine=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f','dub',engine)]),provider('zeus',[source('zeus','z')]),provider('brazuca',[source('brazuca','b')])],embed(),context)
 await c.start();expect(c.state.candidate?.id).toBe('f');expect(c.state.phase).toBe('preparing');c.dispose()
})
it('queries reserves lazily in the configured order before EmbedMovies',async()=>{
 const fallback=embed()
 const reserves=['bscine','magnetflix','zeus','vetela'].map(id=>provider(id,[source(id,id)]))
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f')]),...reserves,provider('brazuca',[source('brazuca','b')])],fallback,context)
 await c.start();const old=c.state.runId!;c.event(old,'failed');expect(c.state.candidate?.id).toBe('b');c.event(old,'progress',99);expect(c.state.position).toBe(0)
 for(const reserve of reserves){
  expect(reserve.find).not.toHaveBeenCalled()
  c.event(c.state.runId!,'failed')
  await vi.waitFor(()=>expect(c.state.candidate?.id).toBe(reserve.id))
 }
 c.event(c.state.runId!,'failed');await vi.waitFor(()=>expect(c.state.phase).toBe('embedded'))
 expect(fallback.resolve).toHaveBeenCalledWith({mediaId:media.id,seasonNumber:1,episodeNumber:2},expect.any(AbortSignal))
 c.iframeFailed();expect(c.state.phase).toBe('error');c.dispose()
})
it('starts all six experimental lookups in order without switching a live run',async()=>{
 vi.useFakeTimers()
 const ids=['fenixflix','brazuca','bscine','magnetflix','zeus-beta','vetela']
 const calls:string[]=[]
 const providers=ids.map(id=>({id,find:vi.fn(async()=>{calls.push(id);return [source(id,id)]})}))
 const coordinator=new PlaybackCoordinator(providers,undefined,context,undefined,undefined,true)
 try{
  const discovery=coordinator.start()
  await vi.advanceTimersByTimeAsync(10)
  const run=coordinator.state.runId!
  coordinator.event(run,'progress',3)
  expect(calls).toEqual(['fenixflix'])
  await vi.advanceTimersByTimeAsync(3500);await discovery
  expect(calls).toEqual(ids)
  expect(coordinator.state).toMatchObject({phase:'playing',runId:run,attempts:1})
  expect(coordinator.state.alternatives).toHaveLength(6)
 }finally{coordinator.dispose()}
})
it('uses a warm candidate immediately and discovers other providers only after it fails',async()=>{
 vi.useFakeTimers()
 const cached=source('fenixflix','cached','sub'), next=source('brazuca','new','dub')
 const fenix={...provider('fenixflix',[]),cached:()=>[cached],invalidate:vi.fn()}
 const brazuca=provider('brazuca',[next])
 const c=new PlaybackCoordinator([fenix,brazuca],undefined,context,undefined,undefined,true,true)
 try{
  await c.start()
  expect(c.state.candidate?.id).toBe('cached')
  expect(fenix.find).not.toHaveBeenCalled();expect(brazuca.find).not.toHaveBeenCalled()
  c.fail(c.state.runId!)
  await vi.advanceTimersByTimeAsync(180)
  expect(fenix.invalidate).toHaveBeenCalledWith(context,cached.identity)
  expect(c.state.candidate?.id).toBe('new')
 }finally{c.dispose()}
})
it('separates empty, HTTP and timeout outcomes; failure of one addon does not stop others',async()=>{
 const c=new PlaybackCoordinator([provider('fenixflix',new AddonError('http','503')),provider('zeus',new AddonError('timeout','timeout')),provider('brazuca',[source('brazuca','b')])],embed(),context)
 await c.start();expect(c.state.outcomes.map(o=>o.state)).toEqual(['http','sources','waiting','unverified']);expect(c.state.candidate?.providerId).toBe('brazuca');c.dispose()
})
it.each(['dub','sub','unknown'] as const)('a single %s mode starts without a language selector',async mode=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f',mode)])],embed(),context);await c.start();expect(c.state.phase).toBe('preparing');expect(c.state.language).toBe(mode);c.dispose()
})
it('offers exactly the two declared versions and never silently changes the chosen audio',async()=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f','dub'),source('fenixflix','s','sub')]),provider('zeus',[source('zeus','z','dub')])],embed(),context)
 await c.start()
 expect(c.state.phase).toBe('language')
 expect(c.state.options.sort()).toEqual(['dub','sub'])
 c.choose('dub')
 c.event(c.state.runId!,'failed')
 await vi.waitFor(()=>expect(c.state.candidate?.id).toBe('z'))
 c.event(c.state.runId!,'failed')
 expect(c.state.phase).toBe('language-exhausted')
 expect(c.state.language).toBe('dub')
 expect(c.state.options).toEqual(['sub'])
 c.choose('sub')
 expect(c.state.candidate?.id).toBe('s')
 c.event(c.state.runId!,'failed')
 expect(c.state.phase).toBe('embedded')
 c.dispose()
})
it('exhausts distinct prioritized transports before opening the iframe',async()=>{
 const fenix=provider('fenixflix',['f1','f2','f3'].map(id=>source('fenixflix',id)))
 const duplicate={...source('brazuca','b1'),identity:'f1'}
 const brazuca=provider('brazuca',[duplicate,source('brazuca','b2')])
 const c=new PlaybackCoordinator([fenix,brazuca],embed(),context)
 await c.start()
 for(const id of ['f1','f2','f3','b2']){
  expect(c.state.candidate?.id).toBe(id)
  c.event(c.state.runId!,'failed')
 }
 expect(c.state.phase).toBe('embedded')
 expect(c.state.failedIds).toEqual(['f1','f2','f3','b2'])
 expect(c.state.outcomes.slice(0,2).map(row=>row.state)).toEqual(['sources','sources'])
 c.dispose()
})
it('does not switch paused/background playback; resumes with a new session token and preserved position',async()=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f'),source('fenixflix','g')])],embed(),context);await c.start();const old=c.state.runId!;c.event(old,'progress',120,300);c.event(old,'paused');expect(c.state.candidate?.id).toBe('f');expect(c.state.attempts).toBe(1);c.resume();expect(c.state.runId).not.toBe(old);expect(c.state.position).toBe(120);c.event(old,'failed');expect(c.state.candidate?.id).toBe('f');c.event(c.state.runId!,'failed');expect(c.state.candidate?.id).toBe('g');expect(c.state.position).toBe(120);c.dispose()
})
it('does not repeat failed sources or use stale links; a new episode is a new lookup',async()=>{
 const expired=source('fenixflix','expired');expired.receivedAt-=SOURCE_MAX_AGE_MS+1
 const p=provider('fenixflix',[expired,source('fenixflix','fresh')]);const c=new PlaybackCoordinator([p],embed(),context);await c.start();expect(c.state.candidate?.id).toBe('fresh');c.event(c.state.runId!,'failed');await vi.waitFor(()=>expect(c.state.phase).toBe('embedded'));expect(c.state.attempts).toBe(1);c.dispose()
 const calls=vi.mocked(p.find).mock.calls.length;const next=new PlaybackCoordinator([p],embed(),{...context,episode:{seasonNumber:2,episodeNumber:1}},'dub');await next.start();expect(p.find).toHaveBeenCalledTimes(calls+1);expect(p.find).toHaveBeenLastCalledWith(expect.objectContaining({episode:{seasonNumber:2,episodeNumber:1}}),expect.any(AbortSignal));next.dispose()
})
it.each(['CAM','HDCAM','CAMRip','HD-CAM','[TS]','Telesync','HDTS'])('rejects cinema capture %s',quality=>expect(isCinemaCapture('Título '+quality+' 1080p')).toBe(true))
it.each(['HLS MPEG-TS','segment.ts','Broadcast TS stream','1080p WEB-DL','Camila','https://example.test/cam/file.m3u8'])('keeps non-CAM classification %s',quality=>expect(isCinemaCapture(quality)).toBe(false))
it('dual audio does not invent a subtitle version or confirm speech',()=>{
 expect(languageDeclaration({name:'Vídeo',description:'🇧🇷 Dual Áudio',declaredLanguages:[]})).toEqual({modes:['dub'],dual:true,confirmed:false})
 expect(languageDeclaration({name:'Dual áudio',description:'',declaredLanguages:[]})).toEqual({modes:['unknown'],dual:true,confirmed:false})
 expect(languageDeclaration({name:'Dual/Leg',description:'Legendado',declaredLanguages:[]})).toMatchObject({modes:['sub'],dual:true})
})
it('only uses verified external IMDb/TMDB mapping; never invents an addon-specific ID',()=>{
 expect(addonTitle(context,automaticAddonConfigs[1])).toEqual({type:'series',imdb:'tt7441658',episode:context.episode})
 expect(()=>addonTitle({...context,media:{...media,imdbId:undefined}},automaticAddonConfigs[1])).toThrow(/IMDb/)
})
function mockedFetch(streams:unknown[]){return vi.fn<typeof fetch>(async url=>new Response(JSON.stringify(String(url).endsWith('manifest.json')?{id:'fixture',name:'Fixture',version:'1',resources:['stream'],types:['movie','series'],idPrefixes:['tt'],catalogs:[]}:{streams})))}
it.each(['mp4','m3u8','mkv'])('normalizes trusted %s source for native without a false web classification',async extension=>{
 const fetcher=mockedFetch([{name:'Fenix 1080p',description:'Dublado',url:'https://cdn-sv01.maximaimg.online/video.'+extension}])
 const items=await new FenixFlixProvider(fetcher).find(context,new AbortController().signal);expect(items).toHaveLength(1);expect(items[0].engine).toBe('native');expect(items[0].input?.mimeType).toBe(extension==='m3u8'?'application/vnd.apple.mpegurl':extension==='mkv'?'video/x-matroska':'video/mp4')
})
it('CAM-only and zero responses allow the next provider; preserves Fenix configuration prefix',async()=>{
 const fetcher=mockedFetch([{name:'Fenix HDCAM',description:'Dublado',url:'https://cdn-sv01.maximaimg.online/movie.mp4'}]);const f=new FenixFlixProvider(fetcher)
 const c=new PlaybackCoordinator([f,provider('zeus',[source('zeus','z')])],embed(),context);await c.start();await vi.waitFor(()=>expect(c.state.candidate?.id).toBe('z'));expect(fetcher.mock.calls[1][0]).toContain('qualities=4k');expect(fetcher.mock.calls[1][0]).toContain('tt7441658%3A1%3A2');c.dispose()
 expect(await new ZeusBrProvider(mockedFetch([])).find(context,new AbortController().signal)).toEqual([])
})
it('normalizes real declared origins of Zeus and Brazuca and refuses private/torrent destinations',async()=>{
 const z=await new ZeusBrProvider(mockedFetch([{url:'https://nsrv.classotaku.app/fixture.mp4',description:'Legendado'}])).find({...context,native:false},new AbortController().signal);expect(z[0].engine).toBe('web')
 const b=await new BrazucaPlayProvider(mockedFetch([{url:'https://brazuca-play-stremio.vercel.app/fixture.m3u8',description:'Dublado'},{url:'http://127.0.0.1/private.mp4'},{infoHash:'secret'},{url:'https://unknown.test/movie.mp4'}])).find(context,new AbortController().signal);expect(b).toHaveLength(1);expect(b[0].engine).toBe('native')
})

it('finishes with a friendly error when even the iframe provider has no session',async()=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[])],{resolve:async()=>null},context);await c.start();expect(c.state.phase).toBe('error');c.dispose()
})
it('closes the discovery budget and stops when the embedded provider is disabled',async()=>{
 vi.useFakeTimers()
 const find=vi.fn<SourceProvider['find']>(()=>new Promise(()=>{}))
 const c=new PlaybackCoordinator([{id:'fenixflix',find}],undefined,context)
 const task=c.start()
 await vi.advanceTimersByTimeAsync(SOURCE_QUERY_BUDGET_MS+1)
 await task
 expect(find.mock.calls[0][1].aborted).toBe(true)
 expect(c.state).toMatchObject({phase:'error',outcomes:[{id:'fenixflix',state:'timeout',count:0}]})
 expect(c.state.runId).toBeUndefined()
 c.dispose()
})
it('bounds hung provider queries even if a provider ignores cancellation',async()=>{
 vi.useFakeTimers();const hung:SourceProvider={id:'fenixflix',find:()=>new Promise(()=>{})};const c=new PlaybackCoordinator([hung,provider('zeus',[source('zeus','z')]),provider('brazuca',[])],embed(),context);const task=c.start();await vi.advanceTimersByTimeAsync(14001);await task;expect(c.state.outcomes[0].state).toBe('timeout');expect(c.state.candidate?.id).toBe('z');c.event(c.state.runId!,'failed');expect(c.state.phase).toBe('embedded');c.dispose()
})

it('publishes the first Fenix source before a slow background query completes',async()=>{
 vi.useFakeTimers();let finish!:(items:Candidate[])=>void
 const b:SourceProvider={id:'brazuca',find:()=>new Promise(resolve=>{finish=resolve})}
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f')]),b],embed(),context)
 const task=c.start();await vi.advanceTimersByTimeAsync(1);expect(c.state.candidate?.id).toBe('f')
 const run=c.state.runId!;c.event(run,'progress',20,200);await vi.advanceTimersByTimeAsync(700);finish([source('brazuca','b','sub')]);await task
 expect(c.state.runId).toBe(run);expect(c.state.phase).toBe('playing');expect(c.state.alternatives.map(c=>c.id)).toEqual(['f','b']);expect(c.state.options).toEqual(['sub']);c.dispose()
})

it('separates a provider response and candidate selection from advancing playback',async()=>{
 const fenix=provider('fenixflix',[source('fenixflix','f')])
 const reserve=provider('bscine',[source('bscine','s')])
 const c=new PlaybackCoordinator([fenix,reserve],undefined,context)
 await c.start()
 const run=c.state.runId!
 expect(c.state.outcomes[0]).toMatchObject({state:'sources',count:1})
 expect(c.state).toMatchObject({phase:'preparing',hasStarted:false})
 c.event(run,'playing')
 expect(c.state).toMatchObject({phase:'preparing',hasStarted:false})
 c.event(run,'progress',1,100)
 expect(c.state).toMatchObject({phase:'playing',hasStarted:true})
 expect(reserve.find).not.toHaveBeenCalled()
 c.dispose()
})

it('waits for late results, tries the next dub and only then offers an untried sub',async()=>{
 vi.useFakeTimers()
 const fenix=provider('fenixflix',[source('fenixflix','f')])
 const brazuca=provider('brazuca',[])
 let finish!:(items:Candidate[])=>void
 vi.mocked(brazuca.find).mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 const c=new PlaybackCoordinator([fenix,brazuca],undefined,context,'dub')
 const task=c.start();await vi.advanceTimersByTimeAsync(701)
 c.fail(c.state.runId!)
 expect(c.state).toMatchObject({phase:'searching',options:[],failedIds:['f']})
 finish([source('brazuca','b'),source('brazuca','s','sub')]);await task
 expect(c.state.candidate?.id).toBe('b')
 c.fail(c.state.runId!)
 expect(c.state).toMatchObject({phase:'language-exhausted',options:['sub'],failedIds:['f','b']})
 c.choose('dub')
 expect(c.state).toMatchObject({phase:'language-exhausted',options:['sub']})
 c.choose('sub')
 expect(c.state.candidate?.id).toBe('s')
 c.fail(c.state.runId!)
 expect(c.state).toMatchObject({phase:'error',options:[],failedIds:['f','b','s']})
 expect(fenix.find).toHaveBeenCalledOnce();expect(brazuca.find).toHaveBeenCalledOnce();c.dispose()
})

it('withdraws an expired language offer during a single revalidation',async()=>{
 vi.useFakeTimers()
 const p=provider('fenixflix',[source('fenixflix','s','sub')])
 const c=new PlaybackCoordinator([p],undefined,context,'dub')
 await c.start()
 expect(c.state).toMatchObject({phase:'language-exhausted',options:['sub']})
 let finish!:(items:Candidate[])=>void
 vi.mocked(p.find).mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 await vi.advanceTimersByTimeAsync(SOURCE_MAX_AGE_MS)
 expect(c.state).toMatchObject({phase:'searching',options:[]})
 finish([]);await vi.advanceTimersByTimeAsync(1)
 expect(c.state).toMatchObject({phase:'error',options:[]})
 expect(p.find).toHaveBeenCalledTimes(2);c.dispose()
})

it('does not restore a failed language choice when the optional iframe lookup publishes',async()=>{
 const dual=source('fenixflix','dual')
 dual.language.modes=['dub','sub']
 const dub=source('fenixflix','d')
 let finish!:()=>void
 const fallback={resolve:()=>new Promise<typeof iframe>(resolve=>{finish=()=>resolve(iframe)})}
 const c=new PlaybackCoordinator([provider('fenixflix',[dual,dub])],fallback,context,'sub')
 const task=c.start()
 await vi.waitFor(()=>expect(c.state.candidate?.id).toBe('dual'))
 c.fail(c.state.runId!)
 expect(c.state).toMatchObject({phase:'language-exhausted',options:['dub']})
 finish();await task
 expect(c.state).toMatchObject({phase:'language-exhausted',options:['dub']})
 c.choose('dub')
 expect(c.state.candidate?.id).toBe('d')
 c.dispose()
})

it('starts a declared version when history only had an unlabelled iframe',async()=>{
 const dub=source('fenixflix','d')
 const c=new PlaybackCoordinator([provider('fenixflix',[dub])],undefined,context,'unknown',{position:15,sourceKey:'embedmovies',providerId:'embedmovies'})
 await c.start()
 expect(c.state).toMatchObject({phase:'preparing',language:'dub',position:15,candidate:{id:'d'}})
 c.dispose()
})
it('gives Fenix a bounded head start and starts Brazuca while Fenix is still checking',async()=>{
 vi.useFakeTimers();let finish!:(items:Candidate[])=>void
 const f:SourceProvider={id:'fenixflix',find:()=>new Promise(resolve=>{finish=resolve})}
 const c=new PlaybackCoordinator([f,provider('brazuca',[source('brazuca','b')])],embed(),context);const task=c.start()
 await vi.advanceTimersByTimeAsync(2201);expect(c.state.candidate?.id).toBe('b');expect(c.state.outcomes[0].state).toBe('checking')
 const run=c.state.runId!;finish([source('fenixflix','f')]);await task;expect(c.state.runId).toBe(run);c.dispose()
})
it('manual selection preserves position and invalidates callbacks from the previous source',async()=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f')]),provider('brazuca',[source('brazuca','b')])],embed(),context);await c.start()
 const old=c.state.runId!;c.event(old,'progress',75,300);c.showSources();expect(c.state.runId).toBeUndefined();expect(c.state.phase).toBe('sources')
 c.selectSource('b');const current=c.state.runId!;expect(c.state.position).toBe(75);c.event(old,'ended');expect(c.state.runId).toBe(current);expect(c.state.phase).toBe('preparing');c.dispose()
})
it('cancels in-flight queries when leaving without letting late results restart playback',async()=>{
 vi.useFakeTimers();let signal:AbortSignal|undefined;let finish!:(items:Candidate[])=>void
 const p:SourceProvider={id:'fenixflix',find:(_,s)=>{signal=s;return new Promise(resolve=>{finish=resolve})}}
 const c=new PlaybackCoordinator([p],embed(),context);const task=c.start();c.dispose();finish([source('fenixflix','late')]);await task
 expect(signal?.aborted).toBe(true);expect(c.state.candidate).toBeUndefined()
})

it.each(['dub','sub'] as const)('choosing %s reuses sources and goes straight to preparing media, never restarts discovery',async language=>{
 const p=provider('fenixflix',[source('fenixflix','d','dub'),source('fenixflix','s','sub')]);const c=new PlaybackCoordinator([p],embed(),context);await c.start();expect(c.state.phase).toBe('language');const phases:string[]=[];c.subscribe(state=>phases.push(state.phase));c.choose(language);expect(c.state.candidate?.id).toBe(language==='dub'?'d':'s');expect(c.state.phase).toBe('preparing');expect(phases).not.toContain('searching');expect(p.find).toHaveBeenCalledOnce();c.dispose()
})
it('defaults to three integrations with Zeus opt-in only, without removing its implementation',()=>{
 expect(createSourceProviders().map(p=>p.id)).toEqual(['fenixflix','brazuca']);expect(createSourceProviders({enableZeus:true}).map(p=>p.id)).toEqual(['fenixflix','brazuca','zeus'])
})
it('retries an individual timed-out query and accepts fresh sources without reopening the iframe or caching absence',async()=>{
 vi.useFakeTimers();const p=provider('fenixflix',[]);vi.mocked(p.find).mockImplementationOnce(()=>new Promise(()=>{}));const fallback=embed();const c=new PlaybackCoordinator([p],fallback,context);const task=c.start();await vi.advanceTimersByTimeAsync(SOURCE_QUERY_BUDGET_MS+1);await task;expect(c.state.outcomes[0].state).toBe('timeout');expect(c.state.phase).toBe('embedded');c.showSources();vi.mocked(p.find).mockResolvedValue([source('fenixflix','recovered')]);await c.retryProvider('fenixflix');expect(c.state.phase).toBe('sources');expect(c.state.outcomes[0].state).toBe('sources');expect(c.state.failedIds).toEqual([]);expect(c.selectSource('recovered')).toBe(true);expect(c.state.phase).toBe('preparing');expect(fallback.resolve).toHaveBeenCalledOnce();c.dispose()
})
it('allows a measured late response to supply a candidate before the iframe opens',async()=>{
 vi.useFakeTimers()
 const fenix=provider('fenixflix',[])
 vi.mocked(fenix.find).mockImplementation(()=>new Promise(resolve=>{
  setTimeout(()=>resolve([source('fenixflix','late')]),7200)
 }))
 const c=new PlaybackCoordinator([fenix,provider('brazuca',[])],embed(),context)
 const task=c.start()
 await vi.advanceTimersByTimeAsync(7000)
 expect(c.state.phase).toBe('searching')
 expect(c.state.outcomes[0].state).toBe('checking')
 await vi.advanceTimersByTimeAsync(200)
 await task
 expect(c.state.candidate?.id).toBe('late')
 c.dispose()
})
it('normalizes the exact series T1/E1 with a reviewed HTTPS HLS source and does not admit the HTTP or opaque header-dependent lines',async()=>{
 const fetcher=mockedFetch([{name:'HLS Dublado 1080p',url:'https://embedplayer2.xyz/controlled/master.m3u8'},{name:'Dublado 1080p',description:'Outro título',url:'http://shd7.oneplayer.site/controlled.mp4'},{name:'Legendado',url:'https://abyssplayer.com/opaque',behaviorHints:{proxyHeaders:{request:{Referer:'https://example.test', 'User-Agent':'fixture'}}}}]);const series={...media,id:'tmdb-tv-289517',imdbId:'tt36458668',title:'Um Trabalho do Inferno',year:2026};const items=await new FenixFlixProvider(fetcher).find({media:series,episode:{seasonNumber:1,episodeNumber:1},native:true},new AbortController().signal);expect(String(fetcher.mock.calls[1][0])).toContain('/stream/series/tt36458668%3A1%3A1.json');expect(items).toHaveLength(1);expect(items[0].input?.mimeType).toBe('application/vnd.apple.mpegurl')
})
it('starts Brazuca before an unfinished embed preparation and only shows fallback search after primary absence',async()=>{
 vi.useFakeTimers();let finish!:(session:typeof iframe)=>void;const fallback={resolve:()=>new Promise<typeof iframe>(resolve=>{finish=resolve})};const c=new PlaybackCoordinator([provider('fenixflix',[]),provider('brazuca',[source('brazuca','b')])],fallback,context);expect(c.state.phase).toBe('searching');const task=c.start();await vi.advanceTimersByTimeAsync(1);expect(c.state.outcomes[0].state).toBe('empty');await vi.advanceTimersByTimeAsync(700);expect(c.state.candidate?.id).toBe('b');const run=c.state.runId;finish(iframe);await task;expect(c.state.runId).toBe(run);c.dispose()
})
it('does not let a background second language interrupt the primary head start or force a choice for a single primary version',async()=>{
 vi.useFakeTimers();let finish!:(items:Candidate[])=>void;const f:SourceProvider={id:'fenixflix',find:()=>new Promise(resolve=>{finish=resolve})};const c=new PlaybackCoordinator([f,provider('brazuca',[source('brazuca','b','dub'),source('brazuca','s','sub')])],embed(),context);const task=c.start();await vi.advanceTimersByTimeAsync(800);expect(c.state.phase).toBe('searching');finish([source('fenixflix','f','dub')]);await task;expect(c.state.candidate?.id).toBe('f');expect(c.state.phase).toBe('preparing');expect(c.state.options).toContain('sub');c.dispose()
})
it('numbers concrete sources once and never exposes vendor names through their display labels',async()=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f'),source('fenixflix','g')]),provider('brazuca',[source('brazuca','b')])],embed(),context);await c.start();const labels=c.state.alternatives.map(c=>c.displayName);expect(new Set(labels).size).toBe(3);expect(labels.every(s=>/^Servidor \d+$/.test(s!))).toBe(true);c.showSources();c.selectSource('b');expect(c.state.alternatives.map(c=>c.displayName)).toEqual(labels);c.dispose()
})
it.each([true,false])('fresh discovery restores saved server when present=%s and otherwise recovers with another source at the saved time',async present=>{
 const f=source('fenixflix','f'),b=source('brazuca','b');f.resumeKey='fenixflix:a';b.resumeKey='brazuca:b';const c=new PlaybackCoordinator([provider('fenixflix',[f]),provider('brazuca',present?[b]:[])],embed(),context,'dub',{position:123,duration:500,sourceKey:'brazuca:b',providerId:'brazuca'});await c.start();expect(c.state.candidate?.id).toBe(present?'b':'f');expect(c.state.position).toBe(123);expect(c.state.language).toBe('dub');c.dispose()
})
it('does not offer a verified unavailable iframe, but does not treat stale evidence as a permanent block',async()=>{
 for(const expired of [false,true]){const c=new PlaybackCoordinator([provider('fenixflix',[])],{resolve:async()=>({...iframe,availability:{key:media.id,status:'unavailable',source:'controlled-evidence',checkedAt:Date.now(),expiresAt:Date.now()+(expired?-1000:10000)}})},context);await c.start();expect(c.state.phase).toBe(expired?'embedded':'error');expect(c.state.hasStarted).not.toBe(true);c.dispose()}
})
it.each([false,true])('keeps the exact 2013 Barbie movie mapping and both Brazuca HLS candidates with native=%s',async native=>{
 const fetcher=mockedFetch([{name:'Brazuca VIP Dublado',url:'https://brazuca-play-stremio.vercel.app/test.m3u8'},{name:'Brazuca VIP Dual/Leg',url:'https://brazuca-play-stremio.vercel.app/test-sub.m3u8'}]);const result=await new BrazucaPlayProvider(fetcher).find({media:{...media,id:'tmdb-movie-196254',kind:'movie',title:'Barbie Butterfly e a Princesa Fairy',year:2013,imdbId:'tt2946582'},native},new AbortController().signal);expect(result).toHaveLength(2);expect(fetcher.mock.calls[1][0]).toBe('https://brazuca-play-stremio.vercel.app/stream/movie/tt2946582.json');expect(result.map(c=>c.language.modes)).toEqual([['dub'],['sub']]);expect(result.every(c=>c.engine===(native?'native':'web'))).toBe(true)
})
it('revalidates only once after a network failure and can retry a freshly announced HLS master',async()=>{
 const initial=source('fenixflix','hls','dub','native')
 initial.input={...initial.input!,mimeType:'application/vnd.apple.mpegurl'}
 const p=provider('fenixflix',[initial])
 vi.mocked(p.find).mockResolvedValueOnce([initial]).mockResolvedValueOnce([{...initial,receivedAt:Date.now()}])
 const c=new PlaybackCoordinator([p],embed(),context,'dub')
 await c.start()
 const run=c.state.runId!
 c.event(run,'progress',42,120)
 c.fail(run,true)
 await vi.waitFor(()=>expect(c.state.attempts).toBe(2))
 expect(c.state.runId).not.toBe(run)
 expect(c.state.position).toBe(42)
 expect(c.state.language).toBe('dub')
 c.fail(c.state.runId!,true)
 expect(c.state.phase).toBe('embedded')
 expect(p.find).toHaveBeenCalledTimes(2)
 c.dispose()
})

it('tries a different provider before revalidating and does not automatically reuse an unchanged MP4',async()=>{
 const initial=source('fenixflix','first')
 const p=provider('fenixflix',[initial])
 const b=provider('brazuca',[source('brazuca','alternative')])
 const c=new PlaybackCoordinator([p,b],embed(),context,'dub')
 await c.start()
 c.fail(c.state.runId!,true)
 expect(c.state.candidate?.id).toBe('alternative')
 expect(p.find).toHaveBeenCalledOnce()
 c.fail(c.state.runId!)
 await vi.waitFor(()=>expect(c.state.phase).toBe('embedded'))
 expect(p.find).toHaveBeenCalledTimes(2)
 expect(c.state.attempts).toBe(2)
 c.dispose()
})
