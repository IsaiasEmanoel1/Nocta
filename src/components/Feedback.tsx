import { Compass, SearchX } from 'lucide-react'
import { Link } from 'react-router'
export function Loading() { return <div className="loading-state" role="status"><span className="loader" /><p>Preparando sua próxima história…</p></div> }
export function EmptyState({ title, description, search = false }: { title: string; description: string; search?: boolean }) { return <div className="empty-state">{search ? <SearchX size={38} /> : <Compass size={38} />}<h2>{title}</h2><p>{description}</p><Link to="/" className="button button-secondary">Explorar o catálogo</Link></div> }
export function Notice({ children }: { children?: React.ReactNode }) { return children ? <p role="status" className="notice">{children}</p> : null }
