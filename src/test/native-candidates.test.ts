import {expect,it,vi} from 'vitest'
import {StremioAddonAdapter} from '../experimental/StremioAddonAdapter'
import {authorizedDevelopmentAddons} from '../config/stremioServices'
const config=authorizedDevelopmentAddons[1]
function client(streams:unknown[]){return new StremioAddonAdapter(config,vi.fn<typeof fetch>().mockImplementation(async url=>new Response(JSON.stringify(String(url).endsWith('manifest.json')?{id:'test',version:'1',name:'Test',types:['series'],resources:['stream'],catalogs:[]}: {streams}))))}
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
