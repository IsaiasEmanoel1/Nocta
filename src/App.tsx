import { Component } from 'react'
import type { PropsWithChildren } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { LibraryProvider } from './state/library'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Search } from './pages/Search'
import { Details } from './pages/Details'
import { Library } from './pages/Library'
import { Watch } from './pages/Watch'
import { StremioExperiment } from './pages/StremioExperiment'
import { About } from './pages/About'
import { EmptyState } from './components/Feedback'
import { PlaybackDiagnostics } from './pages/PlaybackDiagnostics'
import { DemoCatalogProvider } from './services/catalog'
import { DemoPlaybackProvider } from './services/playback'

const diagnosticCatalog = new DemoCatalogProvider()
const diagnosticPlayback = new DemoPlaybackProvider()

class ErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="page-shell"><h1>Vamos tentar de novo?</h1><p>Houve um problema ao abrir esta página.</p><button className="button button-primary" onClick={() => window.location.assign('/')}>Voltar ao início</button></div> : this.props.children }
}
export default function App() {
  return <ErrorBoundary><LibraryProvider><BrowserRouter><Routes><Route element={<Layout />}><Route index element={<Home />} /><Route path="filmes" element={<Home kind="movie" />} /><Route path="series" element={<Home kind="tv" />} /><Route path="buscar" element={<Search />} /><Route path="minha-lista" element={<Library />} /><Route path="titulo/:id" element={<Details />} /><Route path="assistir/:id" element={<Watch />} /><Route path="configuracoes" element={<StremioExperiment />} /><Route path="sobre" element={<About />} /><Route path="diagnostico/reproducao" element={<PlaybackDiagnostics />} /><Route path="diagnostico/player/:id" element={<Watch catalogProvider={diagnosticCatalog} provider={diagnosticPlayback} />} /><Route path="*" element={<div className="page-shell"><EmptyState title="Essa página saiu de cena" description="Volte ao catálogo para encontrar uma nova história." /></div>} /></Route></Routes></BrowserRouter></LibraryProvider></ErrorBoundary>
}
