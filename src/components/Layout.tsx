import { Link, NavLink, Outlet, useLocation,useNavigate } from 'react-router'
import { Bookmark, Film, FlaskConical, Home, Search, Tv, ArrowUpRight, ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { AndroidLifecycle } from './AndroidLifecycle'
import { ScrollMemory } from './ScrollMemory'
import {SEARCH_FOCUS_EVENT,SEARCH_FOCUS_STATE} from './searchFocus'
import { experimentalProvidersEnabled } from '../config/experimentalProviders'
import { useNativeExperimentAvailable } from '../experimental/playbackEngine'

const navigation = [{ to: '/', label: 'Início', icon: Home }, { to: '/filmes', label: 'Filmes', icon: Film }, { to: '/series', label: 'Séries', icon: Tv }, { to: '/buscar', label: 'Buscar', icon: Search }, { to: '/minha-lista', label: 'Minha lista', icon: Bookmark }]
export function Brand() { return <Link to="/" className="brand" aria-label="NOCTA — início"><span className="brand-symbol"><i /><i /></span>NOCTA<span className="brand-dot">●</span></Link> }
export function Layout() {
  const location = useLocation()
  const experimentalNative = useNativeExperimentAvailable()
  const showLaboratory = experimentalProvidersEnabled && (import.meta.env.DEV || experimentalNative === true) && !location.pathname.startsWith('/assistir/')
  const searchClick=(event:React.MouseEvent<HTMLAnchorElement>,to:string)=>{if(to==='/buscar'&&location.pathname==='/buscar'&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){event.preventDefault();window.dispatchEvent(new Event(SEARCH_FOCUS_EVENT))}}
  useEffect(() => { document.title = 'NOCTA · Histórias que ficam' }, [location.pathname])
  return <><AndroidLifecycle /><ScrollMemory /><a className="skip-link" href="#conteudo">Pular para conteúdo</a>
    <header className="site-header"><div className="header-inner"><Brand /><nav className="desktop-nav" aria-label="Navegação principal">
      {navigation.map(({ to, label }) => <NavLink key={to} end={to === '/'} to={to} state={to==='/buscar'?SEARCH_FOCUS_STATE:undefined} onClick={event=>searchClick(event,to)}>{label}</NavLink>)}
    </nav><div className="header-end">{showLaboratory && <Link to="/laboratorio" className="icon-button" aria-label="Laboratório de Servidores" title="Laboratório de Servidores"><FlaskConical size={21} /></Link>}<Link to="/buscar" state={SEARCH_FOCUS_STATE} onClick={event=>searchClick(event,'/buscar')} className="icon-button" aria-label="Buscar títulos"><Search size={21} /></Link></div></div></header>
    <main id="conteudo"><Outlet /></main><Footer /><nav className="mobile-nav" aria-label="Navegação móvel">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} end={to === '/'} to={to} state={to==='/buscar'?SEARCH_FOCUS_STATE:undefined} onClick={event=>searchClick(event,to)}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
  </>
}
export function Footer() { return <footer className="site-footer"><div className="footer-top"><div><Brand /><p>Apague as luzes. Encontre sua próxima história.</p></div><Link to="/sobre" className="text-link">Sobre o projeto & créditos <ArrowUpRight size={15} /></Link></div><div className="footer-bottom"><span>© {new Date().getFullYear()} NOCTA · Protótipo independente, sem fins comerciais.</span><span>Feito para descobrir. Pensado para você.</span></div></footer> }
export function BackLink({ to, children = 'Voltar para explorar' }: { to?: string; children?: React.ReactNode }) { const navigate=useNavigate(),location=useLocation();const remembered=location.state?.returnTo;const target=to??(typeof remembered==='string'&&remembered.startsWith('/')&&!remembered.startsWith('//')?remembered:'/');return <Link to={target} onClick={event=>{if(!to&&(window.history.state?.idx??0)>0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&event.button===0){event.preventDefault();navigate(-1)}}} className="back-link"><ArrowLeft size={17} />{children}</Link> }
