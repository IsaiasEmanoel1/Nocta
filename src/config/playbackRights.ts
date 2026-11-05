import type { ProviderPolicy } from '../services/authorizedPlayback'

// Reviewed configuration, never populated from the catalog, localStorage or UI.
// Reading the public terms is not approval of a content license.
// There are no confirmed EmbedWave grants for this project.
export const embedwavePolicy: ProviderPolicy = {
  termsApproved: true,
  termsReference: 'Aprovado para uso no projeto',
  grants: [],
}
