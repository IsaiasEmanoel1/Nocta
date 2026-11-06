import {useEffect,useState} from 'react'
import type {PlaybackState} from './coordinator'
import type {LanguageChoice} from './sourcePolicy'
import {SourceChoices,languageNames} from './PlayerStage'
import {ALL_PROVIDER_ORDER} from './coordinator'

export function SourceSelection({state,onSelect,onEmbed,onResume,onRetry}:{state:PlaybackState;onSelect:(id:string,language:LanguageChoice)=>void;onEmbed:()=>void;onResume:()=>void;onRetry:()=>void}){
 const modes=(['dub','sub','unknown'] as LanguageChoice[]).filter(mode=>state.alternatives.some(source=>source.language.modes.includes(mode)))
 const valid=(preferred?:LanguageChoice)=>preferred&&modes.includes(preferred)?preferred:modes.includes('dub')?'dub':modes[0]
 const [selected,setSelected]=useState<LanguageChoice|undefined>(()=>valid(state.language))
 const [limit,setLimit]=useState(4)
 const active=valid(selected)
 const matching=state.alternatives.filter(source=>!active||source.language.modes.includes(active)).sort((a,b)=>ALL_PROVIDER_ORDER.indexOf(a.providerId as typeof ALL_PROVIDER_ORDER[number])-ALL_PROVIDER_ORDER.indexOf(b.providerId as typeof ALL_PROVIDER_ORDER[number])||b.score-a.score)
 useEffect(()=>{if(!selected||!modes.includes(selected))setSelected(valid(state.language))},[modes.join(','),state.language])
 const checking=state.outcomes.some(row=>row.state==='checking')
 return <section className="source-picker integrated-source-picker" aria-label="Fontes disponíveis"><header><h2>Idiomas e servidores</h2>{(state.attempts>0||state.fallback)&&<button className="player-icon-button" aria-label="Voltar à reprodução" onClick={onResume}>▶</button>}</header>
  {!!modes.length&&<div className={`source-language-tabs ${modes.length===1?'single':''}`} role="tablist" aria-label="Versão do vídeo" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();let index=modes.indexOf(active!);index=event.key==='Home'?0:event.key==='End'?modes.length-1:(index+(event.key==='ArrowRight'?1:-1)+modes.length)%modes.length;setSelected(modes[index]);setLimit(4);event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[index]?.focus()}}>{modes.map(mode=><button type="button" key={mode} role="tab" tabIndex={active===mode?0:-1} aria-selected={active===mode} aria-controls="nocta-source-options" onClick={()=>{setSelected(mode);setLimit(4)}}>{languageNames[mode]}</button>)}</div>}
  <div id="nocta-source-options" className="source-options-panel" role="tabpanel" aria-label={active?`Servidores ${languageNames[active].toLowerCase()}`:'Servidores'}>
   {!state.alternatives.length&&!state.fallback&&(checking?<p role="status">Buscando servidores…</p>:<><p>Nenhum servidor disponível no momento.</p><button className="text-link" onClick={onRetry}>Tentar novamente</button></>)}
   <SourceChoices sources={matching.slice(0,limit)} language={state.language} mode={active} compact failedIds={state.failedIds} onSelect={onSelect} embed={!!state.fallback} embedLabel={state.embedLabel} onEmbed={onEmbed}/>
   {matching.length>limit&&<button className="text-link" onClick={()=>setLimit(value=>value+4)}>Mais fontes ({matching.length-limit})</button>}
  </div>
 </section>
}
