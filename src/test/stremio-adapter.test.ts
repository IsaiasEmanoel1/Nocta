import { describe, expect, it, vi } from 'vitest'
import { AddonError, StremioAddonAdapter } from '../experimental/StremioAddonAdapter'
import { authorizedDevelopmentAddons } from '../config/stremioServices'
const config={...authorizedDevelopmentAddons[0]}
const manifest={id:'org.test',name:'Test',version:'1.0.0',types:['movie','series'],catalogs:[],resources:[{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:']}]}
const response=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}})
function client(streams:unknown[]=[]) {const fetcher=vi.fn<typeof fetch>().mockImplementation(async url=>String(url).endsWith('/manifest.json')?response(manifest):response({streams}));return {adapter:new StremioAddonAdapter(config,fetcher),fetcher}}
describe('StremioAddonAdapter policy and normalization',()=>{
 it('keeps FenixFlix on the configured host with explicit media origins',()=>{
  const profile=authorizedDevelopmentAddons.find(p=>p.id==='fenixflix-diagnostics')!
  expect(profile.manifestUrl).toContain('https://fenixflix.fenixhub.online/qualities=')
  expect(profile.playbackAllowed).toBe(true)
  expect(profile.mediaOrigins).toContain('https://cdn-sv01.maximaimg.online')
  const adapter=new StremioAddonAdapter(profile)
  expect(()=>adapter.session({id:'forged',name:'forged',description:'',format:'mp4',url:'https://example.test/a.mp4',declaredLanguages:[],confirmedLanguages:[]},'test','test')).toThrow('Destino não autorizado')
 })
 it('shows reported format, origin, quality and language without making a playable diagnostic source',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async url=>String(url).endsWith('/manifest.json')?response(manifest):response({streams:[
   {name:'Fornecedor 1080p',description:'Dublado',url:'https://cdn.example.test/a.m3u8'},
   {externalUrl:'https://example.test/embed'},{infoHash:'abc'},
  ]}))
  const adapter=new StremioAddonAdapter({...config,playbackAllowed:false,mediaOrigins:[]},fetcher)
  const sources=await adapter.streams({type:'movie',imdb:'tt123'})
  expect(sources[0]).toMatchObject({reportedFormat:'hls',origin:'https://cdn.example.test',quality:'1080p',declaredLanguages:['pt-BR (rótulo)'],confirmedLanguages:[]})
  expect(sources.map(source=>source.reportedFormat)).toEqual(['hls','embed','torrent'])
  expect(sources.every(source=>!source.url)).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(2)
 })
 it('reports a suspended HTTP service without inventing an empty successful result',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('Service Suspended',{status:503}))
  await expect(new StremioAddonAdapter(config,fetcher).loadManifest()).rejects.toMatchObject({code:'http',message:'Serviço indisponível (503).'})
 })
 it('preserves configured prefix for manifest, catalog and stream without root fallback',async()=>{
  const profile={...config,manifestUrl:'http://127.0.0.1:4189/qualities=1080p%7Caudio=dublado/manifest.json'}
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async url=>String(url).endsWith('manifest.json')?response({...manifest,resources:['catalog','stream'],catalogs:[{type:'movie',id:'popular'}]}):String(url).includes('/catalog/')?response({metas:[]}):response({streams:[]}))
  const adapter=new StremioAddonAdapter(profile,fetcher)
  await adapter.catalog('movie','popular');await adapter.streams({type:'series',imdb:'tt123',episode:{seasonNumber:2,episodeNumber:3}})
  expect(fetcher.mock.calls.map(call=>String(call[0]))).toEqual([
   'http://127.0.0.1:4189/qualities=1080p%7Caudio=dublado/manifest.json',
   'http://127.0.0.1:4189/qualities=1080p%7Caudio=dublado/catalog/movie/popular.json',
   'http://127.0.0.1:4189/qualities=1080p%7Caudio=dublado/stream/series/tt123%3A2%3A3.json',
  ])
 })
 it('preserves IMDb episode numbers and accepts explicitly configured TMDB convention',async()=>{
  const {adapter,fetcher}=client([{url:'http://127.0.0.1:4189/media/sample.mp4',languages:['pt-BR','en']}])
  const sources=await adapter.streams({type:'series',imdb:'tt123',episode:{seasonNumber:2,episodeNumber:4}})
  expect(fetcher.mock.calls[1][0]).toContain('tt123%3A2%3A4.json')
  expect(sources[0]).toMatchObject({format:'mp4',declaredLanguages:['pt-BR','en'],confirmedLanguages:[]})
  await adapter.streams({type:'movie',tmdb:42});expect(fetcher.mock.calls[2][0]).toContain('tmdb%3A42.json')
 })
 it.each(['http://169.254.169.254/manifest.json','http://127.0.0.1:4000/manifest.json','https://192.168.1.1/manifest.json','https://[::1]/manifest.json','https://user:pass@allowed.test/manifest.json','file:///manifest.json'])('rejects unsafe configured URL %s',url=>{
  expect(()=>new StremioAddonAdapter({...config,manifestUrl:url,apiOrigins:[new URL(url).origin]})).toThrow(AddonError)
 })
 it('rejects expired rights and unsupported prefixes/types before stream calls',async()=>{
  expect(()=>new StremioAddonAdapter({...config,rights:{reference:'test',expiresAt:0}})).toThrow()
  const {adapter,fetcher}=client();await expect(adapter.streams({type:'movie',imdb:'nope'})).rejects.toMatchObject({code:'unsupported'});expect(fetcher).not.toHaveBeenCalled()
  await expect(adapter.streams({type:'series',imdb:'tt123',episode:{seasonNumber:0,episodeNumber:1}})).rejects.toThrow()
 })
 it('rejects missing manifest resources and validates schema',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response({id:'broken'}))
  await expect(new StremioAddonAdapter(config,fetcher).loadManifest()).rejects.toMatchObject({code:'manifest'})
  const restricted=new StremioAddonAdapter(config,vi.fn<typeof fetch>().mockResolvedValue(response({...manifest,resources:[{name:'stream',types:['movie'],idPrefixes:['custom:']}]})))
  await expect(restricted.streams({type:'movie',imdb:'tt123'})).rejects.toMatchObject({code:'unsupported'})
 })
 it('normalizes HLS/WebM but blocks embeds, torrents, special headers, unsafe media and unknown extensions',async()=>{
  const {adapter}=client([{url:'http://127.0.0.1:4189/media/a.m3u8'},{url:'http://127.0.0.1:4189/media/a.webm'},{externalUrl:'https://example.test/embed'},{infoHash:'abc'},{url:'http://127.0.0.1:4189/a.mp4',behaviorHints:{proxyHeaders:{request:{Referer:'x'}}}},{url:'http://10.0.0.1/x.mp4'},{url:'http://127.0.0.1:4189/page.html'}])
  const sources=await adapter.streams({type:'movie',imdb:'tt123'});expect(sources.map(s=>s.format)).toEqual(['hls','webm',...Array(5).fill('unsupported')]);expect(sources.slice(2).every(s=>!s.url)).toBe(true)
 })
 it('handles empty streams and transient network recovery',async()=>{
  const {adapter,fetcher}=client();expect(await adapter.streams({type:'movie',imdb:'tt123'})).toEqual([])
  fetcher.mockRejectedValueOnce(new Error('offline'));await expect(adapter.streams({type:'movie',imdb:'tt123'})).rejects.toMatchObject({code:'network'})
  expect(await adapter.streams({type:'movie',imdb:'tt123'})).toEqual([])
 })
 it('aborts a request at timeout without logging URLs',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockImplementation((_url,options)=>new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(new Error('abort')))))
  await expect(new StremioAddonAdapter({...config,timeoutMs:10},fetcher).loadManifest()).rejects.toMatchObject({code:'timeout'})
 })
 it('never follows API redirects or sends credentials',async()=>{
  const {adapter,fetcher}=client();await adapter.loadManifest();expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'})
 })
})
