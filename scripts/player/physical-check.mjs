import {chromium} from '@playwright/test'
import {execFileSync,spawn} from 'node:child_process'
import fs from 'node:fs/promises'
const adb=process.env.NOCTA_ADB??'C:\\Users\\PC\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'
const pid=execFileSync(adb,['-d','shell','pidof','app.nocta.prototype'],{encoding:'utf8'}).trim()
if(!pid)throw Error('Abra o Nocta no Samsung antes de testar.')
execFileSync(adb,['-d','forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`])
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223')
const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://localhost'))
if(!page)throw Error('WebView debug do Nocta não encontrado.')
const directory='.cache/player-definitivo';await fs.mkdir(directory,{recursive:true})
const events=[];const api=[];let pending=''
const log=spawn(adb,['-d','logcat','--pid='+pid,'-T','1','-v','raw','NoctaMedia3:I','*:S'])
log.stdout.on('data',data=>{pending+=data;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines)try{const event=JSON.parse(line);if(event.sessionId)events.push(event)}catch{}})
page.on('response',async response=>{const url=new URL(response.url());if(!['fenixflix.fenixhub.online','zeus-br.shardweb.app','brazuca-play-stremio.vercel.app'].includes(url.hostname)||!url.pathname.includes('/stream/'))return;try{const data=await response.json();api.push({provider:url.hostname,resource:decodeURIComponent(url.pathname.slice(url.pathname.indexOf('/stream/'))),status:response.status(),count:Array.isArray(data.streams)?data.streams.length:null})}catch{}})
const results={at:new Date().toISOString(),cases:[],api,requests:[]}
page.on('request',request=>{const url=new URL(request.url());if(['fenixflix.fenixhub.online','zeus-br.shardweb.app','brazuca-play-stremio.vercel.app'].includes(url.hostname)&&/\/stream\/(movie|series)\/[^/]+\.json$/.test(url.pathname))results.requests.push({provider:url.hostname,resource:decodeURIComponent(url.pathname.slice(url.pathname.indexOf('/stream/')))})})
const historyBackup=await page.evaluate(()=>localStorage.getItem('nocta.library.v2'))
const cases=[['regular','tmdb-tv-31132'],['black-clover','tmdb-tv-73223']]
if(process.argv.includes('--fallbacks'))cases.push(['zeus-real','tmdb-tv-73223'],['brazuca-real','tmdb-tv-73223'])
async function screenshot(name){await fs.writeFile(`${directory}/${name}.png`,execFileSync(adb,['-d','exec-out','screencap','-p']))}
try{
 if(process.argv.includes('--controls'))for(const [name,file,mime] of [['mp4-control','sample.mp4','video/mp4'],['hls-control','master.m3u8','application/vnd.apple.mpegurl']]){
  const run='control-'+crypto.randomUUID();const offset=events.length
  await page.evaluate(({run,file,mime})=>window.Capacitor.Plugins.NoctaNativePlayer.load({sessionId:run,sourceId:'fixture',url:'asset:///native-fixtures/'+file,mimeType:mime,title:'Amostra autorizada'}),{run,file,mime})
  const until=Date.now()+15000;while(Date.now()<until){await page.waitForTimeout(300);if(events.slice(offset).some(e=>e.sessionId===run&&e.event==='progress'&&e.positionSeconds>1&&e.videoRendered&&e.audioAdvancing))break}
  await screenshot(name);const list=events.slice(offset).filter(e=>e.sessionId===run);results.cases.push({name,engine:'native',rendererEvidence:list.some(e=>e.event==='progress'&&e.videoRendered&&e.audioAdvancing&&e.positionSeconds>1),events:list});await page.evaluate(sessionId=>window.Capacitor.Plugins.NoctaNativePlayer.close({sessionId}),run)
 }
 for(const [name,id] of cases){
  await page.unrouteAll({behavior:'wait'})
  if(name==='zeus-real'||name==='brazuca-real')await page.route(/https:\/\/fenixflix\.fenixhub\.online\/.*\/stream\//,route=>route.fulfill({status:200,contentType:'application/json',body:'{"streams":[]}'}))
  if(name==='zeus-real')await page.route(/https:\/\/brazuca-play-stremio\.vercel\.app\/stream\//,route=>route.fulfill({status:200,contentType:'application/json',body:'{"streams":[]}'}))
  const offset=events.length;const row={name,id};await page.goto(`https://localhost/assistir/${id}?temporada=1&episodio=1`);const until=Date.now()+125000
  let observedRun
  if(name==='zeus-real'){
   await page.getByRole('button',{name:'Servidores',exact:true}).click({timeout:20000})
   const choice=page.locator('.source-choice-groups>section').filter({has:page.getByRole('heading',{name:/^Legendado/})}).getByRole('button').filter({hasText:'Zeus BR'}).first()
   try{await choice.click({timeout:18000});row.manuallySelectedProvider='zeus'}catch{row.requestedProviderUnavailable=true}
  }
  while(!row.requestedProviderUnavailable&&Date.now()<until){
   await page.waitForTimeout(700)
   const version=page.getByRole('button',{name:name==='zeus-real'?'Legendado':'Dublado',exact:true});if(await version.count())await version.click()
   const list=events.slice(offset);const run=list.filter(e=>e.detail==='load-request'&&e.sessionId.startsWith('normal-')).at(-1)?.sessionId
   const confirmed=list.find(e=>e.sessionId===run&&e.event==='progress'&&!e.stale&&e.videoRendered&&e.audioAdvancing&&e.positionSeconds>1)
   if(confirmed){row.engine='native';row.rendererEvidence=true;row.run=run;row.actualSourceId=confirmed.sourceId;row.inline=confirmed.inline;row.fullscreen=confirmed.fullscreen;observedRun=run;break}
   const web=await page.locator('video').evaluateAll(elements=>elements.map(v=>({position:v.currentTime,width:v.videoWidth,height:v.videoHeight,paused:v.paused,error:v.error?.code,duration:Number.isFinite(v.duration)?v.duration:0})))
   if(web.some(v=>v.position>1&&v.width>0&&!v.paused)){row.engine='web';row.videoEvidence=web;break}
   if(await page.getByRole('button',{name:'Abrir player alternativo',exact:true}).count()){row.embedOffered=true;break}
   if(await page.getByRole('heading',{name:'Não conseguimos iniciar o vídeo',exact:true}).count()){row.failed=true;break}
  }
  await page.waitForTimeout(1500);await screenshot(`normal-${name}`)
  if(process.argv.includes('--next')&&name==='regular'&&observedRun){
   const duration=events.slice(offset).filter(e=>e.sessionId===observedRun&&e.durationSeconds>0).at(-1)?.durationSeconds
   if(duration>35){
    await page.evaluate(seconds=>window.Capacitor.Plugins.NoctaNativePlayer.seek({seconds}),duration-34)
    const promptUntil=Date.now()+35000;while(Date.now()<promptUntil){await page.waitForTimeout(500);if(events.slice(offset).some(e=>e.sessionId===observedRun&&e.nextVisible))break}
    row.nextPrompt=events.slice(offset).some(e=>e.sessionId===observedRun&&e.nextVisible);await screenshot('next-35-seconds')
    await page.evaluate(seconds=>window.Capacitor.Plugins.NoctaNativePlayer.seek({seconds}),duration-1)
    const endUntil=Date.now()+45000;while(Date.now()<endUntil){await page.waitForTimeout(500);if(new URL(page.url()).searchParams.get('episodio')==='2')break}
    row.actualEnded=events.slice(offset).some(e=>e.sessionId===observedRun&&e.event==='ended');row.nextEpisode=new URL(page.url()).searchParams.get('episodio')==='2'
    if(row.nextEpisode){const nextUntil=Date.now()+65000;while(Date.now()<nextUntil){await page.waitForTimeout(700);if(events.slice(offset).some(e=>e.sessionId!==observedRun&&e.sessionId.startsWith('normal-')&&e.event==='progress'&&e.positionSeconds>1&&e.videoRendered&&e.audioAdvancing)){row.nextRendererEvidence=true;break}if(await page.getByRole('button',{name:'Abrir player alternativo',exact:true}).count())break}}
   }
  }
  row.events=events.slice(offset)
  row.url=new URL(page.url()).pathname+new URL(page.url()).search
  if(row.engine==='native')await page.evaluate(()=>window.Capacitor.Plugins.NoctaNativePlayer.close())
  results.cases.push(row);console.log(JSON.stringify({nextPrompt:row.nextPrompt,actualEnded:row.actualEnded,nextEpisode:row.nextEpisode,name,engine:row.engine,rendererEvidence:row.rendererEvidence,web:row.videoEvidence,failed:row.failed,embedOffered:row.embedOffered,events:row.events.length}));await fs.writeFile(`${directory}/physical.json`,JSON.stringify(results,null,2))
 }
}finally{
 await page.unrouteAll({behavior:'wait'}).catch(()=>{})
 await page.evaluate(backup=>{try{const current=JSON.parse(localStorage.getItem('nocta.library.v2')??'null');if(!current)return;const old=JSON.parse(backup??'null');for(const key of Object.keys(current.progress??{}))if(key.startsWith('tmdb-tv-31132:')||key.startsWith('tmdb-tv-73223:'))delete current.progress[key];for(const [key,value] of Object.entries(old?.progress??{}))if(key.startsWith('tmdb-tv-31132:')||key.startsWith('tmdb-tv-73223:'))current.progress[key]=value;localStorage.setItem('nocta.library.v2',JSON.stringify(current))}catch{}},historyBackup).catch(()=>{})
 await page.evaluate(()=>window.Capacitor.Plugins.NoctaNativePlayer.close()).catch(()=>{})
 await page.goto('https://localhost/minha-lista').catch(()=>{})
 log.kill();await fs.writeFile(`${directory}/physical.json`,JSON.stringify(results,null,2));await browser.close();execFileSync(adb,['-d','forward','--remove','tcp:9223'])}
