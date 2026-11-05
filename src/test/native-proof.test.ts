import {expect,it} from 'vitest'
import {nativePlaybackConfirmed} from '../experimental/playbackEngine'
it('requires actual rendered video and advancing audio, not just position',()=>{
 expect(nativePlaybackConfirmed({event:'progress',positionSeconds:3})).toBe(false)
 expect(nativePlaybackConfirmed({event:'loaded',positionSeconds:3,videoRendered:true,audioAdvancing:true})).toBe(false)
 expect(nativePlaybackConfirmed({event:'progress',positionSeconds:3,videoRendered:true,audioAdvancing:false})).toBe(false)
 expect(nativePlaybackConfirmed({event:'progress',positionSeconds:3,videoRendered:true,audioAdvancing:true})).toBe(true)
})
