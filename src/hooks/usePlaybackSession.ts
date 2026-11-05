import { useEffect, useState } from 'react'
import type { EpisodeSelection } from '../domain/episodes'
import { progressKey, validSelection } from '../domain/episodes'
import type { PlaybackProvider, PlaybackSession } from '../services/playback'
import { playbackCapabilities } from '../services/playback'
import type { PlaybackCapabilities } from '../services/playback'
import { reportMediaFailure } from '../services/mediaAvailability'

export interface ActivePlayback { session: PlaybackSession; capabilities: PlaybackCapabilities; episode?: EpisodeSelection; key: string }
export function usePlaybackSession(id: string, episode: EpisodeSelection | undefined, provider: PlaybackProvider, validate?: (episode: EpisodeSelection, signal: AbortSignal) => Promise<boolean>) {
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState<{ active?: ActivePlayback; pending: boolean; error?: string }>({ pending: true })
  const key = progressKey(id, episode)
  useEffect(() => {
    const controller = new AbortController()
    setState(previous => ({ ...previous, pending: true, error: undefined }))
    Promise.resolve().then(async () => {
      if (episode && (!validSelection(episode) || (validate && !await validate(episode, controller.signal)))) throw new Error('Este episódio não consta nesta temporada.')
      return controller.signal.aborted ? null : provider.resolve({ mediaId: id, ...(episode ? { seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber } : {}) }, controller.signal)
    })
      .then(session => {
        if (controller.signal.aborted) return
        if (session) {
          setState({ active: { session, capabilities: playbackCapabilities(session), episode, key }, pending: false })
        } else {
          reportMediaFailure(id, episode)
          setState(previous => ({ ...previous, pending: false, error: 'Não há uma fonte de reprodução disponível para esta seleção.' }))
        }
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setState(previous => ({ ...previous, pending: false, error: error instanceof Error ? error.message : 'Não foi possível preparar a reprodução. Tente novamente.' }))
      })
    return () => controller.abort()
  }, [id, key, provider, retry, validate])
  return { ...state, retry: () => setRetry(value => value + 1) }
}
