import {act,cleanup,render} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {PlaybackDeadline} from '../playback/NativePlaybackView'
afterEach(()=>{cleanup();vi.useRealTimers()})
it('does not restart the startup budget on buffering events and pauses do not cause fallback',()=>{
 vi.useFakeTimers();const timeout=vi.fn();const view=render(<PlaybackDeadline runId="1" phase="preparing" position={0} onTimeout={timeout}/>);
 act(()=>vi.advanceTimersByTime(30000));view.rerender(<PlaybackDeadline runId="1" phase="buffering" position={0} onTimeout={timeout}/>);act(()=>vi.advanceTimersByTime(14000));expect(timeout).not.toHaveBeenCalled();
 view.rerender(<PlaybackDeadline runId="1" phase="paused" position={0} onTimeout={timeout}/>);act(()=>vi.advanceTimersByTime(60000));expect(timeout).not.toHaveBeenCalled();view.rerender(<PlaybackDeadline runId="1" phase="preparing" position={0} onTimeout={timeout}/>);act(()=>vi.advanceTimersByTime(1000));expect(timeout).toHaveBeenCalledOnce()
})
it('actual advancing playback renews stall budget; background does not switch sources',()=>{
 vi.useFakeTimers();const timeout=vi.fn();const view=render(<PlaybackDeadline runId="2" phase="playing" position={1} onTimeout={timeout}/>);act(()=>vi.advanceTimersByTime(20000));view.rerender(<PlaybackDeadline runId="2" phase="playing" position={2} onTimeout={timeout}/>);act(()=>vi.advanceTimersByTime(30000));expect(timeout).not.toHaveBeenCalled();act(()=>window.dispatchEvent(new Event('nocta:background')));act(()=>vi.advanceTimersByTime(60000));expect(timeout).not.toHaveBeenCalled();act(()=>window.dispatchEvent(new Event('focus')));act(()=>vi.advanceTimersByTime(16000));expect(timeout).toHaveBeenCalledOnce()
})
