import {act,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {LibraryProvider} from '../state/library'
import type {Media} from '../domain/media'
vi.mock('../hooks/useAudioPlayback',()=>({useAudioPlayback:()=>({tracks:[],subtitles:[],select:vi.fn(),selectSubtitle:vi.fn()})}))
import {VideoPlayer} from '../components/VideoPlayer'
const media:Media={id:'tmdb-movie-1',kind:'movie',title:'Teste',source:'tmdb',overview:'',year:2026,rating:0,genres:[],genreIds:[],poster:'',backdrop:'',cast:[]}
const session={id:media.id,title:media.title,poster:'',sources:[{src:'https://example.test/authorized.mp4',type:'video/mp4' as const}],sourceLabel:'',attribution:'',license:{name:'',url:'',projectUrl:''}}
beforeEach(()=>{vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue()})
afterEach(()=>vi.useRealTimers())
it('autohides controls, reveals them on touch, opens sources and only requests fullscreen after a click',async()=>{
 vi.useFakeTimers();const fullscreen=vi.fn().mockResolvedValue(undefined);Object.defineProperty(HTMLElement.prototype,'requestFullscreen',{configurable:true,value:fullscreen});const sources=vi.fn();const view=render(<LibraryProvider><VideoPlayer integrated session={session} media={media} onSources={sources}/></LibraryProvider>);const video=view.container.querySelector('video')!
 fireEvent.playing(video);expect(fullscreen).not.toHaveBeenCalled();await act(()=>vi.advanceTimersByTimeAsync(3100));expect(view.container.querySelector('.web-controls')).toHaveAttribute('aria-hidden','true');fireEvent.click(video);expect(view.container.querySelector('.web-controls')).toHaveAttribute('aria-hidden','false');fireEvent.click(screen.getByRole('button',{name:'Servidores'}));expect(sources).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'Tela cheia'}));expect(fullscreen).toHaveBeenCalledOnce();delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen
})
it('blocked autoplay offers a real user gesture without treating it as source failure',async()=>{
 vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('Blocked','NotAllowedError'));const events=vi.fn();const states=vi.fn();const view=render(<LibraryProvider><VideoPlayer integrated startOnReady session={session} media={media} onPlaybackEvent={events} onStateChange={states}/></LibraryProvider>);fireEvent.loadedMetadata(view.container.querySelector('video')!);expect(await screen.findByRole('button',{name:'Iniciar reprodução'})).toBeVisible();expect(states).toHaveBeenCalledWith('paused');expect(events.mock.calls.some(([event])=>event==='failed')).toBe(false)
})
it('waits for a rendered frame and advancing time, then reports audio-backed confirmation separately',()=>{
 const prototype=HTMLVideoElement.prototype
 const oldRequest=Object.getOwnPropertyDescriptor(prototype,'requestVideoFrameCallback')
 const oldCancel=Object.getOwnPropertyDescriptor(prototype,'cancelVideoFrameCallback')
 let frame!:()=>void
 Object.defineProperty(prototype,'requestVideoFrameCallback',{configurable:true,value:(callback:()=>void)=>{frame=callback;return 1}})
 Object.defineProperty(prototype,'cancelVideoFrameCallback',{configurable:true,value:()=>{}})
 try{
  const events=vi.fn(),renderer=vi.fn()
  const view=render(<LibraryProvider><VideoPlayer requireVideo session={session} media={media} onPlaybackEvent={events} onRendererEvent={renderer}/></LibraryProvider>)
  const video=view.container.querySelector('video')!
  Object.defineProperties(video,{paused:{value:false},readyState:{value:4},videoWidth:{value:320},webkitAudioDecodedByteCount:{value:500}})
  const update=(seconds:number)=>{video.currentTime=seconds;fireEvent.timeUpdate(video)}
  fireEvent.playing(video)
  update(.1);update(.3)
  expect(events.mock.calls.map(([event])=>event)).toEqual(['playing'])
  expect(renderer.mock.calls.some(([event])=>event==='reprodução-confirmada')).toBe(false)
  frame()
  update(.4);update(.6)
  expect(events).toHaveBeenCalledWith('progress',.6)
  expect(renderer).toHaveBeenCalledWith('reprodução-confirmada',.6)
  view.unmount()
 }finally{
  if(oldRequest)Object.defineProperty(prototype,'requestVideoFrameCallback',oldRequest)
  else Reflect.deleteProperty(prototype,'requestVideoFrameCallback')
  if(oldCancel)Object.defineProperty(prototype,'cancelVideoFrameCallback',oldCancel)
  else Reflect.deleteProperty(prototype,'cancelVideoFrameCallback')
 }
})
it('hides inline source and framing controls in fullscreen',()=>{
 const view=render(<LibraryProvider><VideoPlayer integrated session={session} media={media}/></LibraryProvider>)
 const frame=view.container.querySelector('.video-frame')!
 const fullscreenElement=Object.getOwnPropertyDescriptor(document,'fullscreenElement')
 const change=(element:Element|null)=>{
  Object.defineProperty(document,'fullscreenElement',{configurable:true,value:element})
  fireEvent(document,new Event('fullscreenchange'))
 }
 try {
  change(frame)
  expect(screen.queryByRole('button',{name:'Servidores'})).toBeNull()
  expect(screen.queryByRole('button',{name:/Ajustar|Preencher/})).toBeNull()
  change(null)
  expect(screen.getByRole('button',{name:'Servidores'})).toBeVisible()
 } finally {
  if(fullscreenElement)Object.defineProperty(document,'fullscreenElement',fullscreenElement)
  else Reflect.deleteProperty(document,'fullscreenElement')
 }
})
