import { expect, it } from 'vitest'
import { StremioAddonAdapter } from '../experimental/StremioAddonAdapter'
import { authorizedDevelopmentAddons } from '../config/stremioServices'
it.skipIf(process.env.NOCTA_STREMIO_INTEGRATION !== 'true')('uses the real controlled HTTP server for manifest, catalog, meta, movie/episode streams, media bytes, empty and timeout',async()=>{
 const config=authorizedDevelopmentAddons[0], adapter=new StremioAddonAdapter(config)
 expect((await adapter.loadManifest()).id).toBe('org.nocta.controlled')
 expect((await adapter.catalog('movie','samples'))[0].id).toBe('tt1254207')
 expect((await adapter.meta('series','tmdb:1')).episodes).toHaveLength(2)
 for(const title of [{type:'movie' as const,imdb:'tt1254207'},{type:'series' as const,tmdb:1,episode:{seasonNumber:1,episodeNumber:2}}]){
  const sources=await adapter.streams(title);expect(sources.map(s=>s.format)).toEqual(['mp4','hls','unsupported'])
  const media=await fetch(sources[0].url!,{headers:{Range:'bytes=0-63'}});expect(media.status).toBe(206);expect((await media.arrayBuffer()).byteLength).toBe(64)
  const playlist=await (await fetch(sources[1].url!)).text();expect(playlist).toContain('#EXTM3U');expect(playlist).toContain('LANGUAGE="por"');expect(playlist).toContain('LANGUAGE="eng"')
 }
 expect(await adapter.streams({type:'movie',imdb:'tt0000001'})).toEqual([])
 const short=new StremioAddonAdapter({...config,timeoutMs:50});await short.loadManifest();await expect(short.streams({type:'movie',imdb:'tt0000000'})).rejects.toMatchObject({code:'timeout'})
})
