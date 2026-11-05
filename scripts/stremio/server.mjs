import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
const root = path.resolve('.cache/stremio-fixture')
const origin = 'http://127.0.0.1:4189'
const manifest = { id: 'org.nocta.controlled', name: 'NOCTA — fixture CC0', version: '1.0.0', description: 'Original synthetic color bars and tones; por/eng are metadata labels, not speech.', types: ['movie', 'series'], resources: ['catalog', 'meta', { name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt', 'tmdb:'] }], catalogs: [{ id: 'samples', type: 'movie', name: 'Amostras próprias' }, { id: 'samples', type: 'series', name: 'Episódios sintéticos' }] }
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Range'); res.setHeader('Cache-Control', 'no-store')
  const json = (data, status=200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
  const pathname = decodeURIComponent(new URL(req.url, origin).pathname)
  if (pathname === '/manifest.json') return json(manifest)
  const match = /^\/(catalog|meta|stream)\/(movie|series)\/(.+)\.json$/.exec(pathname)
  if (match) {
    const [,resource,type,id] = match
    if (resource === 'catalog') return json({ metas: [{ id: type === 'movie' ? 'tt1254207' : 'tmdb:1', type, name: 'Fixture original (não é a obra do ID)' }] })
    if (resource === 'meta') return json({ meta: { id, type, name: 'Fixture original', videos: [1,2].map(episode => ({ id: `${id}:1:${episode}`, title: `Amostra ${episode}`, season: 1, episode })) } })
    if (id.startsWith('tt0000000')) return setTimeout(() => json({ streams: [] }), 1000)
    if (id.startsWith('tt0000001')) return json({ streams: [] })
    return json({ streams: [
      { name: 'MP4 · 180p · CC0', description: 'Tons sintéticos; idiomas apenas declarados', languages: ['pt-BR','en'], url: `${origin}/media/sample.mp4` },
      { name: 'HLS · áudio alternativo · CC0', languages: ['pt-BR','en'], url: `${origin}/media/master.m3u8` },
      { name: 'Modalidade não suportada', externalUrl: 'https://example.invalid/embed' },
    ] })
  }
  if (pathname.startsWith('/media/')) {
    const file = path.resolve(root, path.basename(pathname))
    try {
      const size = (await stat(file)).size
      const mime = file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t'
      const bytes = await readFile(file)
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '')
      if (range) { const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):size-1,size-1); if(start>end){res.writeHead(416);return res.end()} res.writeHead(206, {'Content-Type':mime,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});return res.end(bytes.subarray(start,end+1)) }
      res.writeHead(200, {'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': size }); return res.end(bytes)
    } catch { return json({error:'Gere as amostras com generate-media.py'},404) }
  }
  json({error:'not found'},404)
})
server.listen(4189,'127.0.0.1',()=>console.log(`Fixture controlada: ${origin}/manifest.json`))
