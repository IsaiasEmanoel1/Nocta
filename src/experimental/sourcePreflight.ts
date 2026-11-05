import type { AddonSource } from './StremioAddonAdapter'
export type PreflightState='verified'|'compatible'|'incompatible'|'temporary'|'unknown'
export interface PreflightResult { state:PreflightState; detail:string; checking?:boolean; playlist:'not-checked'|'accessible'|'failed'; segments:'not-checked'; checkedAt?:number }
export const preflightLabels:Record<PreflightState,string>={verified:'Reprodução verificada',compatible:'Compatível, mas não verificada',incompatible:'Incompatível com reprodução web',temporary:'Temporariamente indisponível',unknown:'Formato desconhecido'}
export function sourceBaseline(source:AddonSource):PreflightResult {
 const base={playlist:'not-checked' as const,segments:'not-checked' as const}
 if(source.requiredHeaders?.length||/proxyHeaders|Modalidade externa/.test(source.reason??''))return {...base,state:'incompatible',detail:source.reason!}
 if(!source.url)return {...base,state:source.reportedFormat==='other'?'unknown':'incompatible',detail:source.reason??'Fonte não liberada pelo adaptador.'}
 return {...base,state:'compatible',detail:source.format==='hls'?'Aguardando verificação da playlist.':'Formato reconhecido. Disponibilidade e reprodução ainda não verificadas.'}
}
/** One queue per experimental screen, including manual retries. No probes of MP4 redirects. */
export class SourcePreflight {
 private active=0
 private queue:(()=>void)[]=[]
 private cache=new Map<string,{until:number;result:PreflightResult}>()
 constructor(private fetcher:typeof fetch=globalThis.fetch.bind(globalThis),private timeoutMs=3500){}
 async check(source:AddonSource,validate:(url:string)=>void,signal:AbortSignal,force=false):Promise<PreflightResult>{
  const baseline=sourceBaseline(source)
  if(!source.url||source.format!=='hls')return baseline
  const cached=this.cache.get(source.url)
  if(!force&&cached&&cached.until>Date.now())return cached.result
  await new Promise<void>(resolve=>{this.queue.push(resolve);this.pump()})
  const controller=new AbortController();let timedOut=false
  const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)controller.abort()
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},this.timeoutMs)
  const finish=(state:PreflightState,detail:string,playlist:PreflightResult['playlist']='failed'):PreflightResult=>({state,detail,playlist,segments:'not-checked',checkedAt:Date.now()})
  let result:PreflightResult
  try{
   if(signal.aborted)throw new Error('cancelled')
   validate(source.url)
   const response=await this.fetcher(source.url,{method:'GET',mode:'cors',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal})
   if(!response.ok)result=finish('temporary',`Playlist retornou HTTP ${response.status}; reprodução não verificada.`)
   else {
    if(Number(response.headers.get('content-length'))>65536)throw new Error('Playlist excede limite de 64 KiB.')
    const reader=response.body?.getReader();let text='',size=0;const decoder=new TextDecoder()
    if(reader){try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)throw new Error('Playlist excede limite de 64 KiB.');text+=decoder.decode(part.value,{stream:true})}text+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}}
    else text=await response.text()
    if(text.length>65536)throw new Error('Playlist excede limite de 64 KiB.')
    if(!text.replace(/^\uFEFF/,'').trimStart().startsWith('#EXTM3U'))result=finish('incompatible','O GET retornou conteúdo que não é uma playlist HLS válida.')
    else result=finish('compatible','Playlist HLS acessível. Segmentos, codecs, áudio e reprodução não verificados.','accessible')
   }
  }catch(error){result=finish('temporary',timedOut?'Timeout curto ao ler a playlist; verifique novamente.':error instanceof Error&&error.message.startsWith('Playlist excede')?error.message:'Falha de rede, redirecionamento recusado ou CORS. O navegador não expôs a causa específica; não há diagnóstico automático de CORS.')}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);this.active--;this.pump()}
  if(!signal.aborted)this.cache.set(source.url,{result,until:Date.now()+(result.state==='compatible'?30000:10000)})
  return result
 }
 private pump(){while(this.active<2&&this.queue.length){this.active++;this.queue.shift()!()}}
}
