/** Bounded in-memory cache; errors are not cached and do not extend stale data's lifetime. */
export class CatalogRequestCache {
  private values = new Map<string, { data: unknown; expiresAt: number; staleUntil: number }>()
  private pending = new Map<string, Promise<{ data: unknown; stale: boolean }>>()
  private active = 0
  private queue: (() => void)[] = []
  constructor(private now = Date.now) {}
  private schedule<T>(work: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const start = () => { this.active++; work().then(resolve, reject).finally(() => { this.active--; this.queue.shift()?.() }) }
      if (this.active < 3) start(); else this.queue.push(start)
    })
  }
  async read<T>(key: string, load: () => Promise<T>, ttl: number, signal?: AbortSignal): Promise<{ data: T; stale: boolean }> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const cached = this.values.get(key)
    if (cached && cached.expiresAt > this.now()) return { data: cached.data as T, stale: false }
    let pending = this.pending.get(key)
    if (!pending) {
      pending = this.schedule(load).then(data => {
        this.values.delete(key)
        this.values.set(key, { data, expiresAt: this.now() + ttl, staleUntil: this.now() + 30 * 60000 })
        if (this.values.size > 100) this.values.delete(this.values.keys().next().value!)
        return { data, stale: false }
      }).catch(error => {
        const stale = this.values.get(key)
        if (stale && stale.staleUntil > this.now()) return { data: stale.data, stale: true }
        throw error
      }).finally(() => this.pending.delete(key))
      this.pending.set(key, pending)
    }
    // A cancelled consumer never cancels a shared request belonging to another screen.
    return new Promise((resolve, reject) => {
      const cancel = () => { signal?.removeEventListener('abort', cancel); reject(new DOMException('Aborted', 'AbortError')) }
      signal?.addEventListener('abort', cancel, { once: true })
      pending!.then(value => { signal?.removeEventListener('abort', cancel); if (signal?.aborted) cancel(); else resolve(value as { data: T; stale: boolean }) }, error => { signal?.removeEventListener('abort', cancel); reject(error) })
    })
  }
}
