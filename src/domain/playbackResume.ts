export interface PlaybackPreference {
  providerId:'fenixflix'|'brazuca'|'embedmovies'|'zeus'
  sourceKey:string
  engine:'native'|'web'|'iframe'
  format:'mp4'|'webm'|'hls'|'matroska'|'iframe'|'unknown'
  language:'dub'|'sub'|'unknown'
  savedAt:number
}
export function readPlaybackPreference(value:unknown):PlaybackPreference|undefined {
  if(!value||typeof value!=='object')return
  const p=value as PlaybackPreference
  if(!['fenixflix','brazuca','embedmovies','zeus'].includes(p.providerId)||!['native','web','iframe'].includes(p.engine)||!['mp4','webm','hls','matroska','iframe','unknown'].includes(p.format)||!['dub','sub','unknown'].includes(p.language)||!Number.isFinite(p.savedAt)||p.savedAt<0||typeof p.sourceKey!=='string'||!/^([a-z]+:[a-f0-9]{1,8}|embedmovies)$/.test(p.sourceKey))return
  return {providerId:p.providerId,sourceKey:p.sourceKey,engine:p.engine,format:p.format,language:p.language,savedAt:p.savedAt}
}
