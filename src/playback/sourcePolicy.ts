import type {AddonSource} from '../experimental/StremioAddonAdapter'
export type LanguageChoice='dub'|'sub'|'unknown'
export interface LanguageDeclaration { modes:LanguageChoice[]; dual:boolean; confirmed:false }
export function languageDeclaration(source:Pick<AddonSource,'name'|'description'|'declaredLanguages'>):LanguageDeclaration {
 const label=`${source.name} ${source.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const dual=/dual(?:\s|\/|-)*(?:audio|leg)|multi.?audio/.test(label)
 const dub=/\bdublad[oa]\b|\bpt[-_ ]?br\b|portugues|🇧🇷/.test(label)||source.declaredLanguages.some(language=>/^pt(?:[-_]|$)/i.test(language))
 const sub=/\blegendad[oa]\b|\bsubtitled\b|\bdual\/leg\b/.test(label)
 const modes:LanguageChoice[]=[];if(dub)modes.push('dub');if(sub)modes.push('sub')
 return {modes:modes.length?modes:['unknown'],dual,confirmed:false}
}
export function isCinemaCapture(label:string){
 const text=label.replace(/https?:\/\/\S+/g,'')
 return /(?:^|[^a-z0-9])(?:cam|hdcam|camrip|hd[- .]?cam|telesync|tele[- .]?sync|hdts)(?:$|[^a-z0-9])/i.test(text)||/[[(]\s*TS\s*[)\]]|qualidade\s*[:=-]\s*TS\b/i.test(text)
}
export function qualityScore(quality?:string){const q=quality?.toLowerCase();return q==='1080p'||q==='fullhd'||q==='fhd'?100:q==='720p'||q==='hd'?80:q==='2160p'||q==='4k'?65:q==='480p'?55:40}
