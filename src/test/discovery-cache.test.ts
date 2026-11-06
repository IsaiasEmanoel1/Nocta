import { afterEach, expect, it, vi } from 'vitest'
import { createDiscoveryCache } from '../playback/discoveryCache'
afterEach(()=>vi.useRealTimers())

it('shares an in-flight stream but never retains its media URLs as completed cache entries', async () => {
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('{"streams":[]}'))
 const cache=createDiscoveryCache(fetcher)
 const fetchProfile=cache.forProfile('public')
 const url='https://addon.example/stream/movie/tt123.json'
 const [a,b]=await Promise.all([fetchProfile(url),fetchProfile(url)])
 expect(await a.text()).toBe(await b.text())
 expect(fetcher).toHaveBeenCalledTimes(1)
 await fetchProfile(url)
 expect(fetcher).toHaveBeenCalledTimes(2)
 expect(cache.stats()).toMatchObject({joined:1,avoided:1})
})

it('keeps only public cacheable manifests within their age and separates profiles', async () => {
 let time=0
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('{}',{headers:{'Cache-Control':'public, max-age=60',Age:'30'}}))
 const cache=createDiscoveryCache(fetcher,()=>time)
 const url='https://addon.example/manifest.json'
 await cache.forProfile('first')(url)
 await cache.forProfile('first')(url)
 await cache.forProfile('second')(url)
 time=30_001
 await cache.forProfile('first')(url)
 expect(fetcher).toHaveBeenCalledTimes(3)
 expect(cache.stats().hits).toBe(1)
})

it('honors Retry-After and caps VêTela at ten actual requests per rolling minute',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0)
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('{}'))
 fetcher.mockResolvedValueOnce(new Response(null,{status:429,headers:{'Retry-After':'30'}}))
 const cache=createDiscoveryCache(fetcher)
 const vetela=cache.forProfile('vetela')
 const url='https://addon.vetela.cc/stream/movie/tt123.json'
 expect((await vetela(url)).status).toBe(429)
 const queued=vetela(url)
 await vi.advanceTimersByTimeAsync(29_999)
 expect(fetcher).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(1);expect((await queued).ok).toBe(true)
 for(let i=0;i<8;i++)expect((await vetela(url)).status).toBe(200)
 const atLimit=vetela(url)
 await vi.advanceTimersByTimeAsync(29_999)
 expect(fetcher).toHaveBeenCalledTimes(10)
 expect(cache.vetelaUsage()).toMatchObject({used:10,queued:1,nextAt:60_000})
 await vi.advanceTimersByTimeAsync(1)
 expect((await atLimit).ok).toBe(true)
})

it('does not abort an equal request while another caller still needs it',async()=>{
 let complete!: (response: Response)=>void
 const fetcher=vi.fn<typeof fetch>().mockImplementation(()=>new Promise(resolve=>{complete=resolve}))
 const fetchProfile=createDiscoveryCache(fetcher).forProfile('public')
 const controller=new AbortController()
 const url='https://addon.example/stream/movie/tt123.json'
 const first=fetchProfile(url,{signal:controller.signal})
 const second=fetchProfile(url)
 controller.abort()
 await expect(first).rejects.toMatchObject({name:'AbortError'})
 expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false)
 complete(new Response('{"streams":[]}'))
 expect((await second).ok).toBe(true)
})

it('keeps VêTela cooldown and the rolling count across new cache instances',async()=>{
 vi.useFakeTimers();vi.setSystemTime(100)
 const store=new Map<string,string>()
 const storage={getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value)}}
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('{}'))
 fetcher.mockResolvedValueOnce(new Response(null,{status:429,headers:{'Retry-After':'20'}}))
 const url='https://addon.vetela.cc/configured/stream/movie/tt123.json'
 const cache=()=>createDiscoveryCache(fetcher,Date.now,storage)
 const request=()=>cache().forProfile('vetela')(url)
 expect((await request()).status).toBe(429)
 expect(cache().vetelaUsage()).toMatchObject({used:1,nextAt:20_100})
 expect(fetcher).toHaveBeenCalledTimes(1)
 vi.setSystemTime(20_100)
 for(let index=0;index<9;index++)expect((await request()).status).toBe(200)
 expect(cache().vetelaUsage()).toMatchObject({used:10,nextAt:60_100})
 expect(fetcher).toHaveBeenCalledTimes(10)
})
