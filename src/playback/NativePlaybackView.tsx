import {useEffect,useRef,useState} from 'react'
import {nativePlaybackEngine,nativePlaybackConfirmed,configureNativeControls} from '../experimental/playbackEngine'
import type {PlayerEvent,PlayerInput,NativeBounds} from '../experimental/playbackEngine'
import {nativeInputFingerprint} from '../experimental/nativeAttempt'
import {APP_BACKGROUND_EVENT} from '../components/AndroidLifecycle'

export function NativePlaybackView({input,nextAvailable,onEvent,onResume,onRelease}:{input:PlayerInput&{sessionId:string};nextAvailable:boolean;onResume:()=>void;onRelease?:(closing:Promise<void>)=>void;onEvent:(event:PlayerEvent)=>void}){
 const handler=useRef(onEvent);handler.current=onEvent
 const frame=useRef<HTMLDivElement>(null)
 const measure=():NativeBounds=>{const rect=frame.current?.getBoundingClientRect();const header=document.querySelector('.site-header')?.getBoundingClientRect();const nav=document.querySelector('.mobile-nav')?.getBoundingClientRect();const top=Math.max(0,header&&header.height?header.bottom:0);const bottom=Math.min(window.innerHeight,nav&&nav.height?nav.top:window.innerHeight);return {x:rect?.x??0,y:rect?.y??0,width:rect?.width??0,height:rect?.height??0,viewportWidth:window.innerWidth,visible:!!rect&&rect.bottom>top&&rect.top<bottom,clipTop:rect?Math.max(0,top-rect.top):0,clipBottom:rect?Math.max(0,rect.bottom-bottom):0}}
 const [closed,setClosed]=useState(false)
 const next=useRef(nextAvailable);next.current=nextAvailable
 const nativeSession=useRef<string|undefined>(undefined)
 useEffect(()=>{let disposed=false;let cleanup:(()=>void)|undefined
  const lease=`${input.sessionId}-lease-${crypto.randomUUID()}`;nativeSession.current=lease
  setClosed(false)
  void (async()=>{
   try{
    cleanup=await nativePlaybackEngine.onEvent(event=>{if(disposed||event.stale||event.sessionId!==lease)return;if(event.event==='closed'&&event.detail==='user-dismissed')setClosed(true);handler.current({...event,sessionId:input.sessionId})})
    if(disposed){cleanup();return}
    const inputFingerprint=await nativeInputFingerprint(input).catch(()=>undefined)
    if(disposed)return
    await nativePlaybackEngine.load({...input,inline:true,bounds:measure(),sessionId:lease,inputFingerprint})
    if(!disposed)await configureNativeControls(lease,next.current,measure()).catch(()=>{})
    if(disposed)await nativePlaybackEngine.close(lease)
   }catch{if(!disposed)handler.current({sessionId:input.sessionId,event:'failed',positionSeconds:0,detail:'INITIALIZATION_EXCEPTION'})}
  })()
  const background=()=>{void nativePlaybackEngine.pause()}
  window.addEventListener(APP_BACKGROUND_EVENT,background)
  return()=>{disposed=true;if(nativeSession.current===lease)nativeSession.current=undefined;cleanup?.();window.removeEventListener(APP_BACKGROUND_EVENT,background);const closing=nativePlaybackEngine.close(lease).catch(()=>{});onRelease?.(closing)}
 },[input.sessionId])
 useEffect(()=>{if(nativeSession.current)void configureNativeControls(nativeSession.current,nextAvailable,measure()).catch(()=>{})},[input.sessionId,nextAvailable])
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined
  const update=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>{if(nativeSession.current)void configureNativeControls(nativeSession.current,next.current,measure()).catch(()=>{})},40)}
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):undefined;if(frame.current)observer?.observe(frame.current)
  window.addEventListener('resize',update);window.addEventListener('scroll',update,true)
  return()=>{if(timer)clearTimeout(timer);observer?.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true)}
 },[input.sessionId])
 return <div ref={frame} className="native-playback-host" style={{width:'100%',aspectRatio:'16 / 9',position:'relative'}}> {closed&&<p>A reprodução foi fechada.</p>}{closed&&<button className="button button-primary" onClick={onResume}>Continuar reprodução</button>}</div>
}

/** A monotonic startup/stall budget; pauses and background never trigger source switching. */
export function PlaybackDeadline({runId,phase,position,onTimeout}:{runId:string;phase:string;position:number;onTimeout:()=>void}){
 const phaseRef=useRef(phase);phaseRef.current=phase
 const positionRef=useRef(position);positionRef.current=position
 const fail=useRef(onTimeout);fail.current=onTimeout
 useEffect(()=>{let elapsed=0;let previous=performance.now();let lastPosition=positionRef.current;let background=false
  const pause=()=>{background=true};const foreground=()=>{if(document.visibilityState==='visible')background=false}
  window.addEventListener(APP_BACKGROUND_EVENT,pause);window.addEventListener('focus',foreground);document.addEventListener('visibilitychange',foreground)
  const tick=setInterval(()=>{const now=performance.now();const delta=now-previous;previous=now
   if(['paused','stopped','ended','embedded'].includes(phaseRef.current))return
   if(background||document.visibilityState==='hidden')return
   if(phaseRef.current==='playing'&&positionRef.current!==lastPosition){lastPosition=positionRef.current;elapsed=0}else elapsed+=delta;if(elapsed>=45000){clearInterval(tick);fail.current()}
  },500)
  return()=>{clearInterval(tick);window.removeEventListener(APP_BACKGROUND_EVENT,pause);window.removeEventListener('focus',foreground);document.removeEventListener('visibilitychange',foreground)}
 },[runId])
 return null
}
export const nativeEventIsProgress=nativePlaybackConfirmed
