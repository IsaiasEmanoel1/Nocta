import { describe, expect, it, vi } from 'vitest'
import { initialSourceResult, recordSourceEvent } from '../experimental/sourceDiagnostics'
import { StremioAddonAdapter } from '../experimental/StremioAddonAdapter'
import { authorizedDevelopmentAddons } from '../config/stremioServices'
const profile=authorizedDevelopmentAddons[0]
const manifest={id:'org.test',name:'Fixture',version:'1.0.0',resources:['stream'],types:['movie'],catalogs:[]}
function adapter(config=profile,streams:unknown[]=[]){return new StremioAddonAdapter(config,vi.fn<typeof fetch>().mockImplementation(async url=>new Response(JSON.stringify(String(url).endsWith('manifest.json')?manifest:{streams}))))}
describe('source diagnostics',()=>{
 it('does not mark metadata, a playing event or a play promise as tested',()=>{
  const candidate=initialSourceResult({url:'https://example.test/a.mp4'})
  expect(candidate.state).toBe('untested')
  expect(recordSourceEvent(candidate,'loaded').state).toBe('untested')
  expect(recordSourceEvent(candidate,'playing').state).toBe('untested')
  expect(recordSourceEvent(candidate,'progress',.5).state).toBe('untested')
  expect(recordSourceEvent(candidate,'progress',2).state).toBe('tested')
 })
 it('keeps a failed source distinct from incompatibility and allows another source to succeed',()=>{
  const first=recordSourceEvent({state:'untested'},'failed',0,'manifestLoadError')
  const second=recordSourceEvent({state:'untested'},'progress',2)
  expect(first).toMatchObject({state:'failed',detail:'manifestLoadError'})
  expect(second.state).toBe('tested')
  expect(initialSourceResult({reportedFormat:'torrent'}).state).toBe('web-incompatible')
  expect(initialSourceResult({reportedFormat:'hls',reason:'proxyHeaders'}).state).toBe('unavailable')
 })
 it('classifies reviewed redirect endpoints as MP4 without claiming successful playback',async()=>{
  const client=adapter({...profile,redirectEndpoints:[{origin:'http://127.0.0.1:4189',pathPrefix:'/r/',format:'mp4',reason:'Reviewed MP4 redirect'}]},[{url:'http://127.0.0.1:4189/r/opaque',behaviorHints:{notWebReady:false}}])
  const [source]=await client.streams({type:'movie',imdb:'tt123'})
  expect(source).toMatchObject({format:'mp4',reportedFormat:'mp4',notWebReady:false})
  expect(client.session(source,'test','test').sources[0].type).toBe('video/mp4')
  expect(initialSourceResult(source).state).toBe('untested')
 })
 it('supports reviewed MP4/WebM/HLS endpoint MIME mappings with no arbitrary extension guessing',async()=>{
  const config={...profile,mediaEndpointTypes:{'http://127.0.0.1:4189/video':'webm' as const}}
  const [known,unknown]=await adapter(config,[{url:'http://127.0.0.1:4189/video'},{url:'http://127.0.0.1:4189/unknown'}]).streams({type:'movie',imdb:'tt123'})
  expect(known.format).toBe('webm');expect(unknown.format).toBe('unsupported')
 })
 it('reports exact special-header rejection, preserving format hints and notWebReady',async()=>{
  const [source]=await adapter(profile,[{url:'http://127.0.0.1:4189/video.m3u8',behaviorHints:{notWebReady:false,proxyHeaders:{request:{'User-Agent':'vendor'}}}}]).streams({type:'movie',imdb:'tt123'})
  expect(source.reportedFormat).toBe('hls');expect(source.reason).toContain('User-Agent');expect(source.url).toBeUndefined()
 })
 it('does not assume that notWebReady true prevents all supported formats',async()=>{
  const [source]=await adapter(profile,[{url:'http://127.0.0.1:4189/video.m3u8',behaviorHints:{notWebReady:true}}]).streams({type:'movie',imdb:'tt123'})
  expect(source.format).toBe('hls');expect(source.notWebReady).toBe(true)
 })
})
