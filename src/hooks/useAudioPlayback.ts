import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

interface NativeTrack { id: string; language: string; label: string; enabled: boolean }
type NativeVideo = HTMLVideoElement & { audioTracks?: { length: number; [i: number]: NativeTrack; addEventListener(name: string, fn: () => void): void; removeEventListener(name: string, fn: () => void): void } }
export function useAudioPlayback(video: RefObject<HTMLVideoElement | null>, url: string | undefined, hls: boolean, validate?: (url: string) => void, attempt = 0, onFailure?: (detail:string) => void) {
  const engine = useRef<import('hls.js').default | null>(null)
  const [tracks, setTracks] = useState<{ id: number; label: string }[]>([])
  const [subtitles,setSubtitles]=useState<{id:number;label:string}[]>([])
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const element = video.current as NativeVideo | null
    if (!element || !url) return
    let disposed = false
    setTracks([]);setSubtitles([]); setNotice('')
    const native = () => { if(engine.current) return; setTracks(Array.from({length: element.audioTracks?.length ?? 0}, (_,i) => ({id:i,label:element.audioTracks![i].label || element.audioTracks![i].language || `Faixa ${i+1}`}))) }
    const texts=()=>{if(!engine.current)setSubtitles(Array.from(element.textTracks).map((track,id)=>({id,label:track.label||track.language||`Legenda ${id+1}`})))}
    element.addEventListener('loadedmetadata',native);element.addEventListener('loadedmetadata',texts);element.textTracks?.addEventListener?.('addtrack',texts)
    if (hls && (!element.canPlayType('application/vnd.apple.mpegurl') || !element.audioTracks)) {
      void import('hls.js').then(({default: Hls, FetchLoader}) => {
        if (disposed) return
        if (!Hls.isSupported()) { if(element.canPlayType('application/vnd.apple.mpegurl')) { element.src=url; return } setNotice('HLS não suportado neste navegador/WebView. Escolha MP4.');onFailure?.('HLS_UNSUPPORTED'); return }
        const instance = new Hls({ loader: FetchLoader, fetchSetup: (context, init) => { validate?.(context.url); return new Request(context.url, { ...init, redirect: 'error', credentials: 'omit' }) } })
        engine.current = instance
        instance.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setTracks(instance.audioTracks.map((track,i)=>({id:i,label:track.lang ? `${track.lang} · ${track.name}` : track.name || `Faixa ${i+1}`}))))
        instance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED,()=>setSubtitles(instance.subtitleTracks.map((track,id)=>({id,label:track.name||track.lang||`Legenda ${id+1}`}))))
        instance.on(Hls.Events.ERROR, (_event,data) => { if(data.fatal) { const detail=`HLS ${data.type}: ${data.details}${data.response?.code ? ` (HTTP ${data.response.code})` : ''}`; setNotice(detail); onFailure?.(detail) } })
        instance.on(Hls.Events.MANIFEST_PARSED, () => { const videoLevel=instance.levels.findIndex(level=>level.width>0); if(videoLevel>=0) instance.currentLevel=videoLevel })
        instance.loadSource(url); instance.attachMedia(element)
      }).catch(()=> { if(!disposed) {setNotice('Não foi possível inicializar HLS.');onFailure?.('HLS_INITIALIZATION')} })
    }
    if(hls && element.canPlayType('application/vnd.apple.mpegurl') && element.audioTracks) element.src=url
    return () => { disposed=true; element.removeEventListener('loadedmetadata',native);element.removeEventListener('loadedmetadata',texts);element.textTracks?.removeEventListener?.('addtrack',texts); engine.current?.destroy(); engine.current=null }
  }, [url,hls,validate,attempt,onFailure])
  function select(id: number) {
    if(engine.current) engine.current.audioTrack=id
    else { const native=(video.current as NativeVideo)?.audioTracks; if(native) for(let i=0;i<native.length;i++) native[i].enabled=i===id }
  }
  function selectSubtitle(id:number){if(engine.current){engine.current.subtitleTrack=id;engine.current.subtitleDisplay=id>=0}else if(video.current)Array.from(video.current.textTracks).forEach((track,index)=>{track.mode=index===id?'showing':'disabled'})}
  return { tracks, select, notice,subtitles,selectSubtitle }
}
