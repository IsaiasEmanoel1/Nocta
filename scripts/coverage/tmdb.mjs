import {createServer} from 'vite'
import {concurrency,sampleQuotas} from './core.mjs'

export async function configuredManifests() {
 const server=await createServer({server:{middlewareMode:true,ws:false}})
 try {
  const {automaticAddonConfigs}=await server.ssrLoadModule('/src/playback/providers.ts')
  return automaticAddonConfigs.map(({id,manifestUrl})=>({id,manifestUrl}))
 }finally{await server.close()}
}

export async function collectTitles(total,signal) {
 const server=await createServer({server:{middlewareMode:true,ws:false}})
 try {
  const {catalog,tmdbConfigured}=await server.ssrLoadModule('/src/services/catalog.ts')
  const {catalogRailSpecs}=await server.ssrLoadModule('/src/config/catalogRails.ts')
  const {playableEpisodes}=await server.ssrLoadModule('/src/domain/episodes.ts')
  if(!tmdbConfigured)throw Error('Configure VITE_TMDB_API_KEY no ambiente ou no .env.')
  const wanted=sampleQuotas(total),chosen=[],seen=new Set()
  const today=new Date().toISOString().slice(0,10)
  const recent=String(Number(today.slice(0,4))-3)+'-01-01'
  const specs=catalogRailSpecs()
  const base=id=>specs.find(spec=>spec.id===id)
  const popular=kind=>base(kind+'-popular')
  const discover=(kind,params,sort='popularity.desc')=>({id:'coverage',title:'Amostra',mediaType:kind,source:'discover',sort,params})
  const animation=(classic)=>discover('movie',{with_genres:'16',region:'BR',
   ...(classic?{'primary_release_date.lte':'2005-12-31','vote_count.gte':'150'}:{'primary_release_date.gte':'2006-01-01','primary_release_date.lte':today})},classic?'vote_count.desc':undefined)
  const cartoons=(classic)=>discover('tv',{with_genres:'16',without_genres:'10766',with_original_language:'en',
   ...(classic?{'first_air_date.lte':'2008-12-31','vote_count.gte':'25'}:{'first_air_date.gte':'2009-01-01','first_air_date.lte':today})},classic?'vote_count.desc':undefined)
  async function select(category,count,spec,accept=()=>true) {
   let found=0
   if(!count)return found
   for(let page=1;page<=(spec.source==='discover'?5:1);page++){
    signal.throwIfAborted()
    const result=await catalog.rail({...spec,params:{...spec.params,page:String(page)}},signal)
    for(const media of result.data?.items??[]){
     if(seen.has(media.id)||!accept(media))continue
     seen.add(media.id);chosen.push({category,media})
     if(++found===count)return found
    }
   }
   return found
  }
  const movie=m=>!m.genreIds.includes(16)&&m.year<=Number(today.slice(0,4))
  const series=m=>!m.genreIds.some(genre=>[16,10766].includes(genre))
  const moviesRecent=await select('filmes',Math.ceil(wanted.filmes/2),discover('movie',{region:'BR','primary_release_date.gte':recent,'primary_release_date.lte':today,without_genres:'16'}),movie)
  const moviesTrending=await select('filmes',wanted.filmes-moviesRecent,{...base('weekly'),mediaType:'movie'},movie)
  const moviesPopular=await select('filmes',wanted.filmes-moviesRecent-moviesTrending,popular('movie'),movie)
  await select('filmes',wanted.filmes-moviesRecent-moviesTrending-moviesPopular,discover('movie',{region:'BR',without_genres:'16','primary_release_date.lte':today}),movie)
  const classics=await select('animacoes',Math.floor(wanted.animacoes/2),animation(true))
  await select('animacoes',wanted.animacoes-classics,animation(false))
  const tvPopular=await select('series',wanted.series,popular('tv'),series)
  await select('series',wanted.series-tvPopular,discover('tv',{without_genres:'16,10766','first_air_date.lte':today}),series)
  const classicCartoons=await select('desenhos',Math.floor(wanted.desenhos/2),cartoons(true))
  await select('desenhos',wanted.desenhos-classicCartoons,cartoons(false))
  await select('animes',wanted.animes,base('anime'))
  const brazilian=await select('novelas',Math.ceil(wanted.novelas/2),{...base('novelas'),params:{with_origin_country:'BR'}})
  let international=wanted.novelas-brazilian
  for(const country of ['MX','TR','CO']){
   international-=await select('novelas',international,{...base('novelas'),params:{with_origin_country:country}})
   if(!international)break
  }
  if(chosen.length!==total)throw Error(`O TMDB forneceu ${chosen.length}/${total} títulos distintos nos critérios. Repita quando as listas estiverem acessíveis.`)
  const limit=concurrency(3)
  return await Promise.all(chosen.map(({category,media})=>limit(async()=>{
   signal.throwIfAborted()
   const detail=await catalog.detail(media.id,signal)
   const item=detail.data
   const title={category,title:media.title,year:media.year,type:media.kind==='movie'?'movie':'series',tmdb:Number(media.id.split('-').at(-1)),imdb:item?.imdbId,metadata:detail.origin}
   if(title.type==='movie')return title
   for(const season of [...(item?.seasons??[])].filter(s=>s.number>0&&s.episodeCount>0).sort((a,b)=>a.number-b.number).slice(0,3)){
    const result=await catalog.episodes(item,season.number,signal)
    const episode=playableEpisodes(result.origin==='tmdb'?result.data:[])[0]
    if(episode&&Number.isSafeInteger(episode.id)&&episode.id>0)return {...title,season:season.number,episode:episode.number,episodeTmdb:episode.id,episodeTitle:episode.name}
   }
   return title
  })))
 }finally{await server.close()}
}
