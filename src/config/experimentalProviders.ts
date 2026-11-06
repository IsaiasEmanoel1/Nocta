import type { AddonConfig } from '../experimental/StremioAddonAdapter'

export const experimentalProvidersEnabled = import.meta.env.VITE_ENABLE_EXPERIMENTAL_PROVIDERS === 'true'
export const experimentalProfiles = [
  { id: 'bscine', name: 'BsCine', origin: 'https://bscine.alwaysdata.net', publicManifest: true },
  { id: 'magnetflix', name: 'Magnetflix', origin: 'https://magnetflix.flixbr.online' },
  { id: 'zeus-beta', name: 'Zeus beta', origin: 'https://zeus.zeusaddon.workers.dev' },
  { id: 'vetela', name: 'VêTela Brasil', origin: 'https://addon.vetela.cc' },
] as const
export const laboratoryProfiles = [
  { id: 'fenixflix', name: 'FenixFlix', origin: 'https://fenixflix.fenixhub.online', publicManifest: true },
  { id: 'brazuca', name: 'Brazuca Play', origin: 'https://brazuca-play-stremio.vercel.app', publicManifest: true },
  ...experimentalProfiles,
] as const
type Profile = typeof laboratoryProfiles[number]

export function validateExperimentalManifest(profile: Profile, value: string) {
  const url = new URL(value.trim())
  if (url.origin !== profile.origin || url.username || url.password || url.hash || url.search ||
    !url.pathname.endsWith('/manifest.json') || (!('publicManifest' in profile) && url.pathname === '/manifest.json'))
    throw new Error('Informe o manifesto HTTPS configurado para esse fornecedor.')
  return url.href
}

export function readExperimentalManifest(profile: Profile, fallback?: string) {
  try {
    const saved = globalThis.localStorage?.getItem(`nocta.experimental.manifest.${profile.id}`)
    if (saved) return validateExperimentalManifest(profile, saved)
  } catch { /* A profile without valid local configuration will report it in the player. */ }
  return fallback ?? ('publicManifest' in profile ? profile.origin + '/manifest.json' : undefined)
}

export function saveExperimentalManifest(profile: Profile, value: string) {
  const key = `nocta.experimental.manifest.${profile.id}`
  if (!value.trim()) localStorage.removeItem(key)
  else localStorage.setItem(key, validateExperimentalManifest(profile, value))
}

export function experimentalConfig(profile: Profile, manifestUrl: string): AddonConfig {
  return {
    id: profile.id, manifestUrl: validateExperimentalManifest(profile, manifestUrl),
    apiOrigins: [profile.origin], mediaOrigins: [], publicMediaTransport: true,
    ...(profile.id === 'zeus-beta' ? { timeoutMs: 16_000 } : profile.id === 'vetela' ? { timeoutMs: 75_000 } : {}),
  }
}
