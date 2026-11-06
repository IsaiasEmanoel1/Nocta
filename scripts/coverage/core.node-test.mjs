import assert from 'node:assert/strict'
import test from 'node:test'
import {additionalCoverage,classifyManifest,concurrency,createQueue,csv,manifestInputs,rankings,resumable,retryAfter,sampleQuotas,streamRequest,summarizeStreams} from './core.mjs'

test('preserves separate manifest settings, removes duplicates and rejects unsafe inputs',()=>{
 const {entries,invalid}=manifestInputs(`# comment
https://service.example/a/manifest.json
stremio://service.example/a/manifest.json#fragment
https://service.example/b/manifest.json?profile=secret
https://a:b@service.example/manifest.json
https://127.0.0.1/manifest.json`)
 assert.equal(invalid,2)
 assert.equal(entries.length,2)
 assert.notEqual(entries[0].key,entries[1].key)
 const provider=classifyManifest(entries[1],{status:200,data:{id:'add.on',name:'Addon',version:'1',types:['series'],idPrefixes:['tt'],resources:['stream'],description:'Limit 10 requests per minute'}})
 assert.equal(provider.declaredRate,10)
 assert.equal(JSON.stringify(provider).includes('secret'),false)
 assert.equal(classifyManifest(entries[0],{status:200,data:{name:'Nuvio',plugins:[]}}).status,'nuvio')
})

test('uses exact type, identifier and real episode coordinates and keeps the configured route base',()=>{
 const provider={url:'https://service.example/config/manifest.json?mode=dual',resources:[{types:['series'],prefixes:['tmdb:']}]}
 const title={category:'series',type:'series',tmdb:60735,imdb:'tt3107288',season:1,episode:3}
 assert.equal(streamRequest(provider,title).url.href,'https://service.example/config/stream/series/tmdb%3A60735%3A1%3A3.json?mode=dual')
 assert.equal(streamRequest(provider,{...title,episode:0}).reason,'episodio-nao-confirmado')
 assert.equal(streamRequest({...provider,resources:[{types:['series'],prefixes:['kitsu:']}]},title).reason,'id-nao-compativel')
 assert.equal(streamRequest({...provider,resources:[{types:['series'],prefixes:['tt']}]},title).id,'tt3107288:1:3')
 assert.deepEqual(Object.values(sampleQuotas(20)),[6,4,3,3,2,2])
 assert.deepEqual(Object.values(sampleQuotas(100)),[30,20,15,15,10,10])
})

test('spaces requests, respects Retry-After and defers rather than looping on a long 429',async()=>{
 let now=0
 const starts=[]
 const cooldowns=[]
 const queue=createQueue(10,{now:()=>now,pause:async ms=>{now+=ms},onCooldown:(until,status)=>cooldowns.push([until,status])})
 const send=status=>async()=>{starts.push(now);return {status,retryAfter:status===429?'15':null}}
 await queue.request(send(200))
 await queue.request(send(200))
 let attempt=0
 const recovered=await queue.request(()=>send(++attempt===1?429:200)())
 assert.deepEqual(starts,[0,6000,12000,27000])
 assert.equal(recovered.rateLimited,1)
 const deferred=await queue.request(async()=>({status:429,retryAfter:'600'}))
 assert.equal(deferred.requests,1)
 assert.equal(deferred.retryAt,633000)
 const blocked=await queue.request(()=>assert.fail('too early'))
 assert.equal(blocked.requests,0)
 assert.deepEqual(cooldowns,[[27000,429],[633000,429]])
 assert.equal(retryAfter('Wed, 01 Jan 2025 00:00:15 GMT',Date.UTC(2025,0,1)),Date.UTC(2025,0,1,0,0,15))
 assert.equal(resumable({at:0,retryAt:deferred.retryAt},100,1),true)
 assert.equal(resumable({at:0,retryAt:deferred.retryAt},deferred.retryAt,1),false)
})

test('global concurrency stays bounded and cancellation stops before the next fetch',async()=>{
 const run=concurrency(2)
 let active=0,peak=0
 await Promise.all([1,2,3,4].map(()=>run(async()=>{
  peak=Math.max(peak,++active)
  await new Promise(resolve=>setImmediate(resolve))
  active--
 })))
 assert.equal(peak,2)
 const queue=createQueue(10)
 const controller=new AbortController()
 controller.abort()
 await assert.rejects(queue.request(()=>assert.fail('cancelled request'),controller.signal),{name:'AbortError'})
})

test('formats, potential compatibility and rankings never imply playback or serialize media links',()=>{
 const stats=summarizeStreams([
  {url:'https://video.example/stream.m3u8?token=secret',name:'1080p PT-BR dublado'},
  {url:'https://video.example/film.mkv',behaviorHints:{notWebReady:true,proxyHeaders:{request:{Referer:'secret'}}}},
  {url:'http://video.example/film.mp4'},{infoHash:'secret'}
 ])
 assert.deepEqual([stats.count,stats.httpCount,stats.webCount,stats.nativeCount],[4,3,1,2])
 assert.equal(JSON.stringify(stats).includes('secret'),false)
 const row={provider:'one',name:'One',category:'animes',id:'tt123:1:1',ms:100,status:'fontes',...stats}
 const ranking=rankings([row,{...row,provider:'two',status:'erro-http',ms:200},{...row,provider:'one',status:'rate-limit',requests:0}])
 assert.equal(ranking.find(value=>value.ranking==='total'&&value.posicao===1).com_fontes,1)
 assert.equal(ranking.find(value=>value.ranking==='animes'&&value.provider==='two').respostas,0)
 assert.equal(ranking.find(value=>value.ranking==='total'&&value.provider==='one').elegiveis,1)
 assert.equal(csv(['title'],[{title:'=1+1'},{title:'A; "B"'}]),'\uFEFF"title"\r\n"\'=1+1"\r\n"A; ""B"""\r\n')
})

test('normalizes root manifests and counts only proven gaps against both existing providers',()=>{
 const {entries}=manifestInputs('https://site.example/\nhttps://site.example/manifest.json\nhttps://site.example/config/manifest.json')
 assert.equal(entries.length,2)
 const row=(provider,tmdb,status,nativeCount=0)=>({provider,tmdb,status,nativeCount,type:'movie',category:'filmes',name:provider})
 const results=additionalCoverage([
  row('fenix',1,'vazio'),row('brazuca',1,'vazio'),row('extra',1,'fontes',1),
  row('fenix',2,'timeout'),row('brazuca',2,'vazio'),row('extra',2,'fontes'),
  row('brazuca',3,'fontes'),row('extra',3,'fontes')
 ],['fenix','brazuca'])
 assert.deepEqual(results.find(item=>item.categoria==='total'),{provider:'extra',nome:'extra',categoria:'total',pares:3,com_fontes:3,adicionais:1,adicionais_android:1,ganho_android_potencial:1,base_ja_tem:1,base_inconclusiva:1})
 const {sources}=summarizeStreams([{url:'https://site.example/watch',mimeType:'video/mp4; codecs="avc1.4d401f"'},{url:'https://site.example/manifest.mpd'},{infoHash:'x'},{url:'https://site.example/watch'}])
 assert.equal(sources[0].native,true)
 assert.deepEqual(sources[0].codecs,['avc1.4d401f'])
 assert.deepEqual(sources.slice(1).map(source=>source.androidState),['suportavel-com-adaptacao','modalidade-nao-suportada','informacao-insuficiente'])
})
