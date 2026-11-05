import { ArrowUpRight, Film, Layers3, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { useNativeExperimentAvailable } from '../experimental/playbackEngine'
import { BackLink } from '../components/Layout'
export function About() {
  const nativeDebug=useNativeExperimentAvailable()
  return <div className="page-shell about-page"><BackLink /><p className="eyebrow">UM PROJETO INDEPENDENTE</p><h1>Histórias que ficam.<br /><span className="muted">Uma experiência nova.</span></h1><p className="about-intro">NOCTA é uma experiência de descoberta de filmes e séries, com identidade e interface originais e metadados do TMDB.</p><div className="about-principles"><article><Layers3 /><h2>Seu próprio ritmo</h2><p>Favoritos e progresso salvos neste dispositivo. Sem conta ou assinatura.</p></article><article><ShieldCheck /><h2>Catálogo ≠ reprodução</h2><p>Um título no catálogo não habilita sua exibição. A exibição depende dos direitos e da disponibilidade do fornecedor de reprodução.</p></article><article><Film /><h2>Descubra sua próxima história</h2><p>Tendências e categorias atualizadas pelo TMDB no modo de desenvolvimento não comercial.</p></article></div>
    {(import.meta.env.DEV||nativeDebug)&&<Link className="text-link" to="/configuracoes">Configurações experimentais</Link>}
    <section className="credits-section"><h2>Metadados e atribuição TMDB</h2><a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer" className="tmdb-logo-link"><img src="/tmdb.svg" alt="The Movie Database (TMDB)" width="110" height="45" onError={e => { e.currentTarget.style.display = 'none' }} /><span>THE MOVIE DATABASE <ArrowUpRight size={14} /></span></a><p className="tmdb-notice">This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p>Uso de desenvolvimento não comercial. Dados e imagens do TMDB continuam sujeitos às condições de seus provedores. <a href="https://developer.themoviedb.org/docs/faq" target="_blank" rel="noreferrer">Condições e atribuição ↗</a></p></section>
  </div>
}
