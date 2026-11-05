import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {MemoryRouter,useLocation} from 'react-router'
import type {CatalogProvider,Media} from '../domain/media'
import type {Candidate,PlaybackContext} from '../playback/providers'
const mocks=vi.hoisted(()=>({find:vi.fn()}))
vi.mock('../playback/providers',async original=>({...await original<typeof import('../playback/providers')>(),createSourceProviders:()=>[{id:'fenixflix',find:mocks.find}]}))
vi.mock('../experimental/playbackEngine',async original=>({...await original<typeof import('../experimental/playbackEngine')>(),useNativePlaybackAvailable:()=>false}))
vi.mock('../components/PlaybackDetails',()=>({PlaybackDetails:()=>null}))
vi.mock('../components/VideoPlayer',()=>({VideoPlayer:({onProgress,onPlaybackEvent,onEnded,session,overlay}:any)=><div data-testid="active-video" data-src={session.sources[0].src}><button onClick={()=>{onPlaybackEvent('progress',265);onProgress({positionSeconds:265,durationSeconds:300})}}>35 segundos restantes</button><button onClick={()=>{onEnded();onEnded()}}>Terminar vídeo</button>{overlay}</div>}))
import {AutomaticWatch} from '../playback/AutomaticWatch'
import {LibraryProvider} from '../state/library'
const media:Media={id:'tmdb-tv-31132',kind:'tv',imdbId:'tt1710308',title:'Série de teste',source:'tmdb',overview:'',year:2020,rating:8,genres:[],genreIds:[],poster:'',backdrop:'',cast:[],seasons:[{id:0,number:0,name:'Especiais',episodeCount:1},{id:1,number:1,name:'1',episodeCount:2},{id:2,number:2,name:'2',episodeCount:1}]}
const episode=(number:number)=>({id:number,number,name:`Capítulo ${number}`,overview:'',runtime:5})
const catalog={episodes:vi.fn(async(_:Media,season:number)=>({origin:'tmdb' as const,data:season===1?[episode(1),episode(2)]:[episode(1)]}))} as unknown as CatalogProvider
function item(context:PlaybackContext,mode:'dub'|'sub'):Candidate {return {id:mode,providerId:'fenixflix',identity:JSON.stringify([context.episode,mode]),engine:'web',receivedAt:Date.now(),score:100,language:{modes:[mode],dual:false,confirmed:false},session:{id:media.id,title:media.title,sources:[{src:`https://example.test/${context.episode?.seasonNumber}-${context.episode?.episodeNumber}-${mode}.mp4`,type:'video/mp4'}],poster:'',sourceLabel:'',attribution:'',license:{name:'',url:'',projectUrl:''}}}}
function Location(){return <p data-testid="location">{useLocation().search}</p>}
function mount(path='?temporada=1&episodio=1'){return render(<LibraryProvider><MemoryRouter initialEntries={['/assistir/'+media.id+path]}><AutomaticWatch media={media} catalogProvider={catalog}/><Location/></MemoryRouter></LibraryProvider>)}
beforeEach(()=>{localStorage.clear();mocks.find.mockReset().mockImplementation(async(context:PlaybackContext)=>context.episode?.episodeNumber===1&&context.episode?.seasonNumber===1?[item(context,'dub')]:[item(context,'dub'),item(context,'sub')])})
afterEach(cleanup)
it('shows next at 35 seconds but does not advance early; preserves chosen audio into the next lookup',async()=>{
 const view=mount();await screen.findByTestId('active-video');fireEvent.click(screen.getByText('35 segundos restantes'));expect(mocks.find).toHaveBeenCalledTimes(1)
 fireEvent.click(view.container.querySelector('.next-episode-overlay')!);await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('episodio=2'));await waitFor(()=>expect(screen.getByTestId('active-video')).toHaveAttribute('data-src','https://example.test/1-2-dub.mp4'));expect(screen.queryByText('Como prefere assistir?')).toBeNull()
})
it('ends once, crosses season boundary, excludes specials and ends the final episode normally',async()=>{
 mount('?temporada=1&episodio=2');await screen.findByText('Como prefere assistir?');fireEvent.click(screen.getByRole('button',{name:'Dublado'}));await screen.findByTestId('active-video');fireEvent.click(screen.getByText('Terminar vídeo'));await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('temporada=2&episodio=1'));await waitFor(()=>expect(screen.getByTestId('active-video')).toHaveAttribute('data-src','https://example.test/2-1-dub.mp4'));const calls=mocks.find.mock.calls.length;fireEvent.click(screen.getByText('Terminar vídeo'));await screen.findByText('Você chegou ao último episódio disponível.');expect(mocks.find).toHaveBeenCalledTimes(calls);expect(mocks.find.mock.calls.some(([context])=>context.episode.seasonNumber===0)).toBe(false)
})
it('allows disabling auto-next and rejects a missing episode before querying any source',async()=>{
 const view=mount();await screen.findByTestId('active-video');fireEvent.click(screen.getByRole('checkbox',{name:'Reproduzir próximo episódio automaticamente'}));fireEvent.click(screen.getByText('Terminar vídeo'));expect(mocks.find).toHaveBeenCalledTimes(1);view.unmount();mocks.find.mockClear();mount('?temporada=1&episodio=99');await screen.findByRole('alert');expect(mocks.find).not.toHaveBeenCalled()
})

it('keeps a manually opened server menu visible when asynchronous results arrive',async()=>{
 let finish!:(sources:Candidate[])=>void;mocks.find.mockImplementation((context:PlaybackContext)=>new Promise<Candidate[]>(resolve=>{finish=()=>resolve([item(context,'dub')])}))
 mount();const servers=screen.getByRole('button',{name:'Servidores'});expect(servers).toBeDisabled();await waitFor(()=>expect(servers).toBeEnabled());fireEvent.click(servers);expect(screen.getByText('Idiomas e servidores')).toBeVisible();await act(async()=>finish([]));expect(screen.queryByTestId('active-video')).toBeNull();expect(screen.getByText('Idiomas e servidores')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:/FenixFlix/}));await screen.findByTestId('active-video')
})
