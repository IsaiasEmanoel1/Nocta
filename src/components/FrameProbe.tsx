import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

export type FrameStatus = 'loading' | 'loaded-unverified' | 'ready' | 'playing' | 'media-error' | 'unconfirmed' | 'load-error' | 'expired'
export const frameMessages: Record<FrameStatus, string> = {
  loading: 'Aguardando navegação do iframe…',
  'loaded-unverified': 'Evento load recebido. Isso não comprova carregamento do player nem reprodução.',
  ready: 'Handshake da página de teste recebido. Reprodução ainda não confirmada.',
  playing: 'Reprodução do curta autorizado confirmada pela página de teste.',
  'media-error': 'A página de teste informou falha de mídia. Verifique a conexão ou use o player de demonstração.',
  unconfirmed: 'Sem confirmação. Pode haver restrição de iframe, falha de rede ou ausência de protocolo de status.',
  'load-error': 'Falha de navegação informada pelo navegador. Nenhuma política de segurança será alterada.',
  expired: 'A confirmação de direitos ou disponibilidade expirou. O iframe foi removido.',
}
interface Props {
  url: string; title: string; mode: 'licensed-fixture' | 'supplier'; challenge?: string
  expectedOrigin?: string; timeoutMs?: number; expiresAt?: number
}
export function FrameProbe({ url, title, mode, challenge, expectedOrigin = 'null', timeoutMs = 12000, expiresAt }: Props) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<FrameStatus>('loading')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    setStatus('loading')
    const timeout = setTimeout(() => setStatus(previous => ['loading', 'loaded-unverified'].includes(previous) ? 'unconfirmed' : previous), timeoutMs)
    const expiry = expiresAt === undefined ? undefined : setTimeout(() => setStatus('expired'), Math.max(0, Math.min(expiresAt - Date.now(), 2147483647)))
    const listener = (event: MessageEvent) => {
      // This protocol belongs only to our controlled fixture, never to EmbedWave.
      if (mode !== 'licensed-fixture' || !challenge || event.source !== ref.current?.contentWindow || event.origin !== expectedOrigin) return
      const data = event.data
      if (!data || data.protocol !== 'nocta-fixture-v1' || data.challenge !== challenge) return
      if (data.event === 'ready') setStatus(previous => previous === 'playing' ? previous : 'ready')
      if (data.event === 'playing') setStatus('playing')
      if (data.event === 'media-error') setStatus('media-error')
    }
    const frame = ref.current
    const loadError = () => setStatus('load-error')
    frame?.addEventListener('error', loadError)
    window.addEventListener('message', listener)
    return () => { clearTimeout(timeout); clearTimeout(expiry); frame?.removeEventListener('error', loadError); window.removeEventListener('message', listener) }
  }, [url, retry, mode, challenge, expectedOrigin, timeoutMs, expiresAt])
  const expired = status === 'expired' || (expiresAt !== undefined && expiresAt <= Date.now())
  return <div className="frame-probe">
    {!expired && <div className="diagnostic-frame"><iframe key={`${url}-${retry}`} ref={ref} src={url} title={title}
      sandbox={mode === 'licensed-fixture' ? 'allow-scripts' : 'allow-scripts allow-same-origin'}
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="no-referrer"
      onLoad={() => setStatus(previous => previous === 'loading' ? 'loaded-unverified' : previous)} /></div>}
    <p role="status" className="notice" data-testid="frame-status" data-status={expired ? 'expired' : status}>{frameMessages[expired ? 'expired' : status]}</p>
    <div className="diagnostic-actions">{!expired && <button className="button button-glass" onClick={() => setRetry(value => value + 1)}>Repetir com as mesmas restrições</button>}<Link className="button button-secondary" to="/diagnostico/player/demo-bunny">Usar demonstração autorizada</Link></div>
    <p className="muted">Popups, navegação do topo, formulários e downloads não são autorizados pelo sandbox. Se a fonte exigir permissões adicionais, o teste permanece inconclusivo; não há relaxamento automático.</p>
  </div>
}
