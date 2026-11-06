import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {MemoryRouter,useLocation} from 'react-router'
import type {CatalogProvider,Media} from '../domain/media'
import type {Candidate,PlaybackContext} from '../playback/providers'
import type {PlayerEvent} from '../experimental/playbackEngine'
const mocks=vi.hoisted(()=>({find:vi.fn(),native:false,experimental:false,redirect:vi.fn(),nativeFailure:undefined as Partial<PlayerEvent>|undefined}))
vi.mock('../config/experimentalProviders',async original=>({...await original<typeof import('../config/experimentalProviders')>(),get experimentalProvidersEnabled(){return mocks.experimental}}))
vi.mock('../playback/providers',async original=>({...await original<typeof import('../playback/providers')>(),createSourceProviders:()=>[{id:'fenixflix',find:mocks.find}]}))
vi.mock('../experimental/playbackEngine',async original=>({...await original<typeof import('../experimental/playbackEngine')>(),useNativePlaybackAvailable:()=>mocks.native,inspectFenixRedirect:mocks.redirect}))
vi.mock('../playback/NativePlaybackView',async original=>({...await original<typeof import('../playback/NativePlaybackView')>(),NativePlaybackView:({onEvent}:{onEvent:(event:PlayerEvent)=>void})=><div data-testid="native-without-events"><button onClick={()=>onEvent({event:'failed',positionSeconds:0,...mocks.nativeFailure})}>Simular falha do Media3</button></div>}))
vi.mock('../components/PlaybackDetails',()=>({PlaybackDetails:()=>null}))
vi.mock('../components/VideoPlayer',()=>({VideoPlayer:({onProgress,onPlaybackEvent,onEnded,session,overlay,onSources}:any)=><div data-testid="active-video" data-src={session.sources[0].src}><button onClick={onSources}>Voltar às fontes</button><button onClick={()=>onPlaybackEvent('failed',0,'Erro HTML5 de mídia: 3')}>Simular falha de mídia</button><button onClick={()=>{onPlaybackEvent('progress',265);onProgress({positionSeconds:265,durationSeconds:300})}}>35 segundos restantes</button><button onClick={()=>{onEnded();onEnded()}}>Terminar vídeo</button>{overlay}</div>}))
import {AutomaticWatch} from '../playback/AutomaticWatch'
import {LibraryProvider} from '../state/library'
const media:Media={id:'tmdb-tv-31132',kind:'tv',imdbId:'tt1710308',title:'Série de teste',source:'tmdb',overview:'',year:2020,rating:8,genres:[],genreIds:[],poster:'',backdrop:'',cast:[],seasons:[{id:0,number:0,name:'Especiais',episodeCount:1},{id:1,number:1,name:'1',episodeCount:2},{id:2,number:2,name:'2',episodeCount:1}]}
const episode=(number:number)=>({id:number,number,name:`Capítulo ${number}`,overview:'',runtime:5})
const catalog={episodes:vi.fn(async(_:Media,season:number)=>({origin:'tmdb' as const,data:season===1?[episode(1),episode(2)]:[episode(1)]}))} as unknown as CatalogProvider
function item(context:PlaybackContext,mode:'dub'|'sub'):Candidate {return {id:mode,providerId:'fenixflix',identity:JSON.stringify([context.episode,mode]),engine:'web',receivedAt:Date.now(),score:100,language:{modes:[mode],dual:false,confirmed:false},session:{id:media.id,title:media.title,sources:[{src:`https://example.test/${context.episode?.seasonNumber}-${context.episode?.episodeNumber}-${mode}.mp4`,type:'video/mp4'}],poster:'',sourceLabel:'',attribution:'',license:{name:'',url:'',projectUrl:''}}}}
function Location(){return <p data-testid="location">{useLocation().search}</p>}
function mount(path='?temporada=1&episodio=1'){return render(<LibraryProvider><MemoryRouter initialEntries={['/assistir/'+media.id+path]}><AutomaticWatch media={media} catalogProvider={catalog}/><Location/></MemoryRouter></LibraryProvider>)}
beforeEach(()=>{mocks.native=false;mocks.nativeFailure=undefined;mocks.experimental=false;localStorage.clear();mocks.redirect.mockReset();mocks.find.mockReset().mockImplementation(async(context:PlaybackContext)=>context.episode?.episodeNumber===1&&context.episode?.seasonNumber===1?[item(context,'dub')]:[item(context,'dub'),item(context,'sub')])})
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.useRealTimers()})
it('shows the declared language once after playback advances',async()=>{
 mount();await screen.findByTestId('active-video')
 expect(screen.queryByText('Reproduzindo dublado')).toBeNull()
 vi.useFakeTimers()
 const progress=screen.getByText('35 segundos restantes')
 fireEvent.click(progress)
 expect(screen.getByText('Reproduzindo dublado')).toBeVisible()
 await act(()=>vi.advanceTimersByTimeAsync(2100))
 expect(screen.queryByText('Reproduzindo dublado')).toBeNull()
 fireEvent.click(progress)
 expect(screen.queryByText('Reproduzindo dublado')).toBeNull()
})
it('advances from a native MP4 redirect failure to the HLS candidate without rediscovery',async()=>{
 mocks.native=true
 mocks.nativeFailure={category:'network',errorCode:2001,networkCause:'redirect-policy'}
 mocks.find.mockImplementation(async(context:PlaybackContext)=>['video/mp4','application/vnd.apple.mpegurl'].map((mimeType,index)=>({
  ...item(context,'dub'),id:`source-${index}`,identity:`source-${index}`,engine:'native',input:{url:`https://example.test/source-${index}`,mimeType},
 })))
 mount()
 const first=await screen.findByRole('button',{name:'Simular falha do Media3'})
 fireEvent.click(first)
 await waitFor(()=>expect(first).not.toBeInTheDocument())
 fireEvent.click(await screen.findByRole('button',{name:'Simular falha do Media3'}))
 expect(await screen.findByRole('heading',{name:'Não foi possível assistir agora'})).toBeVisible()
 expect(mocks.find).toHaveBeenCalledOnce()
})
it('shows next at 35 seconds but does not advance early; preserves chosen audio into the next lookup',async()=>{
 const view=mount();await screen.findByTestId('active-video');fireEvent.click(screen.getByText('35 segundos restantes'));expect(mocks.find).toHaveBeenCalledTimes(1)
 fireEvent.click(view.container.querySelector('.next-episode-overlay')!);await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('episodio=2'));await waitFor(()=>expect(screen.getByTestId('active-video')).toHaveAttribute('data-src','https://example.test/1-2-dub.mp4'));expect(screen.queryByText('Como prefere assistir?')).toBeNull()
})
it('ends once, crosses season boundary, excludes specials and ends the final episode normally',async()=>{
 const view=mount('?temporada=1&episodio=2');expect(await screen.findByTestId('active-video')).toHaveAttribute('data-src','https://example.test/1-2-dub.mp4');fireEvent.click(screen.getByText('Terminar vídeo'));await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('temporada=2&episodio=1'));await waitFor(()=>expect(screen.getByTestId('active-video')).toHaveAttribute('data-src','https://example.test/2-1-dub.mp4'));const calls=mocks.find.mock.calls.length;fireEvent.click(screen.getByText('Terminar vídeo'));await screen.findByText('Você chegou ao último episódio disponível.');expect(mocks.find).toHaveBeenCalledTimes(calls);expect(mocks.find.mock.calls.some(([context])=>context.episode.seasonNumber===0)).toBe(false)
})
it('keeps the language tabs and filtered sources inside the player and reopens them without discovery',async()=>{
 const view=mount('?temporada=1&episodio=2');const stage=screen.getByRole('region',{name:'Área de reprodução'});const inside=within(stage);fireEvent.click(await inside.findByRole('button',{name:'Voltar às fontes'}));expect(await inside.findByRole('tab',{name:'Dublado'})).toHaveAttribute('aria-selected','true');expect(screen.queryByRole('button',{name:/Servidor 2.*Legendado/})).toBeNull();fireEvent.click(inside.getByRole('tab',{name:'Legendado'}));expect(screen.queryByRole('button',{name:/Servidor 1.*Dublado/})).toBeNull();fireEvent.click(screen.queryByRole('button',{name:/Servidor 2.*Legendado/})!);expect(await inside.findByTestId('active-video')).toHaveAttribute('data-src','https://example.test/1-2-sub.mp4');fireEvent.click(inside.getByRole('button',{name:'Voltar às fontes'}));expect(inside.getByRole('tab',{name:'Legendado'})).toHaveAttribute('aria-selected','true');expect(inside.queryByTestId('active-video')).toBeNull();expect(mocks.find).toHaveBeenCalledOnce()
})
it('centers a single available language in the menu and never invents a second tab',async()=>{
 const view=mount();await screen.findByTestId('active-video');fireEvent.click(screen.getByRole('button',{name:'Voltar às fontes'}));expect(screen.getAllByRole('tab')).toHaveLength(1);expect(screen.getByRole('tab',{name:'Dublado'})).toHaveAttribute('aria-selected','true');expect(view.container.querySelector('.source-language-tabs.single')).toBeInTheDocument()
})
it('distinguishes a playback failure from missing sources and removes empty language actions',async()=>{
 const view=mount('?temporada=1&episodio=2')
 fireEvent.click(await screen.findByRole('button',{name:'Simular falha de mídia'}))
 expect(await screen.findByTestId('active-video')).toHaveAttribute('data-src','https://example.test/1-2-sub.mp4')
 fireEvent.click(screen.getByRole('button',{name:'Simular falha de mídia'}))
 expect(await screen.findByText('Não foi possível assistir agora')).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:/Tentar (dublado|legendado)/})).not.toBeInTheDocument()
 expect(mocks.find).toHaveBeenCalledOnce()
})
it('skips a confirmed HTTPS downgrade without mounting that player and tries the next server',async()=>{
 mocks.redirect.mockResolvedValue({downgrade:true,status:302})
 mocks.find.mockImplementation(async(context:PlaybackContext)=>{
  const original=item(context,'dub')
  const fallback={...original,id:'secure',identity:'secure',score:90,session:{...original.session!,sources:[{src:'https://example.test/secure.mp4',type:'video/mp4'}]}}
  return [{...original,checkRedirect:true},fallback]
 })
 mount()
 expect(await screen.findByTestId('active-video')).toHaveAttribute('data-src','https://example.test/secure.mp4')
 expect(mocks.redirect).toHaveBeenCalledOnce()
 expect(mocks.find).toHaveBeenCalledOnce()
})
it.each([
 {failure:{category:'codec'} as const,fallback:true},
 {failure:{category:'network',httpStatus:403} as const,fallback:false},
 {failure:{category:'protection'} as const,fallback:false},
])('uses HTML5 only for eligible pre-start Media3 engine failures ($failure.category)',async({failure,fallback})=>{
 mocks.native=true
 mocks.nativeFailure=failure
 mocks.find.mockImplementation(async(context:PlaybackContext)=>[{
  ...item(context,'dub'),engine:'native',input:{url:'https://example.test/1-1-dub.mp4',mimeType:'video/mp4'},
 }])
 mount()
 fireEvent.click(await screen.findByRole('button',{name:'Simular falha do Media3'}))
 if(fallback)expect(await screen.findByTestId('active-video')).toHaveAttribute('data-src','https://example.test/1-1-dub.mp4')
 else{
  expect(await screen.findByRole('heading',{name:'Não foi possível assistir agora'})).toBeVisible()
  expect(screen.queryByTestId('active-video')).not.toBeInTheDocument()
 }
 expect(mocks.find).toHaveBeenCalledOnce()
})
it('keeps diagnostic details in the log even in the experimental build',async()=>{
 mocks.experimental=true
 mocks.redirect.mockResolvedValue({downgrade:true,status:302})
 mocks.find.mockImplementation(async(context:PlaybackContext)=>[{...item(context,'dub'),checkRedirect:true}])
 const log=vi.spyOn(console,'info').mockImplementation(()=>{})
 try{
  mount()
  const stage=within(screen.getByRole('region',{name:'Área de reprodução'}))
  await stage.findByRole('heading',{name:'Não foi possível assistir agora'})
  expect(log.mock.calls.some(([,message])=>typeof message==='string'&&message.includes('"status":302')&&message.includes('"runId"'))).toBe(true)
  expect(screen.queryByText(/HTTPS|HTTP|302|Tentativa normal-|Estado das consultas|Configurações experimentais/)).not.toBeInTheDocument()
  expect(stage.queryByRole('button',{name:'Escolher servidor'})).not.toBeInTheDocument()
  expect(screen.queryByText(/Estado das consultas|reprodução verificada|Compatível/)).not.toBeInTheDocument()
 }finally{log.mockRestore()}
})
it('keeps the backdrop behind the inline video and the source menu',async()=>{
 mount()
 await screen.findByTestId('active-video')
 const stage=screen.getByRole('region',{name:'Área de reprodução'})
 expect(stage.querySelector('.player-stage-backdrop')).not.toBeNull()
 fireEvent.click(screen.getByText('35 segundos restantes'))
 expect(stage).not.toHaveClass('media-visible')
 expect(stage.querySelector('.player-stage-backdrop')).not.toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Voltar às fontes'}))
 expect(stage.querySelector('.player-stage-backdrop')).not.toBeNull()
})
it('never treats iframe document load as playback and returns to the existing menu on the problem action',async()=>{
 vi.stubEnv('VITE_ENABLE_EMBEDMOVIES_FALLBACK','true')
 mocks.find.mockResolvedValue([]);const view=mount();const stage=screen.getByRole('region',{name:'Área de reprodução'});await waitFor(()=>expect(view.container.querySelector('iframe')).not.toBeNull());fireEvent.load(view.container.querySelector('iframe')!);expect(within(stage).getByText('Disponibilidade não confirmada')).toBeVisible();fireEvent.click(within(stage).getByRole('button',{name:'Problema com o vídeo? Escolher outro servidor'}));expect(view.container.querySelector('iframe')).toBeNull();expect(within(stage).getByText('Idiomas e servidores')).toBeVisible();expect(mocks.find).toHaveBeenCalledOnce()
})
it('ends discovery without an iframe by default and retries inside the player',async()=>{
 mocks.find.mockResolvedValueOnce([])
 const view=mount()
 const stage=within(screen.getByRole('region',{name:'Área de reprodução'}))
 await stage.findByRole('heading',{name:'Não foi possível assistir agora'})
 expect(view.container.querySelector('iframe')).toBeNull()
 expect(stage.queryByRole('status')).toBeNull()
 expect(stage.queryByRole('button',{name:'Escolher servidor'})).toBeNull()
 fireEvent.click(stage.getByRole('button',{name:'Tentar novamente'}))
 expect(await stage.findByTestId('active-video')).toBeVisible()
 expect(mocks.find).toHaveBeenCalledTimes(2)
})
it('unmounts a native attempt that never signals progress and keeps the source menu available',async()=>{
 vi.useFakeTimers()
 mocks.native=true
 mocks.find.mockImplementation(async(context:PlaybackContext)=>[{
  ...item(context,'dub'),engine:'native',input:{url:'https://example.test/media.mp4',mimeType:'video/mp4'}
 }])
 mount()
 const stage=within(screen.getByRole('region',{name:'Área de reprodução'}))
 await act(()=>vi.advanceTimersByTimeAsync(1))
 expect(stage.getByTestId('native-without-events')).toBeVisible()
 await act(()=>vi.advanceTimersByTimeAsync(45_000))
 expect(stage.queryByTestId('native-without-events')).toBeNull()
 expect(stage.getByRole('heading',{name:'Não foi possível assistir agora'})).toBeVisible()
 fireEvent.click(stage.getByRole('button',{name:'Escolher servidor'}))
 expect(stage.getByRole('heading',{name:'Idiomas e servidores'})).toBeVisible()
})
it('allows disabling auto-next and rejects a missing episode before querying any source',async()=>{
 const view=mount();await screen.findByTestId('active-video');fireEvent.click(screen.getByRole('checkbox',{name:'Reproduzir próximo episódio automaticamente'}));fireEvent.click(screen.getByText('Terminar vídeo'));expect(mocks.find).toHaveBeenCalledTimes(1);view.unmount();mocks.find.mockClear();mount('?temporada=1&episodio=99');await screen.findByRole('alert');expect(mocks.find).not.toHaveBeenCalled()
})

it('keeps a manually opened server menu visible when asynchronous results arrive',async()=>{
 let finish!:(sources:Candidate[])=>void;mocks.find.mockImplementation((context:PlaybackContext)=>new Promise<Candidate[]>(resolve=>{finish=()=>resolve([item(context,'dub')])}))
 mount();const servers=screen.getByRole('button',{name:'Servidores'});expect(servers).toBeDisabled();await waitFor(()=>expect(servers).toBeEnabled());fireEvent.click(servers);expect(screen.getByText('Idiomas e servidores')).toBeVisible();await act(async()=>finish([]));expect(screen.queryByTestId('active-video')).toBeNull();expect(screen.getByText('Idiomas e servidores')).toBeVisible();fireEvent.click(screen.queryByRole('button',{name:/Servidor 1.*Dublado/})!);await screen.findByTestId('active-video')
})
it('updates the airing header after episode navigation and hides a missing direction',async()=>{
 mount()
 await screen.findByText('Em exibição · T1 E1')
 const nav=await screen.findByRole('navigation',{name:'Navegação de episódios'})
 expect(within(nav).queryByRole('button',{name:'Anterior'})).toBeNull()
 fireEvent.click(within(nav).getByRole('button',{name:'Próximo episódio'}))
 await screen.findByText('Em exibição · T1 E2')
 const updated=await screen.findByRole('navigation',{name:'Navegação de episódios'})
 expect(within(updated).getAllByRole('button').map(button=>button.textContent?.trim())).toEqual(['Anterior','Próximo episódio'])
})
