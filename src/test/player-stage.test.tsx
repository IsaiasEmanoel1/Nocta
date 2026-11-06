import {act,fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router'
import {afterEach,expect,it,vi} from 'vitest'
import {PlayerStage,PlaybackSlot,SourceChoices} from '../playback/PlayerStage'
import {Watch} from '../pages/Watch'
import {LibraryProvider} from '../state/library'
import type {CatalogProvider,Media} from '../domain/media'
const media:Media={id:'tmdb-movie-1',kind:'movie',title:'Título',source:'tmdb',overview:'',year:2026,rating:7,genres:[],genreIds:[],poster:'',backdrop:'https://image.tmdb.org/backdrop.jpg',cast:[]}
afterEach(()=>vi.useRealTimers())
it('opens the banner immediately while detail metadata is still pending',()=>{
 const catalog={detail:()=>new Promise(()=>{})} as unknown as CatalogProvider
 const view=render(<LibraryProvider><MemoryRouter initialEntries={[{pathname:'/assistir/tmdb-movie-1',state:{media}}]}><Routes><Route path="/assistir/:id" element={<Watch catalogProvider={catalog}/>}/></Routes></MemoryRouter></LibraryProvider>)
 expect(screen.getByRole('region',{name:'Área de reprodução'})).toHaveAttribute('aria-busy','true');expect(screen.getByText('Preparando sua reprodução…')).toBeVisible();expect(view.container.querySelector('.player-stage-backdrop')).toHaveStyle({backgroundImage:'url("https://image.tmdb.org/backdrop.jpg")'})
})
it('shows a slow warning after five seconds without terminating loading, removes it on start',async()=>{
 vi.useFakeTimers();const view=render(<PlayerStage loading token="one"/>);await act(()=>vi.advanceTimersByTimeAsync(4999));expect(screen.queryByText(/A conexão está lenta/)).toBeNull();await act(()=>vi.advanceTimersByTimeAsync(1));expect(screen.getByText('A conexão está lenta. Aguarde mais alguns segundos...')).toBeVisible();expect(screen.getByRole('region')).toHaveAttribute('aria-busy','true');view.rerender(<PlayerStage token="one"/>);expect(screen.queryByText(/A conexão está lenta/)).toBeNull()
})
it('waits for native release before mounting a different engine',async()=>{
 let close!:()=>void;const wait=()=>new Promise<void>(resolve=>{close=resolve});render(<PlaybackSlot runId="second" wait={wait}><button>Outro vídeo</button></PlaybackSlot>);expect(screen.queryByText('Outro vídeo')).toBeNull();await act(async()=>close());expect(screen.getByText('Outro vídeo')).toBeVisible();fireEvent.click(screen.getByText('Outro vídeo'))
})
it('shows only the loading indicator and a short message during discovery or fallback',()=>{
 const view=render(<PlayerStage media={media} loading/>)
 expect(screen.getByRole('status')).toHaveTextContent('Procurando um vídeo')
 view.rerender(<PlayerStage media={media} loading message="Preparando outro servidor…"/>)
 expect(screen.getByRole('status')).toHaveTextContent('Preparando outro servidor')
 expect(screen.queryByRole('list')).toBeNull()
})
it('only shows stable generic source names, declared metadata and unconfirmed iframe availability',()=>{
 render(<SourceChoices sources={[{id:'private',providerId:'fenixflix',displayName:'Servidor 2',serverName:'Malfoy FenixFlix',quality:'1080p',engine:'native',identity:'one',score:1,receivedAt:1,language:{modes:['dub'],dual:false,confirmed:false}}]} language="dub" failedIds={[]} onSelect={()=>{}} embed embedLabel="Servidor 3" onEmbed={()=>{}}/>)
 const choice=screen.getByRole('button',{name:/Servidor 2.*1080p/})
 expect(choice).not.toHaveAttribute('data-source-id')
 expect(choice).not.toHaveAttribute('data-provider')
 expect(screen.getByText('Servidor 3')).toBeVisible()
 expect(screen.queryByText(/FenixFlix|Brazuca|EmbedMovies|Zeus|Malfoy|reprodução verificada|compatível/i)).toBeNull()
 expect(screen.getByText(/Disponibilidade não confirmada/)).toBeVisible()
})
