import { useSearchParams } from 'react-router'
import { Bookmark, Clock3, Trash2 } from 'lucide-react'
import { useLibrary, isTimedProgress, isCompleted } from '../state/library'
import { MediaCard } from '../components/MediaCard'
import { EmptyState } from '../components/Feedback'
import { ContinueWatching } from '../components/ContinueWatching'
import { progressKey } from '../domain/episodes'
import { isPublicMedia } from '../services/mediaAvailability'

export function Library() {
  const { state, clearHistory, removeProgress, setCompleted } = useLibrary()
  const [params, setParams] = useSearchParams()
  const tab = params.get('aba') === 'history' ? 'history' : 'favorites'
  const setTab = (value: string) => setParams({ aba: value }, { replace: true })
  const favorites = state.favorites.filter(isPublicMedia)
  const history = Object.values(state.progress).filter(p => p.media.source === 'tmdb').sort((a, b) => b.updatedAt - a.updatedAt)
  return <div className="page-shell library-page">
    <p className="eyebrow">DO SEU JEITO, NO SEU TEMPO</p>
    <h1>Sua pequena<br />coleção de histórias<span className="heading-dot">.</span></h1>
    <p className="page-subtitle">Os títulos que chamaram sua atenção. Todos no mesmo lugar.</p>
    <div className="library-tabs">
      <button className={tab === 'favorites' ? 'active' : ''} aria-pressed={tab === 'favorites'} onClick={() => setTab('favorites')}><Bookmark size={16} />Minha lista <span>{favorites.length}</span></button>
      <button className={tab === 'history' ? 'active' : ''} aria-pressed={tab === 'history'} onClick={() => setTab('history')}><Clock3 size={16} />Histórico <span>{history.length}</span></button>
    </div>
    {tab === 'favorites' ? favorites.length
      ? <div className="media-grid">{favorites.map(media => <MediaCard key={media.id} media={media} />)}</div>
      : <EmptyState title="Sua próxima coleção começa aqui" description="Toque no marcador de um título para guardá-lo. Sua lista fica salva neste dispositivo." />
      : <>
        {history.length > 0 && <div className="history-controls"><span>Salvo neste dispositivo</span><button className="text-link" onClick={clearHistory}><Trash2 size={14} />Limpar histórico</button></div>}
        <ContinueWatching />
        {history.length ? <div className="media-grid">{history.map(entry => {
          const key = progressKey(entry.media.id, entry.episode)
          const completed = isCompleted(entry)
          const name = `${entry.media.title}${entry.episode ? `, temporada ${entry.episode.seasonNumber}, episódio ${entry.episode.episodeNumber}` : ''}`
          const caption = completed ? 'Concluído' : isTimedProgress(entry)
            ? `${Math.floor(entry.positionMs / 60000)} de ${Math.ceil(entry.durationMs / 60000)} min`
            : `${entry.episode ? 'Retomar episódio' : 'Retomar título'} · tempo não informado`
          return <div key={key}>
            <MediaCard media={entry.media} episode={entry.episode} />
            <p className="history-caption">{caption} · {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString('pt-BR') : 'Data não registrada'}</p>
            <div className="history-actions">
              <button className="history-action" aria-label={`${completed ? 'Marcar como não assistido' : 'Marcar como assistido'}: ${name}`} onClick={() => setCompleted(key, !completed)}>{completed ? 'Marcar como não assistido' : 'Marcar como assistido'}</button>
              <button className="history-action" aria-label={`Excluir ${name} do histórico`} onClick={() => removeProgress(key)}>Excluir</button>
            </div>
          </div>
        })}</div> : <EmptyState title="Sua sessão ainda vai começar" description="Seu histórico aparecerá aqui ao abrir um título. O tempo assistido será salvo quando o player informar progresso real." />}
      </>}
    <p className="local-note">Sem conta, sem sincronização externa. Seus favoritos e seu histórico pertencem a este navegador.</p>
  </div>
}
