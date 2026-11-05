import { useRef } from 'react'
import { ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'
import type { Media, RailContext } from '../domain/media'
import { MediaCard } from './MediaCard'
import { railSearchParams } from '../domain/browse'

export function Carousel({ title, eyebrow, items, ranked = false, link, browse }: { title: string; eyebrow?: string; items: Media[]; ranked?: boolean; link?: string; browse?: RailContext }) {
  const ref = useRef<HTMLDivElement>(null)
  const target = browse ? `/buscar?${railSearchParams(browse)}` : link ?? '/buscar'
  if (!items.length) return null
  return <section className="catalog-section"><div className="section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}<span className="heading-dot">.</span></h2></div><div className="section-actions"><Link to={target} className="see-all">Ver todos <ArrowUpRight size={14} /></Link><button className="carousel-arrow" onClick={() => ref.current?.scrollBy({ left: -ref.current.clientWidth * .8, behavior: 'smooth' })} aria-label={`Anterior em ${title}`}><ChevronLeft size={19} /></button><button className="carousel-arrow" onClick={() => ref.current?.scrollBy({ left: ref.current.clientWidth * .8, behavior: 'smooth' })} aria-label={`Próximos em ${title}`}><ChevronRight size={19} /></button></div></div>
    <div className="carousel" ref={ref}>{items.map((m, i) => <MediaCard key={m.id} media={m} rank={ranked ? i + 1 : undefined} />)}</div>
  </section>
}
