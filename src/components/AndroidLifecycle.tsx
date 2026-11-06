import { useEffect, useRef } from 'react'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { useLocation, useNavigate } from 'react-router'

export const APP_BACKGROUND_EVENT = 'nocta:background'

/** Native hooks stay outside the catalog and are inactive in ordinary browsers. */
export function AndroidLifecycle() {
  const location = useLocation()
  const navigate = useNavigate()
  const current = useRef({ location, navigate })
  current.current = { location, navigate }
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return
    let disposed = false
    const handles: PluginListenerHandle[] = []
    const keep = async (pending: Promise<PluginListenerHandle>) => {
      try {
        const handle = await pending
        if (disposed) await handle.remove()
        else handles.push(handle)
      } catch { console.warn('Não foi possível ativar um evento Android.') }
    }
    void keep(NativeApp.addListener('backButton', async () => {
      const dialog=document.querySelector<HTMLDialogElement>('dialog[open]');if(dialog){const event=new Event('cancel',{cancelable:true});dialog.dispatchEvent(event);if(!event.defaultPrevented)dialog.close();return}
      if (document.fullscreenElement) {
        try { await document.exitFullscreen() } catch { /* Native custom-view handles its own Back. */ }
        return
      }
      const { location: route, navigate: go } = current.current
      if (route.pathname === '/') {
        window.dispatchEvent(new Event(APP_BACKGROUND_EVENT))
        await NativeApp.minimizeApp()
      } else if ((window.history.state?.idx ?? 0) > 0) go(-1)
      else go('/', { replace: true })
    }))
    void keep(NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) window.dispatchEvent(new Event(APP_BACKGROUND_EVENT))
    }))
    return () => { disposed = true; handles.forEach(handle => { void handle.remove() }) }
  }, [])
  return null
}
