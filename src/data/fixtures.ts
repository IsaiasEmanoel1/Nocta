import type { Episode, Media } from '../domain/media'

const titles = [
  ['Além do Horizonte', 'movie', 'Ficção científica', 2026, 8.7, 'Uma cartógrafa descobre um sinal além das montanhas. Para encontrar sua origem, ela precisará deixar para trás tudo o que conhece.'],
  ['Maré de Dentro', 'movie', 'Drama', 2025, 8.3, 'De volta à vila onde cresceu, uma fotógrafa encontra nas pequenas histórias do litoral um novo jeito de enxergar a própria vida.'],
  ['Ecos do Amanhã', 'tv', 'Ficção científica', 2026, 9.1, 'Uma transmissão de rádio parece antecipar o futuro de uma cidade. Cada episódio revela uma escolha capaz de mudar o próximo dia.'],
  ['A Última Estação', 'movie', 'Suspense', 2025, 7.9, 'Um trem faz uma parada que não está no mapa. Cinco passageiros descobrem que seus destinos estão mais conectados do que imaginam.'],
  ['Floresta Azul', 'tv', 'Fantasia', 2026, 8.8, 'Duas irmãs atravessam uma floresta que guarda a memória de todos que já passaram por ela.'],
  ['Entre Luzes', 'movie', 'Romance', 2024, 8.1, 'Dois desconhecidos dividem a última noite de verão em uma cidade iluminada por histórias que quase aconteceram.'],
  ['Depois da Chuva', 'movie', 'Drama', 2025, 8.6, 'Uma pequena livraria vira ponto de encontro para pessoas que estão recomeçando.'],
  ['Órbita', 'tv', 'Ficção científica', 2026, 8.9, 'Na primeira estação construída longe da Terra, uma equipe investiga o desaparecimento de uma constelação.'],
  ['O Peso do Silêncio', 'movie', 'Suspense', 2024, 7.8, 'Uma restauradora encontra mensagens escondidas em uma gravação antiga e decide descobrir quem as deixou.'],
  ['Oceano de Vidro', 'movie', 'Aventura', 2026, 8.4, 'Uma expedição em alto-mar segue uma corrente que não deveria existir.'],
  ['Cidade Invisível do Norte', 'tv', 'Drama', 2025, 8.2, 'A vida de seis moradores se cruza durante um inverno que parece não terminar.'],
  ['Quando as Estrelas Caem', 'movie', 'Fantasia', 2025, 8.5, 'Um observatório abandonado conecta uma menina a um mundo que só existe depois do pôr do sol.'],
  ['O Jardim dos Dias', 'tv', 'Romance', 2024, 7.9, 'Uma florista passa a receber cartas destinadas a alguém que viveu ali há trinta anos.'],
  ['Passagem Secreta', 'movie', 'Aventura', 2025, 8.0, 'Quatro amigos redescobrem uma trilha da infância e um segredo que transforma a viagem.'],
  ['Notas de um Verão', 'movie', 'Drama', 2026, 8.7, 'Música e amizade aproximam uma banda durante sua primeira viagem pelo interior.'],
  ['Tempo Suspenso', 'tv', 'Suspense', 2026, 8.4, 'Em uma cidade sem relógios, uma investigadora tenta reconstruir os últimos dez minutos de um dia.'],
] as const
const genreMap: Record<string, number> = { 'Ficção científica': 878, Drama: 18, Suspense: 53, Fantasia: 14, Romance: 10749, Aventura: 12, Animação: 16 }
export const fictionalCatalog: Media[] = titles.map(([title, kind, genre, year, rating, overview], i) => ({
  id: `fiction-${i + 1}`, title, kind, genres: [genre, i % 2 ? 'Drama' : 'Aventura'].filter((v, n, a) => a.indexOf(v) === n),
  genreIds: [genreMap[genre]], year, rating, overview, source: 'fiction',
  poster: `/art/poster-${i + 1}.svg`, backdrop: `/art/scene-${i % 4}.svg`, runtime: kind === 'movie' ? 98 + i * 3 : 46,
  tagline: i === 0 ? 'O desconhecido também é um lugar para voltar.' : 'Toda história deixa alguma coisa em você.',
  cast: [{ name: 'Helena Duarte', character: 'Lia' }, { name: 'Caio Ventura', character: 'Tomás' }, { name: 'Clara Reis', character: 'Ana' }, { name: 'Miguel Nunes', character: 'André' }],
  seasons: kind === 'tv' ? [1, 2].map(n => ({ id: n, number: n, name: `Temporada ${n}`, episodeCount: n === 1 ? 6 : 4 })) : undefined,
}))
export const demoCatalog: Media[] = [
  { id: 'demo-bunny', title: 'Big Buck Bunny', year: 2008, runtime: 10, genres: ['Animação', 'Aventura'], overview: 'Um coelho de coração grande decide dar uma lição em três pequenos valentões. Um curta de animação do Blender Institute.', demoLabel: 'Blender Institute · CC BY 3.0' },
  { id: 'demo-sintel', title: 'Sintel', year: 2010, runtime: 15, genres: ['Animação', 'Fantasia'], overview: 'Uma viajante embarca em uma jornada para reencontrar um pequeno dragão. Curta independente produzido pela Blender Foundation.', demoLabel: 'Blender Foundation · CC BY 3.0' },
  { id: 'demo-steel', title: 'Tears of Steel', year: 2012, runtime: 12, genres: ['Ficção científica'], overview: 'Em um futuro em Amsterdã, um grupo tenta salvar o mundo de robôs fora de controle. Projeto aberto da Blender Foundation.', demoLabel: 'Blender Foundation · CC BY 3.0' },
].map((m, i) => ({ ...m, kind: 'movie' as const, source: 'licensed-demo' as const, rating: 0, genreIds: m.genres.map(g => genreMap[g]), cast: [], poster: `/art/demo-${i}.svg`, backdrop: `/art/scene-${i}.svg` }))

export function fixtureEpisodes(media: Media, season: number): Episode[] {
  const count = media.seasons?.find(s => s.number === season)?.episodeCount ?? 0
  return Array.from({ length: count }, (_, i) => ({ id: season * 100 + i, number: i + 1,
    name: ['O primeiro sinal', 'O outro lado', 'Pontos de encontro', 'Tudo o que ficou', 'A travessia', 'Um novo começo'][i] ?? 'Recomeço',
    overview: `A história de ${media.title} continua, com novos encontros e escolhas inesperadas. Episódio fictício de demonstração.`,
    runtime: 42 + i, image: `/art/scene-${i % 4}.svg`,
  }))
}
