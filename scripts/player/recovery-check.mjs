import {chromium} from '@playwright/test'
import {execFileSync,spawn} from 'node:child_process'
import fs from 'node:fs/promises'
const adb=process.env.NOCTA_ADB??'C:\\Users\\PC\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'
const directory=process.env.NOCTA_CHECK_DIRECTORY??'.cache/player-recuperacao';await fs.mkdir(directory,{recursive:true})
const pid=execFileSync(adb,['-d','shell','pidof','app.nocta.prototype'],{encoding:'utf8'}).trim();if(!pid)throw Error('Abra o Nocta no Samsung.')
execFileSync(adb,['-d','forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`])
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://localhost'));if(!page)throw Error('Nocta WebView ausente')
let streamCalls=0;page.on('request',request=>{if(new URL(request.url()).pathname.includes('/stream/'))streamCalls++});const events=[];let pending='';const log=spawn(adb,['-d','logcat','--pid='+pid,'-T','1','-v','raw','NoctaMedia3:I','*:S']);log.stdout.on('data',data=>{pending+=data;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines)try{const event=JSON.parse(line);if(event.sessionId)events.push(event)}catch{}})
const results={at:new Date().toISOString(),scope:'Controlled CC0 clips through NORMAL Watch, provider replies mocked; native media replaced at our own debug bridge only. Not verification of external Fenix media.',cases:[]}
const attemptPath=`${directory}/controlled-${results.at.replace(/[:.]/g,'-')}.json`
async function persist(){const content=JSON.stringify(results,null,2);await fs.writeFile(attemptPath,content);if(results.cases.length===3&&results.cases.every(row=>row.rendererEvidence))await fs.writeFile(`${directory}/controlled.json`,content)}
const fixture=await fs.readFile('android/app/src/debug/assets/native-fixtures/sample.mp4')
const shell=(...args)=>execFileSync(adb,['-d','shell',...args],{encoding:'utf8',timeout:12000}).trim()
const screenshot=async name=>{
 const png=execFileSync(adb,['-d','exec-out','screencap','-p'],{maxBuffer:8*1024*1024})
 await fs.writeFile(`${directory}/${name}.png`,png)
 return {width:png.readUInt32BE(16),height:png.readUInt32BE(20)}
}
const tap=(x,y)=>shell('input','tap',String(Math.round(x)),String(Math.round(y)))
async function untilEvent(session,predicate,offset){
 const deadline=Date.now()+10000
 while(Date.now()<deadline){
  const event=events.slice(offset).find(event=>event.sessionId===session&&predicate(event))
  if(event)return event
  await page.waitForTimeout(150)
 }
 throw Error('Evento esperado do modo imersivo não foi observado.')
}
async function immersiveCheck(row){
 const rotation=shell('cmd','window','user-rotation').match(/lock\s+([0-3])/)
 const rotate=value=>shell('cmd','window','user-rotation','lock',value)
 const both=(event,visible)=>event.statusBarVisible===visible&&event.navigationBarVisible===visible
 const session=row.nativeSession
 const density=Number(shell('wm','density').match(/\d+/g).at(-1))/160
 const enter=(inline)=>{
  const [,left,top,right,bottom]=inline.surfaceBounds.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/).map(Number)
  tap((left+right+inline.rootWidth)/2-26*density,(top+bottom+inline.rootHeight)/2-29*density)
 }
 const evidence=(event,screen)=>({width:event.rootWidth,height:event.rootHeight,framing:event.framing,surface:event.surfaceBounds,statusBar:event.statusBarVisible,navigationBar:event.navigationBarVisible,screen})
 const result={}
 try {
  rotate('0')
  await page.evaluate(()=>window.Capacitor.Plugins.NoctaNativePlayer.pause())
  const inline=await untilEvent(session,e=>e.rootHeight>0&&both(e,true)&&!!e.surfaceBounds,events.length)
  await screenshot('immersive-before')
  let offset=events.length
  enter(inline)
  let event=await untilEvent(session,e=>e.fullscreen&&e.framing==='fit'&&e.rootHeight>e.rootWidth&&both(e,false),offset)
  result.portraitFit=evidence(event,await screenshot('immersive-portrait-fit'))
  const initialPosition=event.positionSeconds
  await page.evaluate(()=>window.Capacitor.Plugins.NoctaNativePlayer.play())
  offset=events.length
  rotate('1')
  event=await untilEvent(session,e=>e.fullscreen&&e.rootWidth>e.rootHeight&&e.framing==='zoom'&&both(e,false),offset)
  await page.waitForTimeout(1200)
  result.landscapeZoom=evidence(event,await screenshot('immersive-landscape-zoom'))
  offset=events.length
  rotate('0')
  event=await untilEvent(session,e=>e.fullscreen&&e.rootHeight>e.rootWidth&&e.framing==='fit'&&both(e,false)
   &&e.event==='progress'&&e.positionSeconds>initialPosition,offset)
  await page.waitForTimeout(1200)
  result.rotatedBack=evidence(event,await screenshot('immersive-portrait-return'))
  result.progressAfterRotation=event.positionSeconds
  offset=events.length
  shell('input','keyevent','4')
  event=await untilEvent(session,e=>!e.fullscreen&&e.framing==='fit'&&both(e,true),offset)
  result.exit=evidence(event,await screenshot('immersive-exit'))
  result.backKeepsRoute=page.url().includes('/assistir/')
  result.singleLoad=events.filter(e=>e.sessionId===session&&e.detail==='load-request').length===1
 } finally {
  if(rotation)shell('cmd','window','user-rotation','lock',rotation[1])
  else shell('cmd','window','user-rotation','free')
 }
 return result
}
async function routes(mode){await page.unrouteAll({behavior:'wait'});await page.route('https://api.themoviedb.org/3/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({id:900000001,title:'Amostra CC0 autorizada',overview:'Teste controlado do fluxo normal Nocta.',release_date:'2026-01-01',vote_average:0,genres:[],credits:{cast:[],crew:[]},recommendations:{results:[]},external_ids:{imdb_id:'tt0000001'}})}));for(const host of ['fenixflix.fenixhub.online','zeus-br.shardweb.app','brazuca-play-stremio.vercel.app'])await page.route(`https://${host}/**`,route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/manifest.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify({id:'nocta.control',name:'Teste controlado',version:'1',types:['movie','series'],resources:['stream'],catalogs:[]})});if(url.pathname.includes('/stream/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({streams:host==='fenixflix.fenixhub.online'?[{name:'CC0 Dublado',description:'Dublado · arquivo de teste, sem fala',url:mode==='web'?'https://fenixflix.fenixhub.online/nocta-controlled.mp4':`https://cdn-sv01.maximaimg.online/nocta-controlled.${mode==='hls'?'m3u8':'mp4'}`}]:[]})});if(url.pathname==='/nocta-controlled.mp4')return route.fulfill({status:200,contentType:'video/mp4',headers:{'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes'},body:fixture});return route.abort()})}
const modes=process.argv.includes('--immersive')?['mp4','hls','web']:['web','mp4','hls']
try{for(const mode of modes){await routes(mode);await page.goto('https://localhost/minha-lista');const offset=events.length;const row={mode,controlled:true};if(mode!=='web')await page.evaluate(({mode,hold})=>{const cap=window.Capacitor;const original=cap.nativePromise;cap.nativePromise=function(plugin,method,options){const load=plugin==='NoctaNativePlayer'&&method==='load';if(load)options={...options,url:mode==='hls'?'asset:///native-fixtures/master.m3u8':'asset:///native-fixtures/sample.mp4',mimeType:mode==='hls'?'application/vnd.apple.mpegurl':'video/mp4',headers:{},startPositionSeconds:0};const result=original.call(cap,plugin,method,options);if(load&&hold)return result.then(async value=>{await original.call(cap,plugin,'pause',{});window.__noctaHolding=true;setTimeout(()=>{void original.call(cap,plugin,'play',{});window.__noctaHolding=false},6500);return value});return result}},{mode,hold:mode==='mp4'&&process.argv.includes('--interactions')})
 await page.evaluate(()=>{history.pushState({usr:null,key:crypto.randomUUID(),idx:(history.state?.idx??0)+1},'','/assistir/tmdb-movie-900000001');dispatchEvent(new PopStateEvent('popstate'));window.scrollTo({top:0,behavior:'instant'})})
 const until=Date.now()+45000;while(Date.now()<until){await page.waitForTimeout(400);if(mode==='mp4'&&process.argv.includes('--interactions')&&!row.controlledStartupHold&&await page.evaluate(()=>window.__noctaHolding===true)){row.controlledStartupHold=true;await page.waitForTimeout(5300);row.slowWarning=await page.getByText('A conexão está lenta. Aguarde mais alguns segundos...', {exact:true}).isVisible();await fs.writeFile(`${directory}/controlled-loading.png`,execFileSync(adb,['-d','exec-out','screencap','-p'],{maxBuffer:8*1024*1024}))}const play=page.getByRole('button',{name:'Iniciar reprodução',exact:true});if(await play.count()){row.userGestureNeeded=true;await play.click()};if(mode==='web'){const v=await page.locator('video').evaluateAll(els=>els.map(v=>({position:v.currentTime,width:v.videoWidth,paused:v.paused,frames:v.getVideoPlaybackQuality?.().totalVideoFrames,audioBytes:v.webkitAudioDecodedByteCount,error:v.error?.code})));if(v.some(v=>v.position>1&&v.width>0&&!v.paused)){row.web=v;row.rendererEvidence=true;break}}else{const current=events.slice(offset).filter(e=>e.detail==='load-request'&&e.sessionId.startsWith('normal-')).at(-1)?.sessionId;if(current&&events.slice(offset).some(e=>e.sessionId===current&&e.event==='progress'&&e.videoRendered&&e.audioAdvancing&&e.positionSeconds>1)){row.rendererEvidence=true;row.nativeSession=current;break}}
 if(await page.locator('.nocta-player-stage iframe').count()){row.failedToEmbed=true;break}}
 if(mode==='mp4'&&row.rendererEvidence&&process.argv.includes('--immersive')){
  row.immersive=await immersiveCheck(row)
  console.log(JSON.stringify({immersive:row.immersive}))
 }
 if(mode==='mp4'&&row.rendererEvidence&&process.argv.includes('--scroll')){
  const before=await page.locator('.native-playback-host').boundingBox();const initial=events.slice(offset).filter(e=>e.sessionId===row.nativeSession&&e.surfaceBounds).at(-1)?.surfaceBounds;await page.evaluate(()=>scrollBy({top:80,behavior:'instant'}));await page.waitForTimeout(700);const after=await page.locator('.native-playback-host').boundingBox();row.scrollStableSize=!!before&&!!after&&Math.abs(before.width-after.width)<1&&Math.abs(before.height-after.height)<1;row.scrollSingleLoad=events.slice(offset).filter(e=>e.detail==='load-request').length===1;row.scrollSurface={before:initial,after:events.slice(offset).filter(e=>e.sessionId===row.nativeSession&&e.surfaceBounds).at(-1)?.surfaceBounds};await fs.writeFile(`${directory}/controlled-scroll.png`,execFileSync(adb,['-d','exec-out','screencap','-p'],{maxBuffer:8*1024*1024}));await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(500)
 }
 if(mode!=='web'&&row.rendererEvidence&&process.argv.includes('--menu')){
  await fs.writeFile(`${directory}/controlled-${mode}-frame.png`,execFileSync(adb,['-d','exec-out','screencap','-p'],{maxBuffer:8*1024*1024}));
  row.nativeLayout=await page.locator('.native-playback-host').evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,viewportHeight:innerHeight}});row.videoSurface=events.slice(offset).filter(e=>e.sessionId===row.nativeSession&&e.surfaceBounds).at(-1)?.surfaceBounds;await page.evaluate(()=>window.Capacitor.Plugins.NoctaNativePlayer.pause());await page.waitForTimeout(400);const beforeCalls=streamCalls
  const description=mode==='mp4'?'Trocar servidor':'Voltar à lista de fontes';execFileSync(adb,['-d','shell','uiautomator','dump','/sdcard/nocta-window.xml']);const xml=execFileSync(adb,['-d','exec-out','cat','/sdcard/nocta-window.xml'],{encoding:'utf8'});const node=xml.split('<node').find(n=>n.includes(`content-desc="${description}"`));const hit=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if(hit){execFileSync(adb,['-d','shell','input','tap',String(Math.round((+hit[1]+ +hit[3])/2)),String(Math.round((+hit[2]+ +hit[4])/2))]);const menu=page.getByRole('region',{name:'Área de reprodução'}).getByRole('heading',{name:'Idiomas e servidores'});try{await menu.waitFor({timeout:5000});row.nativeMenuOpened=true;row.singleLanguage=await page.getByRole('tab').count()===1;row.menuReusedQueries=streamCalls===beforeCalls;row.closedForMenu=events.slice(offset).some(e=>e.sessionId===row.nativeSession&&e.detail==='user-sources')}catch{row.nativeMenuOpened=false}}
 }
 if(mode==='mp4'&&row.rendererEvidence&&process.argv.includes('--interactions')){
  await page.evaluate(()=>window.Capacitor.Plugins.NoctaNativePlayer.seek({seconds:0}));await page.waitForTimeout(3400);await fs.writeFile(`${directory}/controlled-controls-hidden.png`,execFileSync(adb,['-d','exec-out','screencap','-p'],{maxBuffer:8*1024*1024}))
  const before=await page.locator('.native-playback-host').boundingBox();const beforeSurface=events.slice(offset).filter(e=>e.sessionId===row.nativeSession&&e.surfaceBounds).at(-1)?.surfaceBounds;await page.evaluate(()=>scrollBy(0,80));await page.waitForTimeout(700);const after=await page.locator('.native-playback-host').boundingBox();const afterSurface=events.slice(offset).filter(e=>e.sessionId===row.nativeSession&&e.surfaceBounds).at(-1)?.surfaceBounds;row.scrollStableSize=!!before&&!!after&&Math.abs(before.width-after.width)<1&&Math.abs(before.height-after.height)<1;row.scrollSingleLoad=events.slice(offset).filter(e=>e.detail==='load-request').length===1;row.scrollSurface={before:beforeSurface,after:afterSurface};await fs.writeFile(`${directory}/controlled-scroll.png`,execFileSync(adb,['-d','exec-out','screencap','-p'],{maxBuffer:8*1024*1024}));await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(400)
  const rect=await page.locator('.native-playback-host').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth}});const phoneWidth=Number(execFileSync(adb,['-d','shell','wm','size'],{encoding:'utf8'}).match(/(\d+)x\d+/)[1]);const scale=phoneWidth/rect.vw
  const tap=(x,y)=>execFileSync(adb,['-d','shell','input','tap',String(Math.round(x)),String(Math.round(y))]);const surface=events.slice(offset).filter(e=>e.sessionId===row.nativeSession&&e.surfaceBounds).at(-1)?.surfaceBounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);if(surface)tap((Number(surface[1])+Number(surface[3]))/2,(Number(surface[2])+Number(surface[4]))/2);else tap((rect.x+rect.w/2)*scale,(rect.y+rect.h/2)*scale)
  execFileSync(adb,['-d','shell','uiautomator','dump','/sdcard/nocta-window.xml']);const xml=execFileSync(adb,['-d','exec-out','cat','/sdcard/nocta-window.xml'],{encoding:'utf8'});const node=xml.match(/<node[^>]*resource-id="[^"]*:id\/exo_fullscreen"[^>]*>/)?.[0];const bounds=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
  if(bounds){tap((Number(bounds[1])+Number(bounds[3]))/2,(Number(bounds[2])+Number(bounds[4]))/2);await page.waitForTimeout(1000);row.explicitFullscreen=events.slice(offset).some(e=>e.sessionId===row.nativeSession&&e.detail==='fullscreen-enter');await fs.writeFile(`${directory}/controlled-fullscreen.png`,execFileSync(adb,['-d','exec-out','screencap','-p'],{maxBuffer:8*1024*1024}));if(row.explicitFullscreen)execFileSync(adb,['-d','shell','input','keyevent','4']);await page.waitForTimeout(800);row.backExitsFullscreen=events.slice(offset).some(e=>e.sessionId===row.nativeSession&&e.detail==='fullscreen-exit');row.backKeepsRoute=page.url().includes('/assistir/')}
  await page.getByRole('button',{name:'Servidores',exact:true}).click();row.serverMenu=await page.getByRole('heading',{name:'Idiomas e servidores'}).isVisible();await page.waitForTimeout(500);row.closedForMenu=events.slice(offset).some(e=>e.sessionId===row.nativeSession&&e.event==='closed')
 }
 row.events=events.slice(offset);await fs.writeFile(`${directory}/controlled-${mode}.png`,execFileSync(adb,['-d','exec-out','screencap','-p'],{maxBuffer:8*1024*1024}));results.cases.push(row);console.log(JSON.stringify({mode,rendererEvidence:row.rendererEvidence,web:row.web,scrollStableSize:row.scrollStableSize,scrollSingleLoad:row.scrollSingleLoad,nativeLayout:row.nativeLayout,videoSurface:row.videoSurface,nativeMenuOpened:row.nativeMenuOpened,menuReusedQueries:row.menuReusedQueries,slowWarning:row.slowWarning,explicitFullscreen:row.explicitFullscreen,backExitsFullscreen:row.backExitsFullscreen,backKeepsRoute:row.backKeepsRoute,serverMenu:row.serverMenu,closedForMenu:row.closedForMenu,failedToEmbed:row.failedToEmbed,events:row.events.length}));await persist();await page.evaluate(()=>window.Capacitor.Plugins.NoctaNativePlayer.close()).catch(()=>{})
 }
 if(process.argv.includes('--fallback-off')){
  await routes('web')
  await page.route(/\/stream\/(movie|series)\//,route=>route.fulfill({json:{streams:[]}}))
  await page.goto('https://localhost/assistir/tmdb-movie-900000001')
  const stage=page.getByRole('region',{name:'Área de reprodução'})
  const exhausted=stage.getByRole('heading',{name:'Não foi possível assistir agora'})
  await exhausted.waitFor({timeout:12_000})
  const before=streamCalls
  await Promise.all([
   page.waitForResponse(response=>response.url().includes('/stream/movie/')),
   stage.getByRole('button',{name:'Tentar novamente',exact:true}).click()
  ])
  await exhausted.waitFor({timeout:12_000})
  results.fallbackOff={retried:streamCalls>before,iframeCount:await stage.locator('iframe').count(),busy:await stage.getAttribute('aria-busy'),serverPicker:await stage.getByRole('button',{name:'Escolher servidor'}).count()}
  if(!results.fallbackOff.retried||results.fallbackOff.iframeCount||results.fallbackOff.busy!=='false'||results.fallbackOff.serverPicker)throw Error('Estado final de fontes vazias incorreto')
  await screenshot('fallback-off')
  console.log(JSON.stringify({fallbackOff:results.fallbackOff}))
 }
 }finally{await page.unrouteAll({behavior:'wait'}).catch(()=>{});await page.goto('https://localhost/minha-lista').catch(()=>{});await page.evaluate(()=>{try{const key='nocta.library.v2';const state=JSON.parse(localStorage.getItem(key)??'null');if(state){delete state.progress['tmdb-movie-900000001'];localStorage.setItem(key,JSON.stringify(state))}}catch{}}).catch(()=>{});log.kill();await persist();await browser.close().catch(()=>{});try{execFileSync(adb,['-d','forward','--remove','tcp:9223'],{stdio:'ignore'})}catch{}}
