export function RailSkeleton({ title }: { title: string }) {
  return <section className="catalog-section rail-skeleton" role="status" aria-label={`Carregando ${title}`}>
    <div className="section-heading"><h2>{title}<span className="heading-dot">.</span></h2></div>
    <div className="skeleton-cards" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(number => <div key={number}><i /><span /><span /></div>)}</div>
  </section>
}
