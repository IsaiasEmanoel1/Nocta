import {afterEach,expect,it,vi} from 'vitest'
import {experimentalConfig,experimentalProfiles,readExperimentalManifest,saveExperimentalManifest} from '../config/experimentalProviders'
import {StremioAddonAdapter} from '../experimental/StremioAddonAdapter'
import {createSourceProviders,StremioSourceProvider} from '../playback/providers'
import type {PlaybackContext} from '../playback/providers'

const context:PlaybackContext={
 media:{id:'tmdb-tv-1',imdbId:'tt0000001',kind:'tv',title:'Amostra',source:'tmdb',year:2026,overview:'',rating:0,genres:[],genreIds:[],poster:'',backdrop:'',cast:[]},
 episode:{seasonNumber:1,episodeNumber:2},native:true,
}
const manifest={id:'test-addon',name:'Teste',version:'1',types:['series'],resources:['stream'],catalogs:[]}
afterEach(()=>localStorage.clear())

it('keeps production providers isolated and enables all four in the experiment',()=>{
 expect(createSourceProviders({enableZeus:false}).map(provider=>provider.id)).toEqual(['fenixflix','brazuca'])
 expect(createSourceProviders({experimental:true}).map(provider=>provider.id)).toEqual(['fenixflix','brazuca','bscine','magnetflix','zeus-beta','vetela'])
 expect(readExperimentalManifest(experimentalProfiles[0])).toBe('https://bscine.alwaysdata.net/manifest.json')
 expect(readExperimentalManifest(experimentalProfiles[1])).toBeUndefined()
})

it.each(experimentalProfiles)('forwards public HTTPS from $id without an origin or per-source registration',async profile=>{
 const manifestUrl=`${profile.origin}/configured-profile/manifest.json`
 expect(()=>saveExperimentalManifest(profile,'https://unreviewed.example/manifest.json')).toThrow()
 saveExperimentalManifest(profile,manifestUrl)
 expect(readExperimentalManifest(profile)).toBe(manifestUrl)
 const url='https://media.example.test/opaque'
 const fetcher=vi.fn<typeof fetch>(async request=>new Response(JSON.stringify(String(request).endsWith('manifest.json')?manifest:{
  streams:[{url,mimeType:'application/vnd.apple.mpegurl'}, {url:'http://media.example.test/sample.mp4'}, {url:'https://127.0.0.1/sample.mp4'}, {url:'https://media.local/sample.mp4'}, {url:'https://media.example.test/opaque-unknown'}],
 })))
 const config=experimentalConfig(profile,manifestUrl)
 const provider=new StremioSourceProvider(config,fetcher)
 const candidates=await provider.find({...context,publicMediaTransport:true,nativeOrigins:[]},new AbortController().signal)
 expect(fetcher.mock.calls[1][0]).toBe(`${profile.origin}/configured-profile/stream/series/tt0000001%3A1%3A2.json`)
 expect(provider.lastScan).toEqual({returned:5,eligible:1})
 expect(candidates[0]).toMatchObject({engine:'native',input:{url,mimeType:'application/vnd.apple.mpegurl',publicMediaTransport:true}})
 const unsupportedApk=await provider.find(context,new AbortController().signal)
 expect(unsupportedApk).toEqual([])
})

it('accepts HTTP only for a documented progressive host, with the experimental Android transport',async()=>{
 const profile=experimentalProfiles[0]
 const config=experimentalConfig(profile,profile.origin+'/manifest.json')
 const url='http://rfc-infinite.top/sample.mp4'
 const streams=[{url},{url:'http://rfc-infinite.top/sample.m3u8'},{url:'http://sub.rfc-infinite.top/sample.mp4'},{url:'http://rfc-infinite.top:81/sample.mp4'}]
 const adapter=new StremioAddonAdapter(config,vi.fn<typeof fetch>(async request=>new Response(JSON.stringify(String(request).endsWith('manifest.json')?manifest:{streams}))))
 const sources=await adapter.streams({type:'series',imdb:'tt0000001',episode:context.episode})
 expect(sources[0].nativeCandidate).toMatchObject({url,publicMediaTransport:true})
 expect(sources.every(source=>!source.url)).toBe(true)
 expect(sources.slice(1).every(source=>!source.nativeCandidate)).toBe(true)
 expect(()=>adapter.validatePlaybackUrl(url,'native','video/mp4')).not.toThrow()
 expect(()=>adapter.validatePlaybackUrl(url,'web')).toThrow()
})

it('uses a TMDB episode identifier only when the manifest accepts that prefix',async()=>{
 const profile=experimentalProfiles[1]
 const config=experimentalConfig(profile,profile.origin+'/configured/manifest.json')
 const fetcher=vi.fn<typeof fetch>(async url=>new Response(JSON.stringify(String(url).endsWith('manifest.json')?{...manifest,resources:[{name:'stream',types:['series'],idPrefixes:['tmdb:']}]}:{streams:[]})))
 const provider=new StremioSourceProvider(config,fetcher)
 await expect(provider.find(context,new AbortController().signal)).resolves.toEqual([])
 expect(fetcher).toHaveBeenLastCalledWith(`${profile.origin}/configured/stream/series/tmdb%3A1%3A1%3A2.json`,expect.anything())
 expect(provider.diagnostic.query).toEqual({type:'series',id:'tmdb:1:1:2'})
})

it('reuses only short-lived eligible discoveries and invalidates one failed source',async()=>{
 const profile=experimentalProfiles[1]
 const config=experimentalConfig(profile,profile.origin+'/hot-cache/manifest.json')
 const time=vi.spyOn(Date,'now').mockReturnValue(1000)
 const fetcher=vi.fn<typeof fetch>(async url=>new Response(JSON.stringify(String(url).endsWith('manifest.json')?manifest:{streams:[
  {url:'https://media.example.test/a.mp4',name:'Dublado'}, {url:'https://media.example.test/b.mp4',name:'Legendado'},
  {url:'https://media.example.test/c.mp4?signature=temporary'},
 ]})))
 const native={...context,publicMediaTransport:true}
 try{
  const provider=new StremioSourceProvider(config,fetcher)
  const found=await provider.find(native,new AbortController().signal)
  expect(found).toHaveLength(3)
  expect(new StremioSourceProvider(config,fetcher).cached(native).map(source=>source.language.modes)).toEqual([['dub'],['sub']])
  provider.invalidate(native,found[0].identity)
  expect(provider.cached(native)).toHaveLength(1)
  expect(provider.cached({...native,episode:{seasonNumber:1,episodeNumber:3}})).toEqual([])
  time.mockReturnValue(31_001)
  expect(provider.cached(native)).toEqual([])
 }finally{time.mockRestore()}
})

it('keeps a confirmed descriptor with URL expiry only in memory and honors addon cache directives',async()=>{
 const profile=experimentalProfiles[1]
 const config=experimentalConfig(profile,profile.origin+'/confirmed/manifest.json')
 const now=2_000_000_000_000
 const clock=vi.spyOn(Date,'now').mockReturnValue(now)
 const signal=new AbortController().signal
 const native={...context,publicMediaTransport:true}
 let cacheControl='max-age=120'
 const fetcher=vi.fn<typeof fetch>(async url=>String(url).endsWith('manifest.json')?new Response(JSON.stringify(manifest)):
  new Response(JSON.stringify({streams:[{url:`https://media.example.test/a.mp4?expires=${now/1000+12}&sig=sample`}]}),{headers:{'Cache-Control':cacheControl}}))
 try{
  const provider=new StremioSourceProvider(config,fetcher)
  const [candidate]=await provider.find(native,signal)
  expect(provider.confirmed(native)).toBeUndefined()
  expect(provider.cached(native)).toEqual([])
  provider.remember(native,candidate,'dub')
  expect(new StremioSourceProvider(config,fetcher).confirmed(native)?.candidate).toBe(candidate)
  expect(provider.confirmed({...native,episode:{seasonNumber:1,episodeNumber:3}})).toBeUndefined()
  clock.mockReturnValue(now+12_001)
  expect(provider.confirmed(native)).toBeUndefined()
  expect(await provider.find(native,signal)).toEqual([])
  clock.mockReturnValue(now)
  cacheControl='no-store'
  const [uncacheable]=await provider.find(native,signal)
  provider.remember(native,uncacheable,'dub')
  expect(provider.confirmed(native)).toBeUndefined()
 }finally{clock.mockRestore()}
})
