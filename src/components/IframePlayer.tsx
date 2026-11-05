import {useEffect,useRef} from 'react'
import type { PlaybackSession } from '../services/playback'

/** The provider owns its controls; keep native fullscreen permission and its document intact. */
export function IframePlayer({ session, onFailure, onDocumentReady }: { session: PlaybackSession; onFailure?:()=>void; onDocumentReady?:()=>void }) {
  const ready=useRef(false);const failure=useRef(onFailure);failure.current=onFailure
  useEffect(()=>{ready.current=false;if(!onDocumentReady)return;const timer=setTimeout(()=>{if(!ready.current)failure.current?.()},45000);return()=>clearTimeout(timer)},[session.iframeUrl])
  return <div className="video-component iframe-player">
    <div className="video-frame watch-embed-frame">
      <iframe onLoad={()=>{ready.current=true;onDocumentReady?.()}} onError={onFailure} src={session.iframeUrl} title={session.title}
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allowFullScreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        referrerPolicy="no-referrer" />
    </div>
  </div>
}
