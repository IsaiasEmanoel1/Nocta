import { expect,it,vi } from 'vitest'
import {SourcePreflight,sourceBaseline} from '../experimental/sourcePreflight'
import type {AddonSource} from '../experimental/StremioAddonAdapter'
const source:AddonSource={id:'one',name:'Test',description:'',format:'hls',reportedFormat:'hls',url:'https://example.test/a.m3u8',declaredLanguages:[],confirmedLanguages:[]}
const signal=()=>new AbortController().signal
it('separates playlist GET from segments and verified playback; caches and rechecks',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('#EXTM3U\n#EXTINF:3,\nseg.ts'))
 const check=new SourcePreflight(fetcher)
 const result=await check.check(source,()=>{},signal())
 expect(result).toMatchObject({state:'compatible',playlist:'accessible',segments:'not-checked'})
 expect(fetcher.mock.calls[0][1]).toMatchObject({method:'GET',mode:'cors',redirect:'error',credentials:'omit'})
 await check.check(source,()=>{},signal());expect(fetcher).toHaveBeenCalledTimes(1)
 await check.check(source,()=>{},signal(),true);expect(fetcher).toHaveBeenCalledTimes(2)
})
it('does not probe Badger MP4 or special-header Arthur and does not declare playback',async()=>{
 const fetcher=vi.fn<typeof fetch>();const check=new SourcePreflight(fetcher)
 expect((await check.check({...source,format:'mp4'},()=>{},signal())).state).toBe('compatible')
 const arthur={...source,url:undefined,requiredHeaders:['User-Agent'],reason:'Exige proxyHeaders (User-Agent).'}
 expect(sourceBaseline(arthur).state).toBe('incompatible')
 await check.check(arthur,()=>{},signal());expect(fetcher).not.toHaveBeenCalled()
})
it('does not infer CORS from opaque network errors; supports recovery',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(new Response('#EXTM3U'))
 const check=new SourcePreflight(fetcher)
 expect((await check.check(source,()=>{},signal())).state).toBe('temporary')
 expect((await check.check(source,()=>{},signal(),true)).state).toBe('compatible')
})
it('rejects HTML despite HTTP 200 and preserves known HTTP failures',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<html>error</html>')).mockResolvedValueOnce(new Response('',{status:403}))
 const check=new SourcePreflight(fetcher)
 expect((await check.check(source,()=>{},signal())).state).toBe('incompatible')
 expect((await check.check(source,()=>{},signal(),true)).detail).toContain('HTTP 403')
})
it('times out a stalled request and bounds concurrency at two',async()=>{
 let active=0,max=0
 const fetcher=vi.fn<typeof fetch>().mockImplementation((_url,options)=>new Promise((_resolve,reject)=>{active++;max=Math.max(max,active);options?.signal?.addEventListener('abort',()=>{active--;reject(new Error('aborted'))})}))
 const check=new SourcePreflight(fetcher,10)
 const results=await Promise.all([1,2,3,4].map(i=>check.check({...source,url:`https://example.test/${i}.m3u8`},()=>{},signal())))
 expect(max).toBe(2);expect(results.every(result=>result.state==='temporary'&&result.detail.includes('Timeout'))).toBe(true)
})
it('limits response size and cancels stale work before fetching',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('x',{headers:{'content-length':'999999'}}))
 const check=new SourcePreflight(fetcher)
 expect((await check.check(source,()=>{},signal())).detail).toContain('64 KiB')
 const controller=new AbortController();controller.abort();await check.check({...source,url:'https://example.test/b.m3u8'},()=>{},controller.signal)
 expect(fetcher).toHaveBeenCalledTimes(1)
})
