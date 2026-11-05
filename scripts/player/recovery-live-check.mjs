// Real provider responses in the ordinary Watch route; no media URLs are persisted.
// --brazuca explicitly selects Brazuca in the existing source menu. It does not alter provider replies.
import {chromium} from '@playwright/test'
import {execFileSync,spawn} from 'node:child_process'
import fs from 'node:fs/promises'
const adb=process.env.NOCTA_ADB??'C:\\Users\\PC\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'
const directory='.cache/player-recuperacao';await fs.mkdir(directory,{recursive:true})
const pid=execFileSync(adb,['-d','shell','pidof','app.nocta.prototype'],{encoding:'utf8'}).trim();if(!pid)throw Error('Abra o Nocta no Samsung.')
execFileSync(adb,['-d','forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`])
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://localhost'));if(!page)throw Error('WebView ausente')
const events=[],api=[];let pending=''
const log=spawn(adb,['-d','logcat','--pid='+pid,'-T','1','-v','raw','NoctaMedia3:I','*:S']);log.stdout.on('data',data=>{pending+=data;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines)try{const e=JSON.parse(line);if(e.sessionId)events.push(e)}catch{}})
page.on('response',async response=>{const url=new URL(response.url());if(!['fenixflix.fenixhub.online','brazuca-play-stremio.vercel.app','zeus-br.shardweb.app'].includes(url.hostname)||!url.pathname.includes('/stream/'))return;try{const j=await response.json();api.push({provider:url.hostname,resource:decodeURIComponent(url.pathname.slice(url.pathname.indexOf('/stream/'))),status:response.status(),count:Array.isArray(j.streams)?j.streams.length:null})}catch{}})
const cases=process.argv.includes('--brazuca')?[['regular-brazuca','tmdb-tv-31132'],['simpsons-brazuca','tmdb-tv-456'],['house-brazuca','tmdb-tv-1408']]:[['regular','tmdb-tv-31132'],['simpsons','tmdb-tv-456'],['house','tmdb-tv-1408'],['black-clover','tmdb-tv-73223']]
const results={at:new Date().toISOString(),selection:process.argv.includes('--brazuca')?'manual Brazuca selection through source buttons':'normal automatic priority',cases:[],api}
const backup=await page.evaluate(()=>localStorage.getItem('nocta.library.v2'))
try{for(const [name,id] of cases){const offset=events.length,apiOffset=api.length;const row={name,id};console.log(JSON.stringify({case:name,state:'started'}));await page.goto(`https://localhost/assistir/${id}?temporada=1&episodio=1`)
 if(process.argv.includes('--brazuca')){
  await page.getByRole('button',{name:'Servidores',exact:true}).click({timeout:20000})
  const choice=page.locator('.source-choice-groups>section').filter({has:page.getByRole('heading',{name:/^Dublado/})}).getByRole('button').filter({hasText:'Brazuca Play'}).first()
  try{await choice.click({timeout:18000});row.selectedViaUI=true}catch{row.noBrazucaChoice=true}
 }
 const until=Date.now()+110000;while(!row.noBrazucaChoice&&Date.now()<until){await page.waitForTimeout(700)
  const version=page.getByRole('button',{name:'Dublado',exact:true});if(await version.count())await version.click()
  const play=page.getByRole('button',{name:'Iniciar reprodução',exact:true});if(await play.count())await play.click()
  const list=events.slice(offset);const run=list.filter(e=>e.detail==='load-request'&&e.sessionId.startsWith('normal-')).at(-1)?.sessionId
  const proof=list.find(e=>e.sessionId===run&&e.event==='progress'&&!e.stale&&e.videoRendered&&e.audioAdvancing&&e.positionSeconds>1)
  if(proof){row.engine='native';row.rendererEvidence=true;row.sessionId=run;row.actualSourceId=proof.sourceId;row.inline=proof.inline;row.fullscreen=proof.fullscreen;break}
  const web=await page.locator('video').evaluateAll(els=>els.map(v=>({position:v.currentTime,width:v.videoWidth,paused:v.paused,frames:v.getVideoPlaybackQuality?.().totalVideoFrames,audioBytes:v.webkitAudioDecodedByteCount})))
  if(web.some(v=>v.position>1&&v.width>0&&!v.paused)){row.engine='web';row.web=web;break}
  if(await page.getByRole('button',{name:'Abrir player alternativo',exact:true}).count()){row.embedOffered=true;break}
  if(await page.getByRole('heading',{name:'Não conseguimos iniciar o vídeo',exact:true}).count()){row.failed=true;break}
 }
 await page.waitForTimeout(600);row.events=events.slice(offset);row.api=api.slice(apiOffset);row.outcomes=await page.locator('.provider-row').evaluateAll(els=>els.map(e=>({provider:e.dataset.provider,state:e.dataset.state})));await fs.writeFile(`${directory}/live-${name}.png`,execFileSync(adb,['-d','exec-out','screencap','-p']));results.cases.push(row)
 console.log(JSON.stringify({case:name,rendererEvidence:row.rendererEvidence,web:row.web,sourceId:row.actualSourceId,inline:row.inline,fullscreen:row.fullscreen,noBrazucaChoice:row.noBrazucaChoice,embedOffered:row.embedOffered,failed:row.failed,errors:row.events.filter(e=>e.event==='failed').map(e=>({sourceId:e.sourceId,detail:e.detail,category:e.category,code:e.errorCode,status:e.httpStatus,causes:e.causes})),api:row.api}))
 await fs.writeFile(`${directory}/live${process.argv.includes('--brazuca')?'-brazuca':''}.json`,JSON.stringify(results,null,2));await page.evaluate(()=>window.Capacitor.Plugins.NoctaNativePlayer.close()).catch(()=>{})
 }}finally{await page.goto('https://localhost/minha-lista').catch(()=>{});await page.evaluate(({backup,ids})=>{try{const now=JSON.parse(localStorage.getItem('nocta.library.v2')??'null'),old=JSON.parse(backup??'null');if(!now)return;for(const key of Object.keys(now.progress??{}))if(ids.some(id=>key.startsWith(id+':')))delete now.progress[key];for(const [key,value] of Object.entries(old?.progress??{}))if(ids.some(id=>key.startsWith(id+':')))now.progress[key]=value;localStorage.setItem('nocta.library.v2',JSON.stringify(now))}catch{}},{backup,ids:cases.map(([,id])=>id)}).catch(()=>{});log.kill();await fs.writeFile(`${directory}/live${process.argv.includes('--brazuca')?'-brazuca':''}.json`,JSON.stringify(results,null,2));await browser.close();execFileSync(adb,['-d','forward','--remove','tcp:9223'])}
