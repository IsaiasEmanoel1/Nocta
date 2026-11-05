import {act,fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router'
import {afterEach,expect,it,vi} from 'vitest'
import {PlayerStage,ProviderRows,PlaybackSlot} from '../playback/PlayerStage'
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
it('keeps all four server rows in priority order with independent states',()=>{
 const view=render(<ProviderRows outcomes={[{id:'fenixflix',state:'sources',count:1},{id:'brazuca',state:'checking',count:0},{id:'embedmovies',state:'waiting',count:0},{id:'zeus',state:'http',count:0}]}/>)
 const rows=[...view.container.querySelectorAll('.provider-row')];expect(rows.map(row=>(row as HTMLElement).dataset.provider)).toEqual(['fenixflix','brazuca','embedmovies','zeus']);expect(rows.map(row=>(row as HTMLElement).dataset.state)).toEqual(['sources','checking','waiting','http']);expect(screen.getByText('Buscando…')).toBeVisible();expect(screen.getByText('Não respondeu')).toBeVisible()
})
it('shows a slow warning after five seconds without terminating loading, removes it on start',async()=>{
 vi.useFakeTimers();const view=render(<PlayerStage loading token="one"/>);await act(()=>vi.advanceTimersByTimeAsync(4999));expect(screen.queryByText(/A conexão está lenta/)).toBeNull();await act(()=>vi.advanceTimersByTimeAsync(1));expect(screen.getByText('A conexão está lenta. Aguarde mais alguns segundos...')).toBeVisible();expect(screen.getByRole('region')).toHaveAttribute('aria-busy','true');view.rerender(<PlayerStage token="one"/>);expect(screen.queryByText(/A conexão está lenta/)).toBeNull()
})
it('waits for native release before mounting a different engine',async()=>{
 let close!:()=>void;const wait=()=>new Promise<void>(resolve=>{close=resolve});render(<PlaybackSlot runId="second" wait={wait}><button>Outro vídeo</button></PlaybackSlot>);expect(screen.queryByText('Outro vídeo')).toBeNull();await act(async()=>close());expect(screen.getByText('Outro vídeo')).toBeVisible();fireEvent.click(screen.getByText('Outro vídeo'))
})
