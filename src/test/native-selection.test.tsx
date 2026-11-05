import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {PlayerEvent} from '../experimental/playbackEngine'
const mock=vi.hoisted(()=>({load:vi.fn(),close:vi.fn(),listener:undefined as undefined|((event:PlayerEvent)=>void)}))
vi.mock('../experimental/playbackEngine',async original=>({...await original<typeof import('../experimental/playbackEngine')>(),useNativeExperimentAvailable:()=>true,nativePlaybackEngine:{load:mock.load,close:mock.close,onEvent:async(listener:(event:PlayerEvent)=>void)=>{mock.listener=listener;return()=>{mock.listener=undefined}}}}))
vi.mock('../experimental/nativeAttempt',async original=>({...await original<typeof import('../experimental/nativeAttempt')>(),nativeInputFingerprint:async(input:{url:string})=>input.url.includes('second')?'bbbbbbbbbbbbbbbbbbbbbbbb':'aaaaaaaaaaaaaaaaaaaaaaaa'}))
vi.mock('../config/stremioServices',()=>({stremioExperimentAvailable:true,authorizedDevelopmentAddons:[{id:'fenixflix-diagnostics',manifestUrl:'https://example.test/manifest.json'}]}))
vi.mock('../experimental/StremioAddonAdapter',async original=>({...await original<typeof import('../experimental/StremioAddonAdapter')>(),StremioAddonAdapter:class{
 async loadManifest(){return{name:'FenixFlix'}}
 async streams(){return ['first','second'].map((name,index)=>({id:`tt1710308:1:1:${index}`,name:`Malfoy ${name}`,description:name,format:'unsupported',reportedFormat:'matroska',declaredLanguages:['pt'],confirmedLanguages:[],nativeCandidate:{url:`https://example.test/${name}`,mimeType:'video/x-matroska',headers:{'User-Agent':name}}}))}
}}))
import {StremioExperiment} from '../pages/StremioExperiment'
beforeEach(()=>{mock.load.mockReset().mockResolvedValue(undefined);mock.close.mockReset().mockResolvedValue(undefined)})
afterEach(cleanup)
async function setup(){render(<StremioExperiment/>);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Consultar fontes'}));await screen.findByText(/FenixFlix: 2 fontes/);return screen.getByText('Malfoy second').closest('li')!}
it('a manual click uses the exact selected second source, MIME and headers, never the first result',async()=>{
 const row=await setup();fireEvent.click(within(row).getByRole('button',{name:'Testar no Media3'}))
 await waitFor(()=>expect(mock.load).toHaveBeenCalledOnce())
 expect(mock.load.mock.calls[0][0]).toMatchObject({url:'https://example.test/second',mimeType:'video/x-matroska',headers:{'User-Agent':'second'},sourceId:'tt1710308:1:1:1',inputFingerprint:'bbbbbbbbbbbbbbbbbbbbbbbb'})
})
it('timeout survives closed events; retry has a new run and old events cannot verify it',async()=>{
 const row=await setup();fireEvent.click(within(row).getByRole('button',{name:'Testar no Media3'}));await waitFor(()=>expect(mock.load).toHaveBeenCalledOnce())
 const first=mock.load.mock.calls[0][0].sessionId
 act(()=>{mock.listener?.({sessionId:first,event:'failed',positionSeconds:3,detail:'STARTUP_TIMEOUT'});mock.listener?.({sessionId:first,event:'closed',positionSeconds:3})})
 expect(within(row).getByText(/O vídeo e o áudio não iniciaram/)).toBeInTheDocument()
 fireEvent.click(within(row).getByRole('button',{name:'Tentar novamente no Media3'}));await waitFor(()=>expect(mock.load).toHaveBeenCalledTimes(2))
 const next=mock.load.mock.calls[1][0].sessionId;expect(next).not.toBe(first)
 act(()=>mock.listener?.({sessionId:first,event:'progress',positionSeconds:5,videoRendered:true,audioAdvancing:true}))
 expect(within(row).queryByText(/Eventos dos renderizadores detectados/)).not.toBeInTheDocument()
 act(()=>mock.listener?.({sessionId:next,event:'progress',positionSeconds:2,videoRendered:true,audioAdvancing:true}))
 expect(within(row).getByText(/Eventos dos renderizadores detectados/)).toBeInTheDocument()
})
