/** A readiness decision is not evidence that playback actually started. */
export type PlaybackDenial = 'invalid-request' | 'license-missing' | 'license-expired' | 'scope-denied' | 'terms-unapproved' | 'availability-unknown' | 'unavailable' | 'ad-policy-unverified'
export type PlaybackAssessment<T> = { status: 'ready'; session: T } | { status: 'denied'; reason: PlaybackDenial; message: string }
export interface LicensedPlaybackProvider<Request, Session> {
  assess(request: Request, context: PlaybackContext): Promise<PlaybackAssessment<Session>>
}
export interface PlaybackContext { origin: string; territory: string; now?: number }
export interface RightsGrant {
  provider: 'embedwave'; contentKey: string; server: string; title: string
  evidenceReference: string; reviewedBy: string; reviewedAt: string
  validFrom: string; validUntil: string; territories: string[]; origins: string[]
  permissions: ('embed' | 'exhibit')[]
  adPolicy: 'confirmed-ad-free' | 'unverified'
  availability: { status: 'confirmed' | 'unknown' | 'unavailable'; checkedAt: string; validUntil: string; evidenceReference: string }
}
export interface ProviderPolicy { termsApproved: boolean; termsReference: string; grants: readonly RightsGrant[] }
export interface IframePlaybackSession {
  kind: 'iframe'; provider: 'embedwave'; title: string; url: string
  rightsReference: string; availabilityReference: string; expiresAt: number
}
export const deny = <T,>(reason: PlaybackDenial, message: string): PlaybackAssessment<T> => ({ status: 'denied', reason, message })

export function validateRights(policy: ProviderPolicy, contentKey: string, server: string, context: PlaybackContext): PlaybackAssessment<RightsGrant> {
  const now = context.now ?? Date.now()
  if (!Number.isFinite(now) || !/^[A-Z]{2}$/.test(context.territory)) return deny('invalid-request', 'Contexto de avaliação inválido.')
  try { const origin = new URL(context.origin); if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== context.origin) return deny('invalid-request', 'Origem de avaliação inválida.') }
  catch { return deny('invalid-request', 'Origem de avaliação inválida.') }
  const grant = policy.grants.find(g => g.provider === 'embedwave' && g.contentKey === contentKey && g.server === server)
  if (!grant || !grant.evidenceReference.trim() || !grant.reviewedBy.trim()) return deny('license-missing', 'Nenhuma autorização de incorporação e exibição foi confirmada para este item e backend.')
  const start = Date.parse(grant.validFrom), end = Date.parse(grant.validUntil), review = Date.parse(grant.reviewedAt)
  if (![start, end, review].every(Number.isFinite) || start > now || end <= now || review > now) return deny('license-expired', 'A autorização está expirada, futura ou contém datas inválidas.')
  if (!grant.permissions.includes('embed') || !grant.permissions.includes('exhibit') || !grant.territories.includes(context.territory) || !grant.origins.includes(context.origin)) return deny('scope-denied', 'A autorização não cobre esta origem, território ou modalidade de exibição.')
  if (!policy.termsApproved || !policy.termsReference.trim()) return deny('terms-unapproved', 'O uso do fornecedor ainda não foi aprovado pelo responsável pelo projeto.')
  if (grant.adPolicy !== 'confirmed-ad-free') return deny('ad-policy-unverified', 'A operação sem publicidade não foi confirmada para esta fonte.')
  const availability = grant.availability
  if (availability.status === 'unavailable') return deny('unavailable', 'Este item está registrado como indisponível. Nenhum iframe será aberto.')
  const checked = Date.parse(availability.checkedAt), expiry = Date.parse(availability.validUntil)
  if (availability.status !== 'confirmed' || !availability.evidenceReference.trim() || !Number.isFinite(checked) || checked > now || !Number.isFinite(expiry) || expiry <= now || expiry < checked) return deny('availability-unknown', 'Não há confirmação vigente de disponibilidade para esta fonte.')
  return { status: 'ready', session: grant }
}
