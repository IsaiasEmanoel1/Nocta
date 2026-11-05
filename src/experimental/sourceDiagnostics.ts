export type SourceState = 'tested' | 'untested' | 'failed' | 'web-incompatible' | 'native-only' | 'unavailable'
export const sourceStateLabels: Record<SourceState,string> = {
 tested:'Reproduzível e testada', untested:'Compatível, mas não testada', failed:'Reprodução falhou',
 'web-incompatible':'Incompatível com o player web', 'native-only':'Somente nativo — comprovado', unavailable:'Indisponível para reprodução nesta configuração',
}
export interface SourcePlaybackResult { state: SourceState; detail?: string; loaded?: boolean; playedSeconds?: number }
export function initialSourceResult(source: {url?:string; reason?:string; reportedFormat?:string}): SourcePlaybackResult {
 if(source.url) return {state:'untested'}
 if(['embed','torrent','youtube','other'].includes(source.reportedFormat??'')) return {state:'web-incompatible',detail:source.reason}
 return {state:'unavailable',detail:source.reason}
}
export function recordSourceEvent(previous:SourcePlaybackResult,event:'loaded'|'playing'|'progress'|'failed',seconds=0,detail?:string):SourcePlaybackResult {
 if(event==='failed') return {...previous,state:'failed',detail:detail||'Falha no carregamento ou decodificação. CORS e codec não foram inferidos.'}
 if(event==='loaded') return {...previous,loaded:true}
 // Metadata or play promise alone are not a playback success; require actual clock advancement.
 if(event==='progress' && seconds>1) return {...previous,state:'tested',playedSeconds:seconds,detail:'Tempo avançou no elemento de vídeo; idioma falado não confirmado.'}
 return previous
}
