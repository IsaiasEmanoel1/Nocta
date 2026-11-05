import { describe, expect, it, vi } from 'vitest'
import { buildEmbedWaveUrl, EmbedWaveProvider } from '../services/embedwave'
import type { EmbedWaveRequest } from '../services/embedwave'
import { embedwaveProvider } from '../services/embedwave'
import type { ProviderPolicy, RightsGrant } from '../services/authorizedPlayback'

const context = { origin: 'http://localhost:5173', territory: 'BR', now: Date.parse('2026-11-01T12:00:00Z') }
const request = { kind: 'movie', tmdbId: 42 } as const
const grant: RightsGrant = {
  provider: 'embedwave', contentKey: 'movie:42', server: 'nxsha', title: 'Fixture de contrato (não é uma licença real)',
  evidenceReference: 'fixture-only-license', reviewedBy: 'test-runner', reviewedAt: '2026-10-30',
  validFrom: '2026-10-30', validUntil: '2026-11-02', territories: ['BR'], origins: [context.origin], permissions: ['embed', 'exhibit'], adPolicy: 'confirmed-ad-free',
  availability: { status: 'confirmed', checkedAt: '2026-11-01T10:00:00Z', validUntil: '2026-11-01T15:00:00Z', evidenceReference: 'fixture-only-availability' },
}
const policy = (g: RightsGrant = grant): ProviderPolicy => ({ termsApproved: true, termsReference: 'fixture-only-terms', grants: [g] })
describe('EmbedWave documented syntax', () => {
  it('builds only documented movie/episode paths and parameters without network requests', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(buildEmbedWaveUrl(request)).toBe('https://embedwave.cc/embed/movie/42')
    expect(buildEmbedWaveUrl({ kind: 'tv', tmdbId: 42, season: 1, episode: 2, server: 'cinesrc', autoplay: true })).toBe('https://embedwave.cc/embed/tv/42/1/2?server=cinesrc&autoplay=1')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    { kind: 'movie', tmdbId: -1 }, { kind: 'movie', tmdbId: 1.5 }, { kind: 'movie', tmdbId: 42, nobrand: 1 },
    { kind: 'movie', tmdbId: 42, server: 'https://evil.invalid' }, { kind: 'tv', tmdbId: 42, season: 0, episode: 1 },
    { kind: 'tv', tmdbId: 42, season: 1 }, { kind: 'movie', tmdbId: 42, season: 1 },
  ])('rejects malformed or unsupported options: %j', invalid => {
    expect(() => buildEmbedWaveUrl(invalid as EmbedWaveRequest)).toThrow()
  })
})
describe('Rights and availability gate', () => {
  it('ships disabled with no rights grants and never fetches an iframe or supplier API', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const result = await embedwaveProvider.assess(request, context)
    expect(result).toMatchObject({ status: 'denied', reason: 'license-missing' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requires exact content, backend and episode scope', async () => {
    expect(await new EmbedWaveProvider(policy()).assess({ ...request, server: 'videasy' }, context)).toMatchObject({ reason: 'license-missing' })
    expect(await new EmbedWaveProvider(policy()).assess({ kind: 'tv', tmdbId: 42, season: 1, episode: 1 }, context)).toMatchObject({ reason: 'license-missing' })
  })
  it.each([
    ['license-expired', { validUntil: '2026-10-31' }],
    ['license-expired', { validFrom: '2027-01-01' }],
    ['license-missing', { evidenceReference: '' }],
    ['scope-denied', { territories: ['PT'] }],
    ['scope-denied', { origins: ['https://other.invalid'] }],
    ['scope-denied', { permissions: ['embed'] }],
    ['ad-policy-unverified', { adPolicy: 'unverified' }],
    ['unavailable', { availability: { ...grant.availability, status: 'unavailable' } }],
    ['availability-unknown', { availability: { ...grant.availability, status: 'unknown' } }],
    ['availability-unknown', { availability: { ...grant.availability, validUntil: '2026-10-31' } }],
    ['availability-unknown', { availability: { ...grant.availability, checkedAt: '2027-01-01' } }],
  ])('denies %s', async (reason, override) => {
    const provider = new EmbedWaveProvider(policy({ ...grant, ...override } as RightsGrant))
    expect(await provider.assess(request, context)).toMatchObject({ status: 'denied', reason })
  })
  it('requires separate terms approval and rejects invalid evaluation context', async () => {
    const provider = new EmbedWaveProvider({ ...policy(), termsApproved: false })
    expect(await provider.assess(request, context)).toMatchObject({ reason: 'terms-unapproved' })
    expect(await provider.assess(request, { ...context, now: NaN })).toMatchObject({ reason: 'invalid-request' })
  })
  it('returns a bounded iframe descriptor only for a fully scoped synthetic test grant', async () => {
    const result = await new EmbedWaveProvider(policy()).assess(request, context)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.session.url).toBe('https://embedwave.cc/embed/movie/42')
      expect(result.session.expiresAt).toBe(Date.parse(grant.availability.validUntil))
    }
    // Descriptor is inspected as text only; no EmbedWave request is made.
  })
})
