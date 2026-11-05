import {afterEach,expect,it,vi} from 'vitest'
import {PlaybackCoordinator,SOURCE_MAX_AGE_MS} from '../playback/coordinator'
import {isCinemaCapture,languageDeclaration} from '../playback/sourcePolicy'
import {FenixFlixProvider,ZeusBrProvider,BrazucaPlayProvider,addonTitle,automaticAddonConfigs} from '../playback/providers'
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
it('fails Fenix, then Brazuca, offers EmbedMovies, and only then uses Zeus',async()=>{
 const fallback=embed();const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f')]),provider('zeus',[source('zeus','z')]),provider('brazuca',[source('brazuca','b')])],fallback,context)
 await c.start();const old=c.state.runId!;c.event(old,'failed');expect(c.state.candidate?.id).toBe('b');c.event(old,'progress',99);expect(c.state.position).toBe(0)
 c.event(c.state.runId!,'failed');await vi.waitFor(()=>expect(c.state.phase).toBe('embed-offer'))
 expect(fallback.resolve).toHaveBeenCalledWith({mediaId:media.id,seasonNumber:1,episodeNumber:2},expect.any(AbortSignal))
 c.openEmbed();expect(c.state.phase).toBe('embedded');c.iframeFailed();expect(c.state.candidate?.id).toBe('z');c.event(c.state.runId!,'failed');expect(c.state.phase).toBe('error');c.dispose()
})
it('separates empty, HTTP and timeout outcomes; failure of one addon does not stop others',async()=>{
 const c=new PlaybackCoordinator([provider('fenixflix',new AddonError('http','503')),provider('zeus',new AddonError('timeout','timeout')),provider('brazuca',[source('brazuca','b')])],embed(),context)
 await c.start();expect(c.state.outcomes.map(o=>o.state)).toEqual(['http','sources','unverified','timeout']);expect(c.state.candidate?.providerId).toBe('brazuca');c.dispose()
})
it.each(['dub','sub','unknown'] as const)('a single %s mode starts without a language selector',async mode=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f',mode)])],embed(),context);await c.start();expect(c.state.phase).toBe('preparing');expect(c.state.language).toBe(mode);c.dispose()
})
it('offers exactly the two declared versions and never silently changes the chosen audio',async()=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f','dub'),source('fenixflix','s','sub')]),provider('zeus',[source('zeus','z','dub')])],embed(),context)
 await c.start();expect(c.state.phase).toBe('language');expect(c.state.options.sort()).toEqual(['dub','sub']);c.choose('dub');c.event(c.state.runId!,'failed');expect(c.state.phase).toBe('embed-offer');expect(c.state.language).toBe('dub');c.openEmbed();c.iframeFailed();expect(c.state.candidate?.id).toBe('z');c.event(c.state.runId!,'failed');expect(c.state.language).toBe('dub');c.choose('sub');expect(c.state.candidate?.id).toBe('s');c.dispose()
})
it('does not switch paused/background playback; resumes with a new session token and preserved position',async()=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f'),source('fenixflix','g')])],embed(),context);await c.start();const old=c.state.runId!;c.event(old,'progress',120,300);c.event(old,'paused');expect(c.state.candidate?.id).toBe('f');expect(c.state.attempts).toBe(1);c.resume();expect(c.state.runId).not.toBe(old);expect(c.state.position).toBe(120);c.event(old,'failed');expect(c.state.candidate?.id).toBe('f');c.event(c.state.runId!,'failed');expect(c.state.candidate?.id).toBe('g');expect(c.state.position).toBe(120);c.dispose()
})
it('does not repeat failed sources or use stale links; a new episode is a new lookup',async()=>{
 const expired=source('fenixflix','expired');expired.receivedAt-=SOURCE_MAX_AGE_MS+1
 const p=provider('fenixflix',[expired,source('fenixflix','fresh')]);const c=new PlaybackCoordinator([p],embed(),context);await c.start();expect(c.state.candidate?.id).toBe('fresh');c.event(c.state.runId!,'failed');await vi.waitFor(()=>expect(c.state.phase).toBe('embed-offer'));expect(c.state.attempts).toBe(1);c.dispose()
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
 const c=new PlaybackCoordinator([f,provider('zeus',[source('zeus','z')])],embed(),context);await c.start();expect(c.state.phase).toBe('embed-offer');c.openEmbed();c.iframeFailed();expect(c.state.candidate?.id).toBe('z');expect(fetcher.mock.calls[1][0]).toContain('qualities=4k');expect(fetcher.mock.calls[1][0]).toContain('tt7441658%3A1%3A2');c.dispose()
 expect(await new ZeusBrProvider(mockedFetch([])).find(context,new AbortController().signal)).toEqual([])
})
it('normalizes real declared origins of Zeus and Brazuca and refuses private/torrent destinations',async()=>{
 const z=await new ZeusBrProvider(mockedFetch([{url:'https://nsrv.classotaku.app/fixture.mp4',description:'Legendado'}])).find({...context,native:false},new AbortController().signal);expect(z[0].engine).toBe('web')
 const b=await new BrazucaPlayProvider(mockedFetch([{url:'https://brazuca-play-stremio.vercel.app/fixture.m3u8',description:'Dublado'},{url:'http://127.0.0.1/private.mp4'},{infoHash:'secret'},{url:'https://unknown.test/movie.mp4'}])).find(context,new AbortController().signal);expect(b).toHaveLength(1);expect(b[0].engine).toBe('native')
})

it('finishes with a friendly error when even the iframe provider has no session',async()=>{
 const c=new PlaybackCoordinator([provider('fenixflix',[])],{resolve:async()=>null},context);await c.start();expect(c.state.phase).toBe('error');c.dispose()
})
it('bounds hung provider queries even if a provider ignores cancellation',async()=>{
 vi.useFakeTimers();const hung:SourceProvider={id:'fenixflix',find:()=>new Promise(()=>{})};const c=new PlaybackCoordinator([hung,provider('zeus',[source('zeus','z')]),provider('brazuca',[])],embed(),context);const task=c.start();await vi.advanceTimersByTimeAsync(14001);await task;expect(c.state.outcomes[0].state).toBe('timeout');expect(c.state.phase).toBe('embed-offer');c.openEmbed();c.iframeFailed();expect(c.state.candidate?.id).toBe('z');c.dispose()
})

it('publishes the first Fenix source before a slow background query completes',async()=>{
 vi.useFakeTimers();let finish!:(items:Candidate[])=>void
 const b:SourceProvider={id:'brazuca',find:()=>new Promise(resolve=>{finish=resolve})}
 const c=new PlaybackCoordinator([provider('fenixflix',[source('fenixflix','f')]),b],embed(),context)
 const task=c.start();await vi.advanceTimersByTimeAsync(1);expect(c.state.candidate?.id).toBe('f')
 const run=c.state.runId!;c.event(run,'progress',20,200);await vi.advanceTimersByTimeAsync(700);finish([source('brazuca','b','sub')]);await task
 expect(c.state.runId).toBe(run);expect(c.state.phase).toBe('playing');expect(c.state.alternatives.map(c=>c.id)).toEqual(['f','b']);c.dispose()
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
