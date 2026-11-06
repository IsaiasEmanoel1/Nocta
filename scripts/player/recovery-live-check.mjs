// Real provider responses in the ordinary Watch route; no media URLs are persisted.
// --brazuca explicitly selects Brazuca in the existing source menu. It does not alter provider replies.
// Repeat --case=tmdb-tv-60735:1:3 or --case=tmdb-movie-46195 to inspect exact IDs.
import {chromium} from '@playwright/test'
import {execFileSync,spawn} from 'node:child_process'
import fs from 'node:fs/promises'
const requested=process.argv.filter(arg=>arg.startsWith('--case=')).map(arg=>{
 const value=arg.slice('--case='.length)
 const match=/^(tmdb-movie-[1-9]\d*|tmdb-tv-[1-9]\d*:([1-9]\d*):([1-9]\d*))$/.exec(value)
 if(!match)throw Error('Use --case=tmdb-movie-ID ou --case=tmdb-tv-ID:TEMPORADA:EPISODIO.')
 return [value.replaceAll(':','-'),value.split(':')[0],match[2],match[3]]
})
const adb=process.env.NOCTA_ADB??'C:\\Users\\PC\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'
const directory=process.env.NOCTA_CHECK_DIRECTORY??'.cache/player-recuperacao';await fs.mkdir(directory,{recursive:true})
const pid=execFileSync(adb,['-d','shell','pidof','app.nocta.prototype'],{encoding:'utf8'}).trim();if(!pid)throw Error('Abra o Nocta no Samsung.')
execFileSync(adb,['-d','forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`])
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://localhost'));if(!page)throw Error('WebView ausente')
const events=[],api=[];let pending=''
const log=spawn(adb,['-d','logcat','--pid='+pid,'-T','1','-v','raw','NoctaMedia3:I','*:S']);log.stdout.on('data',data=>{pending+=data;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines)try{const e=JSON.parse(line);if(e.sessionId)events.push(e)}catch{}})
const requestTimes=new WeakMap()
function endpoint(request){
 const url=new URL(request.url())
 if(!['fenixflix.fenixhub.online','brazuca-play-stremio.vercel.app','zeus-br.shardweb.app'].includes(url.hostname))return
 const stream=url.pathname.indexOf('/stream/')
 if(stream<0&&!url.pathname.endsWith('/manifest.json'))return
 return {provider:url.hostname,resource:stream<0?'/manifest.json':decodeURIComponent(url.pathname.slice(stream))}
}
page.on('request',request=>{if(endpoint(request))requestTimes.set(request,Date.now())})
page.on('requestfailed',request=>{
 const info=endpoint(request),start=requestTimes.get(request)
 if(info&&start)api.push({...info,ms:Date.now()-start,error:request.failure()?.errorText})
})
page.on('response',async response=>{
 const request=response.request(),info=endpoint(request),start=requestTimes.get(request)
 if(!info||!start)return
 let count
 try{const j=await response.json();if(Array.isArray(j.streams))count=j.streams.length}catch{}
 api.push({...info,ms:Date.now()-start,status:response.status(),count})
})
const cases=requested.length?requested:process.argv.includes('--work')?[['work-hell','tmdb-tv-289517']]:process.argv.includes('--barbie')?[['barbie-brazuca','tmdb-movie-196254']]:process.argv.includes('--brazuca')?[['regular-brazuca','tmdb-tv-31132'],['simpsons-brazuca','tmdb-tv-456'],['house-brazuca','tmdb-tv-1408']]:[['regular','tmdb-tv-31132'],['simpsons','tmdb-tv-456'],['house','tmdb-tv-1408'],['black-clover','tmdb-tv-73223']]
const results={at:new Date().toISOString(),selection:(process.argv.includes('--brazuca')||process.argv.includes('--barbie'))?'manual Brazuca selection through source buttons':'normal automatic priority',cases:[],api}
const backup=await page.evaluate(()=>localStorage.getItem('nocta.library.v2'))
try{for(const [name,id,season='1',episode='1'] of cases){const offset=events.length,apiOffset=api.length;const row={name,id,season,episode};console.log(JSON.stringify({case:name,state:'started'}));await page.goto(`https://localhost/assistir/${id}${id.includes('-tv-')?`?temporada=${season}&episodio=${episode}`:''}`)
 if((process.argv.includes('--brazuca')||process.argv.includes('--barbie'))){
  await page.getByRole('button',{name:'Servidores',exact:true}).click({timeout:20000})
  const choice=page.locator('.source-choice-groups button[data-provider="brazuca"]').first()
  try{await choice.click({timeout:18000});row.selectedViaUI=true}catch{row.noBrazucaChoice=true}
 }
 const until=Date.now()+110000;while(!row.noBrazucaChoice&&Date.now()<until){await page.waitForTimeout(700)
  const version=page.getByRole('tab',{name:'Dublado',exact:true});if(await version.count()&&!row.selectedViaUI){await version.click();const choice=page.locator('.source-choice').first();if(await choice.count()){await choice.click();row.selectedViaUI=true}}
  const alternate=page.getByRole('button',{name:/^Tentar (legendado|dublado|idioma não informado)$/}).first()
  if(await alternate.count()){(row.alternateChoices??=[]).push(await alternate.innerText());await alternate.click()}
  const play=page.getByRole('button',{name:'Iniciar reprodução',exact:true});if(await play.count())await play.click()
  const list=events.slice(offset);const run=list.filter(e=>e.detail==='load-request'&&e.sessionId.startsWith('normal-')).at(-1)?.sessionId
  const proof=list.find(e=>e.sessionId===run&&e.event==='progress'&&!e.stale&&e.videoRendered&&e.audioAdvancing&&e.positionSeconds>1)
  if(proof){row.engine='native';row.rendererEvidence=true;row.sessionId=run;row.actualSourceId=proof.sourceId;row.inline=proof.inline;row.fullscreen=proof.fullscreen;break}
  const web=await page.locator('video').evaluateAll(els=>els.map(v=>({position:v.currentTime,width:v.videoWidth,paused:v.paused,frames:v.getVideoPlaybackQuality?.().totalVideoFrames,audioBytes:v.webkitAudioDecodedByteCount})))
  if(web.some(v=>v.position>1&&v.width>0&&!v.paused)){row.engine='web';row.web=web;break}
  if(await page.locator('.nocta-player-stage iframe').count()){row.iframeMounted=true;break}
  if(await page.getByRole('heading',{name:/^(Não conseguimos iniciar o vídeo|Não foi possível assistir agora)$/}).count()){row.failed=true;break}
 }
 await page.waitForTimeout(600);row.events=events.slice(offset);row.api=api.slice(apiOffset);row.outcomes=await page.locator('.provider-row').evaluateAll(els=>els.map(e=>({provider:e.dataset.provider,state:e.dataset.state})));row.stage=await page.locator('.nocta-player-stage').evaluateAll(els=>els.map(el=>({width:el.clientWidth,height:el.clientHeight,background:getComputedStyle(el).backgroundColor,backdrop:!!el.querySelector('.player-stage-backdrop')})));await fs.writeFile(`${directory}/live-${name}.png`,execFileSync(adb,['-d','exec-out','screencap','-p'],{maxBuffer:8*1024*1024}));results.cases.push(row)
 console.log(JSON.stringify({case:name,rendererEvidence:row.rendererEvidence,web:row.web,sourceId:row.actualSourceId,inline:row.inline,fullscreen:row.fullscreen,noBrazucaChoice:row.noBrazucaChoice,iframeMounted:row.iframeMounted,failed:row.failed,attempts:row.events.filter(e=>e.detail==='load-request').map(e=>e.sourceId),errors:row.events.filter(e=>e.event==='failed').map(e=>({sourceId:e.sourceId,detail:e.detail,category:e.category,code:e.errorCode,status:e.httpStatus,causes:e.causes})),api:row.api}))
 await fs.writeFile(`${directory}/live${(process.argv.includes('--brazuca')||process.argv.includes('--barbie'))?'-brazuca':''}.json`,JSON.stringify(results,null,2));await page.evaluate(()=>window.Capacitor.Plugins.NoctaNativePlayer.close()).catch(()=>{})
 }}finally{await page.goto('https://localhost/minha-lista').catch(()=>{});await page.evaluate(({backup,ids})=>{try{const now=JSON.parse(localStorage.getItem('nocta.library.v2')??'null'),old=JSON.parse(backup??'null');if(!now)return;for(const key of Object.keys(now.progress??{}))if(ids.some(id=>(key===id||key.startsWith(id+':'))))delete now.progress[key];for(const [key,value] of Object.entries(old?.progress??{}))if(ids.some(id=>(key===id||key.startsWith(id+':'))))now.progress[key]=value;localStorage.setItem('nocta.library.v2',JSON.stringify(now))}catch{}},{backup,ids:cases.map(([,id])=>id)}).catch(()=>{});log.kill();await fs.writeFile(`${directory}/live${(process.argv.includes('--brazuca')||process.argv.includes('--barbie'))?'-brazuca':''}.json`,JSON.stringify(results,null,2));await browser.close();execFileSync(adb,['-d','forward','--remove','tcp:9223'])}
