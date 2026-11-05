import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router'
const positions = new Map<string, number>()
export function ScrollMemory() {
  const location = useLocation()
  const navigation = useNavigationType()
  useLayoutEffect(() => {
    const target = navigation === 'POP' ? positions.get(location.key) ?? 0 : 0
    const save = () => { positions.set(location.key, window.scrollY); if (positions.size > 80) positions.delete(positions.keys().next().value!) }
    let restoring = true
    const listener = () => { if (!restoring) save() }
    const restore = () => {
      window.scrollTo({ top: target, behavior: 'instant' })
      if (document.documentElement.scrollHeight >= target + window.innerHeight || target === 0) { restoring = false; observer?.disconnect() }
    }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(restore)
    observer?.observe(document.body)
    restore()
    const timer = setTimeout(() => { restoring = false; observer?.disconnect() }, 10000)
    window.addEventListener('scroll', listener, { passive: true })
    return () => { clearTimeout(timer); observer?.disconnect(); window.removeEventListener('scroll', listener) }
  }, [location.key, location.pathname, location.search, navigation])
  return null
}
