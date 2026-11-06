import {experimentalProvidersEnabled} from '../config/experimentalProviders'

// Only pass fixed labels, numbers and app-generated identifiers. URLs and headers stay out.
export function transportTrace(event: string, fields: Record<string, string | number | boolean | undefined>) {
 if (experimentalProvidersEnabled) console.info('NoctaTransporte', JSON.stringify({event, ...fields}))
}
