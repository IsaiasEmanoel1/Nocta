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
