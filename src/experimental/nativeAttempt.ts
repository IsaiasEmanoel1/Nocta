import type { PlayerEvent, PlayerInput } from './playbackEngine'

/** Hash exact input, including transient URL/headers, without exposing either in diagnostics. */
export async function nativeInputFingerprint(input:PlayerInput) {
 const bytes=new TextEncoder().encode(JSON.stringify([input.url,input.mimeType,Object.entries(input.headers??{}).sort(([a],[b])=>a.localeCompare(b))]))
 const hash=await crypto.subtle.digest('SHA-256',bytes)
 return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('').slice(0,24)
}
export function currentNativeEvent(event:PlayerEvent, activeSession:string|undefined) {
 return !!activeSession && event.sessionId===activeSession && event.stale!==true
}
export function nativeFailureText(event:PlayerEvent) {
 return event.detail==='STARTUP_TIMEOUT'
  ? 'O vídeo e o áudio não iniciaram em 45 segundos. Tente novamente nesta fonte ou escolha outra.'
  : `Falha nativa ${event.category??'initialization'}: ${event.detail??'sem detalhe'}. Tente novamente ou escolha outra fonte.`
}

const networkCauses = new Map(Object.entries({
 'dns':'Falha de resolução DNS', 'dns-policy':'DNS retornou endereço fora da política',
 'tcp-connect':'Falha ao conectar por TCP', 'tls':'Falha na negociação TLS ou na validação do certificado',
 'connection-ended':'Conexão encerrada durante a resposta', 'socket':'Falha no socket',
 'network-timeout':'Tempo limite de rede', 'http-status':'Resposta HTTP inesperada',
 'http-protocol':'Resposta fora do protocolo HTTP', 'http-content-type':'Tipo de conteúdo HTTP inesperado',
 'redirect-policy':'Redirecionamento recusado pela política de rede', 'redirect-limit':'Limite de redirecionamentos atingido',
 'destination-policy':'Destino recusado pela política de rede', 'cleartext-policy':'HTTP sem TLS recusado pelo Android',
 'header-policy':'Cabeçalho incompatível com a configuração do player',
 'hls-returned-mp4':'O servidor entregou MP4 no lugar da playlist HLS',
}))
const mediaStages = new Map(Object.entries({
 'progressive':'abertura/leitura de mídia progressiva', 'hls-main-playlist':'playlist HLS principal',
 'hls-variant-playlist':'playlist HLS de qualidade ou faixa', 'hls-segment':'segmento HLS',
 'hls-segment-resource':'recurso associado a um segmento HLS', 'hls-initialization':'inicialização HLS',
 'hls-key':'chave HLS', 'hls-resource':'recurso HLS sem etapa identificada', 'client-configuration':'configuração do cliente',
}))
const networkJournal: string[] = []
export const recentNativeFailures = () => [...networkJournal]

export function recordNativeNetworkFailure(provider:string, source:string, mime:string, event:PlayerEvent) {
 const loadError=event.event==='diagnostic'&&event.detail?.startsWith('load-error-')
 if(!loadError&&(event.event!=='failed'||event.category!=='network'))return false
 const operation=event.httpOperation===1?'abertura HTTP':event.httpOperation===2?'leitura HTTP':undefined
 const redirect=event.redirectStatus&&`redirecionamento ${event.redirectStatus}${event.destinationScheme==='http'?' para HTTP':event.destinationScheme==='https'?' para HTTPS':''}`
 const text=[provider,source,mime,loadError?'erro de carga':'falha terminal',mediaStages.get(event.mediaStage??''),operation,
  networkCauses.get(event.networkCause??'')??'Causa de rede não identificada',redirect,
  event.httpStatus&&`HTTP ${event.httpStatus}`,event.errorCode&&`código ${event.errorCode}`].filter(Boolean).join(' · ')
 const previous=networkJournal.indexOf(text)
 if(previous!==-1)networkJournal.splice(previous,1)
 networkJournal.push(text)
 if(networkJournal.length>30)networkJournal.shift()
 return true
}
