import type { CatalogProvider, Episode, Media } from './media'

export interface EpisodeSelection { seasonNumber: number; episodeNumber: number }
export interface PlaybackProgress { positionSeconds: number; durationSeconds: number }
export const positiveNumber = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
export function validSelection(value: unknown): value is EpisodeSelection {
  const selection = value as EpisodeSelection | undefined
  return Boolean(selection && positiveNumber(selection.seasonNumber) && positiveNumber(selection.episodeNumber))
}
export const progressKey = (id: string, episode?: EpisodeSelection) => episode ? `${id}:s${episode.seasonNumber}:e${episode.episodeNumber}` : id
export function playbackPath(id: string, episode?: EpisodeSelection) {
  return `/assistir/${encodeURIComponent(id)}${episode ? `?temporada=${episode.seasonNumber}&episodio=${episode.episodeNumber}` : ''}`
}
export function selectionFromUrl(params: URLSearchParams): EpisodeSelection | undefined {
  const value = { seasonNumber: Number(params.get('temporada')), episodeNumber: Number(params.get('episodio')) }
  return validSelection(value) ? value : undefined
}
export function playableEpisodes(episodes: Episode[]) {
  const seen = new Set<number>()
  return episodes.filter(episode => positiveNumber(episode.number) && !seen.has(episode.number) && seen.add(episode.number)).sort((a, b) => a.number - b.number)
}
export const NEXT_EPISODE_SECONDS = 35
export function nearEpisodeEnd(progress: PlaybackProgress, threshold = NEXT_EPISODE_SECONDS) {
  return Number.isFinite(progress.positionSeconds) && Number.isFinite(progress.durationSeconds)
    && progress.durationSeconds > 0 && progress.positionSeconds > 0
    && progress.positionSeconds <= progress.durationSeconds
    // Keep short clips from showing a next prompt almost immediately.
    && progress.durationSeconds - progress.positionSeconds <= Math.min(threshold, progress.durationSeconds * .3)
}
export interface EpisodeSequence {
  episodes: Episode[]; next?: EpisodeSelection; previous?: EpisodeSelection; notice?: string
  status: 'ready' | 'missing' | 'unknown' | 'complete'
}
export async function episodeSequence(media: Media, selection: EpisodeSelection, provider: CatalogProvider, signal: AbortSignal): Promise<EpisodeSequence> {
  const result = await provider.episodes(media, selection.seasonNumber, signal)
  const episodes = playableEpisodes(result.data)
  if (signal.aborted || result.origin === 'fallback') return { episodes, status: 'unknown', notice: result.notice }
  if (!episodes.some(episode => episode.number === selection.episodeNumber)) return { episodes, status: 'missing', notice: 'Este episódio não consta nesta temporada.' }
  const before = episodes.filter(episode => episode.number < selection.episodeNumber).at(-1)
  const after = episodes.find(episode => episode.number > selection.episodeNumber)
  let previous = before ? { seasonNumber: selection.seasonNumber, episodeNumber: before.number } : undefined
  let next = after ? { seasonNumber: selection.seasonNumber, episodeNumber: after.number } : undefined
  const seasons = media.seasons?.filter(season => positiveNumber(season.number) && season.episodeCount > 0).sort((a, b) => a.number - b.number) ?? []
  let notice = result.notice
  if (!previous) {
    const priorSeason = seasons.filter(season => season.number < selection.seasonNumber).at(-1)
    if (priorSeason && !signal.aborted) {
      const prior = await provider.episodes(media, priorSeason.number, signal)
      const last = playableEpisodes(prior.data).at(-1)
      if (last) previous = { seasonNumber: priorSeason.number, episodeNumber: last.number }
    }
  }
  if (!next) {
    const nextSeason = seasons.find(season => season.number > selection.seasonNumber)
    if (nextSeason && !signal.aborted) {
      const following = await provider.episodes(media, nextSeason.number, signal)
      if (following.origin === 'fallback') return { episodes, previous, status: 'unknown', notice: following.notice }
      const first = playableEpisodes(following.data)[0]
      if (first) next = { seasonNumber: nextSeason.number, episodeNumber: first.number }
      else return { episodes, previous, status: 'unknown', notice: following.notice || 'Próxima temporada ainda sem episódios disponíveis.' }
      notice = notice || following.notice
    }
  }
  return { episodes, next, previous, notice, status: next ? 'ready' : 'complete' }
}
