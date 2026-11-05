import { useEffect, useState } from 'react'
import type { DependencyList } from 'react'

export function useAsync<T>(request: (signal: AbortSignal) => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: string }>({ loading: true })
  useEffect(() => {
    const controller = new AbortController()
    setState({ loading: true })
    request(controller.signal).then(data => { if (!controller.signal.aborted) setState({ data, loading: false }) })
      .catch(() => { if (!controller.signal.aborted) setState({ loading: false, error: 'Não foi possível carregar. Atualize a página e tente novamente.' }) })
    return () => controller.abort()
  }, deps)
  return state
}
