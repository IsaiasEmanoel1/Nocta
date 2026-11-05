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
