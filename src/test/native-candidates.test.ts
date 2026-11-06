import {expect,it,vi} from 'vitest'
import {StremioAddonAdapter} from '../experimental/StremioAddonAdapter'
import {authorizedDevelopmentAddons} from '../config/stremioServices'
const config=authorizedDevelopmentAddons[1]
function client(streams:unknown[],profile=config){return new StremioAddonAdapter(profile,vi.fn<typeof fetch>().mockImplementation(async url=>new Response(JSON.stringify(String(url).endsWith('manifest.json')?{id:'test',version:'1',name:'Test',types:['series'],resources:['stream'],catalogs:[]}: {streams}))))}
it('keeps Arthur web-blocked but exposes a native HLS candidate with declared headers',async()=>{
 const [s]=await client([{url:'https://sa-east-1.v-net.work/video.m3u8',behaviorHints:{proxyHeaders:{request:{'User-Agent':'vendor-declared'}}}}]).streams({type:'series',imdb:'tt123',episode:{seasonNumber:1,episodeNumber:1}})
 expect(s.url).toBeUndefined();expect(s.nativeCandidate).toMatchObject({mimeType:'application/vnd.apple.mpegurl',headers:{'User-Agent':'vendor-declared'}})
})
it('recognizes the verified Malfoy MKV endpoint without claiming WebM or native playback',async()=>{
 const [s]=await client([{url:'https://animezey16082023.animezey16082023.workers.dev/download.aspx?id=test',behaviorHints:{proxyHeaders:{request:{'User-Agent':'vendor','Referer':'https://example.test/'}}}}]).streams({type:'series',imdb:'tt123',episode:{seasonNumber:1,episodeNumber:1}})
 expect(s.reportedFormat).toBe('matroska');expect(s.nativeCandidate?.mimeType).toBe('video/x-matroska');expect(s.url).toBeUndefined()
})
it('does not pass authentication, cookie or newline headers into a native candidate',async()=>{
 const [s]=await client([{url:'https://sa-east-1.v-net.work/video.m3u8',behaviorHints:{proxyHeaders:{request:{Cookie:'secret'}}}}]).streams({type:'series',imdb:'tt123',episode:{seasonNumber:1,episodeNumber:1}})
 expect(s.nativeCandidate).toBeUndefined()
})
it('uses a supported declared MIME for an opaque path only on a trusted origin',async()=>{
 const [valid,untrusted,responseHeaders]=await client([
  {url:'https://cdn-sv01.maximaimg.online/watch',mimeType:'application/x-mpegurl'},
  {url:'https://unknown.example/watch',mimeType:'video/mp4'},
  {url:'https://cdn-sv01.maximaimg.online/watch',mimeType:'video/mp4',behaviorHints:{proxyHeaders:{response:{'Access-Control-Allow-Origin':'*'}}}}
 ]).streams({type:'series',imdb:'tt123',episode:{seasonNumber:1,episodeNumber:1}})
 expect(valid.format).toBe('hls')
 expect(valid.nativeCandidate?.mimeType).toBe('application/vnd.apple.mpegurl')
 expect(untrusted.nativeCandidate).toBeUndefined()
 expect(untrusted.url).toBeUndefined()
 expect(responseHeaders.nativeCandidate).toBeUndefined()
})

it('applies diagnostic-only and denied endpoint policies before creating native candidates',async()=>{
 const url='https://cdn-sv01.maximaimg.online/restricted/sample.mp4'
 const query={type:'series' as const,imdb:'tt123',episode:{seasonNumber:1,episodeNumber:1}}
 const profiles=[{...config,playbackAllowed:false},{...config,redirectEndpoints:[{origin:new URL(url).origin,pathPrefix:'/restricted/',reason:'Rota recusada no perfil'}]}]
 for(const profile of profiles){
  const [source]=await client([{url}],profile).streams(query)
  expect(source.url).toBeUndefined()
  expect(source.nativeCandidate).toBeUndefined()
 }
})

it('distinguishes an unapproved MP4 origin from a supported native User-Agent',async()=>{
 const behaviorHints={proxyHeaders:{request:{'User-Agent':'declared-test-value'}}}
 const [blocked,allowed,badger]=await client([
  {url:'https://media-unreviewed.example/video.mp4',behaviorHints},
  {url:'https://cdn-sv01.maximaimg.online/video.mp4',behaviorHints},
  {url:'https://fenixflix.fenixhub.online/r/controlled-opaque'},
 ]).streams({type:'series',imdb:'tt123',episode:{seasonNumber:1,episodeNumber:1}})
 expect(blocked.reportedFormat).toBe('mp4')
 expect(blocked.reason).toContain('User-Agent')
 expect(blocked.nativeReason).toContain('Origem')
 expect(blocked.nativeCandidate).toBeUndefined()
 expect(allowed.url).toBeUndefined()
 expect(allowed.nativeCandidate).toMatchObject({mimeType:'video/mp4',headers:{'User-Agent':'declared-test-value'}})
 expect(badger.format).toBe('mp4')
 expect(badger.nativeCandidate).toBeUndefined()
})

it('does not block WebView for empty proxy headers and normalizes supported header names for Media3',async()=>{
 const url='https://cdn-sv01.maximaimg.online/sample.mp4'
 const [empty,lowercase,conflict]=await client([
  {url,behaviorHints:{proxyHeaders:{request:{},response:{}}}},
  {url,behaviorHints:{proxyHeaders:{request:{'user-agent':'fixture',referer:'https://example.test/'}}}},
  {url,behaviorHints:{proxyHeaders:{request:{'user-agent':'first','User-Agent':'second'}}}},
 ]).streams({type:'series',imdb:'tt123',episode:{seasonNumber:1,episodeNumber:1}})
 expect(empty.url).toBe(url)
 expect(empty.nativeCandidate?.headers).toEqual({})
 expect(lowercase.url).toBeUndefined()
 expect(lowercase.nativeCandidate?.headers).toEqual({'User-Agent':'fixture',Referer:'https://example.test/'})
 expect(conflict.url).toBeUndefined()
 expect(conflict.nativeCandidate).toBeUndefined()
})
