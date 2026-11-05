import {StrictMode} from 'react'
import {act,cleanup,render,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {PlayerEvent} from '../experimental/playbackEngine'
const mock=vi.hoisted(()=>({load:vi.fn(),close:vi.fn(),controls:vi.fn(),listeners:[] as ((e:PlayerEvent)=>void)[]}))
vi.mock('../experimental/playbackEngine',()=>({nativePlaybackConfirmed:()=>false,configureNativeControls:mock.controls,nativePlaybackEngine:{load:mock.load,close:mock.close,pause:vi.fn(),onEvent:async(listener:(e:PlayerEvent)=>void)=>{mock.listeners.push(listener);return()=>{}}}}))
vi.mock('../experimental/nativeAttempt',()=>({nativeInputFingerprint:async()=>{throw Error('Optional digest unavailable')}}))
import {NativePlaybackView} from '../playback/NativePlaybackView'
const input={url:'asset:///native-fixtures/sample.mp4',mimeType:'video/mp4',sessionId:'normal-session'}
beforeEach(()=>{mock.listeners=[];mock.load.mockReset().mockResolvedValue(undefined);mock.close.mockReset().mockResolvedValue(undefined);mock.controls.mockReset().mockRejectedValue(Error('Optional controls unavailable'))})
afterEach(cleanup)
it('optional controls and digest failures cannot turn successful media loading into fallback',async()=>{
 const events=vi.fn();render(<NativePlaybackView input={input} nextAvailable onResume={()=>{}} onEvent={events}/>);await waitFor(()=>expect(mock.load).toHaveBeenCalledOnce());await waitFor(()=>expect(mock.controls).toHaveBeenCalled());expect(events).not.toHaveBeenCalledWith(expect.objectContaining({event:'failed'}))
 const lease=mock.load.mock.calls[0][0].sessionId;expect(lease).not.toBe(input.sessionId)
 expect(mock.load.mock.calls[0][0]).toMatchObject({inline:true,bounds:expect.any(Object)})
 act(()=>mock.listeners.at(-1)?.({sessionId:lease,event:'progress',positionSeconds:2,videoRendered:true,audioAdvancing:true}));expect(events).toHaveBeenCalledWith(expect.objectContaining({sessionId:input.sessionId,event:'progress'}))
})
it('a disposed native view cannot close a newer lease or forward old callbacks',async()=>{
 const events=vi.fn();const first=render(<NativePlaybackView input={input} nextAvailable={false} onResume={()=>{}} onEvent={events}/>);await waitFor(()=>expect(mock.load).toHaveBeenCalledOnce());const oldLease=mock.load.mock.calls[0][0].sessionId;const oldListener=mock.listeners.at(-1)!;first.unmount();render(<NativePlaybackView input={input} nextAvailable={false} onResume={()=>{}} onEvent={events}/>);await waitFor(()=>expect(mock.load).toHaveBeenCalledTimes(2));expect(mock.load.mock.calls[1][0].sessionId).not.toBe(oldLease);expect(mock.close).toHaveBeenCalledWith(oldLease);act(()=>oldListener({sessionId:oldLease,event:'ended',positionSeconds:8}));expect(events).not.toHaveBeenCalled()
})
it('StrictMode remounts keep native cleanup scoped to its lease',async()=>{
 const events=vi.fn();render(<StrictMode><NativePlaybackView input={input} nextAvailable={false} onResume={()=>{}} onEvent={events}/></StrictMode>);await waitFor(()=>expect(mock.load).toHaveBeenCalledOnce());const activeLease=mock.load.mock.calls[0][0].sessionId;expect(mock.close.mock.calls.every(([lease])=>lease!==activeLease)).toBe(true)
})
