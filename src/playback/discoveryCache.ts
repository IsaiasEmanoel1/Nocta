type Snapshot = { body: string | null; status: number; headers: Headers }
type Flight = { controller: AbortController; readers: number; promise: Promise<Snapshot> }
const manifestMaxAge = 5 * 60_000
const bodyLimit = 2_000_000

export function retryUntil(value: string | null, now: number) {
  if (value && /^\d+$/.test(value.trim())) return now + Number(value) * 1000
  const date = value ? Date.parse(value) : NaN
  return Number.isFinite(date) ? Math.max(now, date) : now + 60_000
}

function manifestLifetime(response: Snapshot) {
  if (response.status !== 200 || response.headers.get('vary')) return 0
  const control = response.headers.get('cache-control') ?? ''
  if (/\b(no-store|no-cache|private)\b/i.test(control)) return 0
  const maxAge = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(control)?.[1] ?? 0)
  const age = Number(response.headers.get('age') ?? 0)
  return Math.min(manifestMaxAge, Math.max(0, maxAge - age) * 1000)
}

async function snapshot(response: Response): Promise<Snapshot> {
  const headers = new Headers(response.headers)
  const reader = response.body?.getReader()
  if (!reader) return { body: null, status: response.status, headers }
  const decoder = new TextDecoder()
  let body = '', size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > bodyLimit) {
        headers.set('content-length', String(size))
        return { body: null, status: response.status, headers }
      }
      body += decoder.decode(value, { stream: true })
    }
    return { body: body + decoder.decode(), status: response.status, headers }
  } finally {
    void reader.cancel().catch(() => {})
  }
}

/** Only used by the configured, credential-free playback profiles. */
export function createDiscoveryCache(fetcher: typeof fetch, now = Date.now, storage?: Pick<Storage,'getItem'|'setItem'>) {
  const manifests = new Map<string, { response: Snapshot; expires: number }>()
  const flights = new Map<string, Flight>()
  const cooldown = new Map<string, number>()
  let vetelaRequests: number[] = []
  let vetelaCooldown = 0
  let vetelaTail:Promise<unknown> = Promise.resolve()
  let vetelaQueued = 0
  const vetelaKey='nocta.vetela.rate.v1'
  function restoreVetelaLimit(){
    try {
      const saved=JSON.parse(storage?.getItem(vetelaKey)??'null')
      if(Array.isArray(saved?.requests))vetelaRequests=saved.requests.filter((value:unknown)=>typeof value==='number'&&Number.isFinite(value)).slice(-10)
      if(Number.isFinite(saved?.cooldown))vetelaCooldown=saved.cooldown
    } catch { /* Keep the in-memory limit if storage is unavailable. */ }
  }
  function saveVetelaLimit(){
    try { storage?.setItem(vetelaKey,JSON.stringify({requests:vetelaRequests,cooldown:vetelaCooldown})) } catch { /* Keep the in-memory limit. */ }
  }
  const stats = { hits: 0, misses: 0, joined: 0, avoided: 0, rateLimited: 0 }
  const restore = (value: Snapshot) => new Response(value.body, { status: value.status, headers: value.headers })

  function vetelaUsage(){
    restoreVetelaLimit()
    const time=now()
    vetelaRequests=vetelaRequests.filter(start=>start>time-60_000).sort((a,b)=>a-b)
    const nextAt=Math.max(vetelaCooldown,vetelaRequests.length>=10?vetelaRequests[0]+60_000:0)
    return { used:vetelaRequests.length, nextAt:nextAt>time?nextAt:undefined, queued:vetelaQueued }
  }

  function queueVetela<T>(signal:AbortSignal, send:()=>Promise<T>){
    vetelaQueued++
    const task=vetelaTail.then(async()=>{
      try{
        for(;;){
          signal.throwIfAborted()
          const {nextAt}=vetelaUsage()
          if(!nextAt)break
          stats.rateLimited++
          await new Promise<void>((resolve,reject)=>{
            const abort=()=>{clearTimeout(timer);reject(signal.reason)}
            const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},nextAt-now())
            signal.addEventListener('abort',abort,{once:true})
          })
        }
      }finally{vetelaQueued--}
      signal.throwIfAborted()
      vetelaRequests.push(now());saveVetelaLimit()
      return send()
    })
    vetelaTail=task.catch(()=>{})
    return task
  }

  function forProfile(profile: string): typeof fetch {
    return async (input, init) => {
      const url = new URL(String(input))
      const signal = init?.signal
      signal?.throwIfAborted()
      const manifest = url.pathname.endsWith('/manifest.json') && !url.search
      const key = JSON.stringify([profile, url.href])
      const entry = manifests.get(key)
      if (entry && entry.expires > now()) {
        stats.hits++; stats.avoided++
        return restore(entry.response)
      }
      manifests.delete(key)
      let flight = flights.get(key)
      if (flight) {
        stats.joined++; stats.avoided++
      } else {
        const time = now()
        const limitedUntil = cooldown.get(profile) ?? 0
        const vetela=url.hostname === 'addon.vetela.cc'
        const retryAt = vetela ? 0 : limitedUntil
        if (retryAt > time) {
          stats.rateLimited++; stats.avoided++
          return new Response(null, { status: 429, headers: { 'Retry-After': String(Math.ceil((retryAt - time) / 1000)) } })
        }
        stats.misses++
        const controller = new AbortController()
        const send = async () => {
          const response = await fetcher(url, { ...init, signal: controller.signal })
          if (response.status === 429){
            const until=retryUntil(response.headers.get('retry-after'), now())
            cooldown.set(profile,until)
            if(vetela){restoreVetelaLimit();vetelaCooldown=Math.max(vetelaCooldown,until);saveVetelaLimit()}
          }
          const value = await snapshot(response)
          const lifetime = manifest && !controller.signal.aborted ? manifestLifetime(value) : 0
          if (lifetime) manifests.set(key, { response: value, expires: now() + lifetime })
          return value
        }
        const promise = (vetela?queueVetela(controller.signal,send):Promise.resolve().then(send)).finally(() => {
          if (flights.get(key)?.controller === controller) flights.delete(key)
        })
        flight = { controller, readers: 0, promise }
        flights.set(key, flight)
      }
      const current = flight
      current.readers++
      return new Promise<Response>((resolve, reject) => {
        const done = () => {
          signal?.removeEventListener('abort', abort)
          if (--current.readers === 0 && flights.get(key) === current) {
            flights.delete(key)
            current.controller.abort()
          }
        }
        const abort = () => { done(); reject(signal?.reason) }
        signal?.addEventListener('abort', abort, { once: true })
        current.promise.then(value => {
          if (!signal?.aborted) { done(); resolve(restore(value)) }
        }, error => {
          if (!signal?.aborted) { done(); reject(error) }
        })
      })
    }
  }
  return { forProfile, vetelaUsage, stats: () => ({ ...stats }) }
}

export const discoveryCache = createDiscoveryCache((input, init) => fetch(input, init),Date.now,{
 getItem:key=>globalThis.localStorage?.getItem(key)??null,
 setItem:(key,value)=>globalThis.localStorage?.setItem(key,value),
})
