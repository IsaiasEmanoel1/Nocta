import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { FlaskConical, ShieldCheck } from 'lucide-react'
import { BackLink } from '../components/Layout'
import { FrameProbe } from '../components/FrameProbe'
import { buildEmbedWaveUrl, EMBEDWAVE_SERVERS, embedwaveProvider, validateEmbedWaveRequest } from '../services/embedwave'
import type { EmbedWaveRequest } from '../services/embedwave'
import type { IframePlaybackSession, PlaybackAssessment } from '../services/authorizedPlayback'

export function PlaybackDiagnostics() {
  const [kind, setKind] = useState<'movie' | 'tv'>('movie')
  const [id, setId] = useState('')
  const [season, setSeason] = useState('1')
  const [episode, setEpisode] = useState('1')
  const [server, setServer] = useState<EmbedWaveRequest['server']>('nxsha')
  const [autoplay, setAutoplay] = useState(false)
  const [territory, setTerritory] = useState('BR')
  const [assessment, setAssessment] = useState<PlaybackAssessment<IframePlaybackSession>>()
  const [pending, setPending] = useState(false)
  const [started, setStarted] = useState(false)
  const [fixture, setFixture] = useState<{ challenge: string; url: string }>()
  const revision = useRef(0)
  const request: EmbedWaveRequest = { kind, tmdbId: Number(id), server, autoplay, ...(kind === 'tv' ? { season: Number(season), episode: Number(episode) } : {}) }
  const preview = validateEmbedWaveRequest(request) ? buildEmbedWaveUrl(request) : ''
  function reset() { revision.current++; setAssessment(undefined); setStarted(false) }
  async function assess(event: React.FormEvent) {
    event.preventDefault(); setStarted(false); setPending(true)
    const current = revision.current
    try { const result = await embedwaveProvider.assess(request, { origin: window.location.origin, territory }); if (current === revision.current) setAssessment(result) }
    catch { if (current === revision.current) setAssessment({ status: 'denied', reason: 'unavailable', message: 'Não foi possível verificar o fornecedor. Nenhum iframe será aberto.' }) }
    finally { setPending(false) }
  }
  function launchFixture() {
    const challenge = crypto.randomUUID()
    const url = new URL('/diagnostics/licensed-frame.html', window.location.origin)
    url.search = new URLSearchParams({ challenge, parentOrigin: window.location.origin }).toString()
    setFixture({ challenge, url: url.toString() })
  }
  return <div className="page-shell diagnostic-page"><BackLink /><p className="eyebrow"><FlaskConical size={14} /> LABORATÓRIO DE REPRODUÇÃO</p><h1>Diagnóstico de fornecedores<span className="heading-dot">.</span></h1>
    <p className="page-subtitle">Área técnica separada do catálogo. Não é uma área autenticada e não autoriza acesso a conteúdo.</p>
    <section className="diagnostic-panel"><h2><ShieldCheck size={21} /> EmbedWave · validação antes do iframe</h2><p>Não há obras com autorização confirmada para uso da EmbedWave neste projeto. Digitar um ID apenas monta uma URL textual. A conferência abaixo é local e não consulta o fornecedor.</p>
      <form onSubmit={assess} onChange={reset} className="diagnostic-form">
        <label>Tipo<select value={kind} onChange={e => setKind(e.target.value as 'movie' | 'tv')}><option value="movie">Filme</option><option value="tv">Episódio de série</option></select></label>
        <label>ID TMDB<input inputMode="numeric" autoComplete="off" value={id} onChange={e => setId(e.target.value)} placeholder="Identificador numérico positivo" /></label>
        {kind === 'tv' && <><label>Temporada<input type="number" min="1" step="1" value={season} onChange={e => setSeason(e.target.value)} /></label><label>Episódio<input type="number" min="1" step="1" value={episode} onChange={e => setEpisode(e.target.value)} /></label></>}
        <label>Backend documentado<select value={server} onChange={e => setServer(e.target.value as EmbedWaveRequest['server'])}>{EMBEDWAVE_SERVERS.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Território da avaliação<select value={territory} onChange={e => setTerritory(e.target.value)}><option value="BR">Brasil (BR)</option><option value="PT">Portugal (PT)</option></select></label>
        <label className="diagnostic-checkbox"><input type="checkbox" checked={autoplay} onChange={e => setAutoplay(e.target.checked)} /> Solicitar autoplay (o navegador pode recusar)</label>
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Verificando…' : 'Verificar direitos e disponibilidade'}</button>
      </form>
      <div className="url-preview"><span>URL prevista · não é um link de reprodução</span><code data-testid="embed-url-preview">{preview || 'Preencha um identificador válido para visualizar a estrutura.'}</code></div>
      {assessment && <div role="status" className="notice" data-testid="rights-result"><strong>{assessment.status === 'denied' ? `Bloqueado · ${assessment.reason}` : 'Configuração autorizada · reprodução ainda não testada'}</strong><p>{assessment.status === 'denied' ? assessment.message : 'Há evidência cadastrada de licença e disponibilidade para esta origem, território, item e backend. Isso não comprova funcionamento do player.'}</p></div>}
      {assessment?.status === 'ready' && !started && <button className="button button-glass" onClick={() => setStarted(true)}>Abrir iframe autorizado</button>}
      {assessment?.status === 'ready' && started && <FrameProbe url={assessment.session.url} title={assessment.session.title} mode="supplier" expiresAt={assessment.session.expiresAt} />}
      <p className="muted">Não há botão de autodeclaração de licença. As concessões ficam no manifesto revisado do projeto, nunca no catálogo ou no armazenamento do navegador. Em produção, a decisão deve ser aplicada por um servidor confiável.</p>
    </section>
    <section className="diagnostic-panel"><h2>Compatibilidade de iframe · amostra controlada</h2><p>Este teste usa uma página HTML do próprio projeto e Big Buck Bunny (CC BY 3.0), por streaming da amostra pública Google Cast. Não é o player da EmbedWave e não comprova a compatibilidade desse fornecedor.</p>
      <div className="diagnostic-actions"><button className="button button-secondary" onClick={launchFixture}>Testar iframe com curta autorizado</button>{fixture && <button className="button button-glass" onClick={() => setFixture(undefined)}>Fechar teste de iframe</button>}<Link className="text-link" to="/diagnostico/player/demo-bunny">Abrir o player de demonstração original</Link></div>
      {fixture && <FrameProbe key={fixture.challenge} url={fixture.url} challenge={fixture.challenge} title="Diagnóstico local — Big Buck Bunny" mode="licensed-fixture" />}
    </section>
    <section className="diagnostic-panel diagnostic-notes"><h2>Referências e limites</h2><ul><li>Parâmetros implementados: <code>server</code> e solicitação <code>autoplay=1</code>. <code>nobrand</code> é reservado a parceiros e não é aceito.</li><li>Um evento <code>load</code> de iframe também pode ocorrer em falhas. Sem sinal documentado do fornecedor, o estado permanece não confirmado.</li><li>Não lemos DOM, mídia interna ou progresso do iframe externo. O protocolo de mensagens do teste local não pertence à EmbedWave.</li><li>Sandbox e restrições de origem, CSP e X-Frame-Options são preservados. Não há proxy nem troca automática de backend para superar restrições.</li><li>Documentação e termos foram consultados em 01/11/2026. Não foi fornecida uma licença de catálogo da EmbedWave.</li></ul><p><a href="https://embedwave.cc/docs" target="_blank" rel="noreferrer">Documentação oficial ↗</a> · <a href="https://embedwave.cc/terms" target="_blank" rel="noreferrer">Termos oficiais ↗</a></p></section>
  </div>
}
