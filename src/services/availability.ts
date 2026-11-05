import { progressKey, validSelection } from '../domain/episodes'
import type { EpisodeSelection } from '../domain/episodes'
import { isMediaUnavailable } from './mediaAvailability'

export type AvailabilityStatus = 'available' | 'unavailable' | 'unknown' | 'checking' | 'error'
export interface AvailabilityRequest { mediaId: string; episode?: EpisodeSelection }
export interface AvailabilityRecord {
  key: string; status: AvailabilityStatus; source: string
  checkedAt: number | null; expiresAt: number | null
}
export interface AvailabilityService {
  peek(request: AvailabilityRequest): AvailabilityRecord
  check(request: AvailabilityRequest, options?: { force?: boolean; signal?: AbortSignal }): Promise<AvailabilityRecord>
}
export type AvailabilityChecker = (request: AvailabilityRequest, signal?: AbortSignal) => Promise<{
  status: 'available' | 'unavailable' | 'unknown'; source: string; ttlMs: number
}>
export const availabilityMessage = (status: AvailabilityStatus) => ({
  available: 'Disponibilidade confirmada', unavailable: 'Reprodução indisponível para esta seleção',
  unknown: 'Disponibilidade não confirmada', checking: 'Verificando disponibilidade…',
  error: 'Não foi possível verificar a disponibilidade. Tente novamente.',
})[status]
export class CachedAvailabilityService implements AvailabilityService {
  private cache = new Map<string, AvailabilityRecord>()
  private revisions = new Map<string, number>()
  constructor(private checker: AvailabilityChecker, private now = Date.now) {}
  peek(request: AvailabilityRequest): AvailabilityRecord {
    const key = progressKey(request.mediaId, request.episode)
    const value = this.cache.get(key)
    return value && value.expiresAt !== null && value.expiresAt > this.now() ? value
      : { key, status: 'unknown', source: 'not-verified', checkedAt: null, expiresAt: null }
  }
  async check(request: AvailabilityRequest, options: { force?: boolean; signal?: AbortSignal } = {}): Promise<AvailabilityRecord> {
    const key = progressKey(request.mediaId, request.episode)
    if (!request.mediaId.trim() || (request.episode && !validSelection(request.episode))) throw new Error('Seleção inválida')
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const cached = this.peek(request)
    if (!options.force && !['unknown', 'checking'].includes(cached.status) && cached.expiresAt! > this.now()) return cached
    if (!options.force && cached.status === 'unknown' && cached.expiresAt !== null) return cached
    const revision = (this.revisions.get(key) ?? 0) + 1
    this.revisions.set(key, revision)
    this.cache.set(key, { key, status: 'checking', source: 'verification', checkedAt: null, expiresAt: this.now() + 10000 })
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancel: (() => void) | undefined
    try {
      const answer = await Promise.race([
        this.checker(request, options.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Verification timeout')), 10000)
          cancel = () => reject(new DOMException('Aborted', 'AbortError'))
          options.signal?.addEventListener('abort', cancel, { once: true })
        }),
      ])
      if (!['available', 'unavailable', 'unknown'].includes(answer.status) || !answer.source.trim() || !Number.isFinite(answer.ttlMs) || answer.ttlMs <= 0) throw new Error('Invalid evidence')
      const checkedAt = this.now()
      const record = { key, status: answer.status, source: answer.source, checkedAt, expiresAt: checkedAt + Math.min(answer.ttlMs, 300000) }
      if (this.revisions.get(key) === revision) this.cache.set(key, record)
      return record
    } catch (error) {
      if (options.signal?.aborted) {
        if (this.revisions.get(key) === revision) this.cache.delete(key)
        throw error
      }
      const checkedAt = this.now()
      const record: AvailabilityRecord = { key, status: 'error', source: 'verification-error', checkedAt, expiresAt: checkedAt + 10000 }
      if (this.revisions.get(key) === revision) this.cache.set(key, record)
      return record
    } finally {
      clearTimeout(timer)
      if (cancel) options.signal?.removeEventListener('abort', cancel)
    }
  }
}

// No documented item inventory API was found. Never probe player pages or treat load as evidence.
export const availabilityService: AvailabilityService = new CachedAvailabilityService(async request =>
  isMediaUnavailable(request.mediaId, request.episode)
    ? { status: 'unavailable', source: 'observed-media-failure', ttlMs: 10000 }
    : { status: 'unknown', source: 'embedmovies-no-documented-inventory', ttlMs: 60000 })
