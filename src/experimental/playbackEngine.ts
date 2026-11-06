import { useEffect, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
export interface NativeBounds {x:number;y:number;width:number;height:number;viewportWidth:number;visible:boolean;clipTop?:number;clipBottom?:number}
export interface PlayerInput { inline?:boolean; bounds?:NativeBounds; title?:string; preferredLanguage?:string; showLanguageNotice?:boolean; startPositionSeconds?:number; nextAvailable?:boolean; nextPromptSeconds?:number; sessionId?:string; sourceId?:string; providerId?:string; inputFingerprint?:string; url:string; mimeType:string; headers?:Record<string,string>; publicMediaTransport?:boolean; mediaDiskCache?:boolean }
export interface PlayerEvent { sessionId?:string; sourceId?:string; inputFingerprint?:string; event:'loaded'|'progress'|'failed'|'ended'|'closed'|'video'|'audio'|'diagnostic'|'next'|'sources'; durationSeconds?:number; positionSeconds:number; detail?:string; category?:'network'|'codec'|'format'|'audio'|'initialization'|'protection'; errorCode?:number; httpStatus?:number; videoRendered?:boolean; audioAdvancing?:boolean; state?:string; playWhenReady?:boolean; isPlaying?:boolean; bufferedSeconds?:number; stale?:boolean; networkCause?:string; mediaStage?:string; redirectStatus?:number; destinationScheme?:string; httpOperation?:number }
export interface PlaybackEngine { load(input:PlayerInput):Promise<void>; play():Promise<void>; pause():Promise<void>; seek(seconds:number):Promise<void>; close(sessionId?:string):Promise<void>; onEvent(listener:(event:PlayerEvent)=>void):Promise<()=>void> }
interface NativePlugin { inspectFenixRedirect(input:{url:string}):Promise<RedirectObservation>; capabilities():Promise<{available:boolean;playbackAvailable?:boolean;inlinePlayback?:boolean;engine:string;mediaOrigins?:string[];publicMediaTransport?:boolean}>; load(input:PlayerInput):Promise<void>; play():Promise<void>; pause():Promise<void>; seek(input:{seconds:number}):Promise<void>; close(input?:{sessionId?:string}):Promise<void>; updateControls(input:{sessionId:string;nextAvailable:boolean;bounds?:NativeBounds}):Promise<void>; addListener(name:'nativePlayback',listener:(event:PlayerEvent)=>void):Promise<PluginListenerHandle> }
const plugin=registerPlugin<NativePlugin>('NoctaNativePlayer')
export type RedirectObservation={downgrade:boolean;status?:number;inconclusive?:boolean}
export function inspectFenixRedirect(url:string){
 return Capacitor.getPlatform()==='android'?plugin.inspectFenixRedirect({url}):Promise.resolve({downgrade:false,inconclusive:true} as RedirectObservation)
}
export const nativeExperimentEnabled=import.meta.env.VITE_ENABLE_NATIVE_EXPERIMENT==='true'&&Capacitor.getPlatform()==='android'
export function useNativeExperimentAvailable(){
 const [available,setAvailable]=useState<boolean|undefined>(nativeExperimentEnabled?undefined:false)
 useEffect(()=>{let live=true;if(!nativeExperimentEnabled)return
  const resolve=(value:boolean)=>{if(live){live=false;setAvailable(value)}}
  const timer=setTimeout(()=>resolve(false),2000)
  void plugin.capabilities().then(result=>resolve(result.available)).catch(()=>resolve(false)).finally(()=>clearTimeout(timer))
  return()=>{live=false;clearTimeout(timer)}
 },[])
 return available
}
export function useNativePlaybackAvailable(){
 type Availability=boolean|{origins:readonly string[];publicMediaTransport:boolean}
 const [available,setAvailable]=useState<Availability|undefined>(Capacitor.getPlatform()==='android'?undefined:false)
 useEffect(()=>{
  if(Capacitor.getPlatform()!=='android')return
  let live=true
  const resolve=(value:Availability)=>{if(live){live=false;setAvailable(value)}}
  const timer=setTimeout(()=>resolve(false),2000)
  void plugin.capabilities().then(value=>{
   const supported=(value.playbackAvailable??value.available)&&value.inlinePlayback===true
   resolve(supported&&Array.isArray(value.mediaOrigins)?{origins:value.mediaOrigins,publicMediaTransport:value.publicMediaTransport===true}:supported)
  }).catch(()=>resolve(false)).finally(()=>clearTimeout(timer))
  return()=>{live=false;clearTimeout(timer)}
 },[])
 return available
}
export const configureNativeControls=(sessionId:string,nextAvailable:boolean,bounds?:NativeBounds)=>plugin.updateControls({sessionId,nextAvailable,...(bounds?{bounds}:{})})
export function nativePlaybackConfirmed(event:PlayerEvent){return event.event==='progress'&&event.positionSeconds>1&&event.videoRendered===true&&event.audioAdvancing===true}
export const nativePlaybackEngine:PlaybackEngine={load:input=>plugin.load(input),play:()=>plugin.play(),pause:()=>plugin.pause(),seek:seconds=>plugin.seek({seconds}),close:sessionId=>plugin.close(sessionId?{sessionId}:undefined),onEvent:async listener=>{const handle=await plugin.addListener('nativePlayback',listener);return ()=>{void handle.remove()}}}
/** Future UI control can use this same port without replacing VideoPlayer. */
export function html5PlaybackEngine(video:HTMLVideoElement):PlaybackEngine {
 return {async load(input){if(input.headers&&Object.keys(input.headers).length)throw Error('HTML5 cannot apply vendor headers');video.src=input.url;video.load()},play:()=>video.play(),async pause(){video.pause()},async seek(seconds){video.currentTime=seconds},async close(){video.pause();video.removeAttribute('src');video.load()},async onEvent(listener){const loaded=()=>listener({event:'loaded',positionSeconds:video.currentTime});const progress=()=>{if(!video.paused&&!video.seeking)listener({event:'progress',positionSeconds:video.currentTime})};const failed=()=>listener({event:'failed',positionSeconds:video.currentTime,detail:`HTML5 ${video.error?.code}`});video.addEventListener('loadedmetadata',loaded);video.addEventListener('timeupdate',progress);video.addEventListener('error',failed);return()=>{video.removeEventListener('loadedmetadata',loaded);video.removeEventListener('timeupdate',progress);video.removeEventListener('error',failed)}}}
}
