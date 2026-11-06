import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'app.nocta.prototype', appName: 'NOCTA', webDir: 'dist',
  android: {
    backgroundColor: '#070b14', adjustMarginsForEdgeToEdge: 'auto',
    ...(process.env.VITE_ENABLE_EXPERIMENTAL_PROVIDERS === 'true' ? {loggingBehavior:'none' as const} : {}),
  },
}
export default config
