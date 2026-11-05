import {chromium} from '@playwright/test'
import {execFileSync,spawn} from 'node:child_process'
import fs from 'node:fs/promises'
const adb='C:\\Users\\PC\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(2,i<0?undefined:i),i<0?'true':arg.slice(i+1)]}))
const manual=args.manual==='true'
if(args.open&&!manual)throw Error('--open is for manual capture only; an exact repeat must not requery sources')
if(!manual&&(!args['source-id']||!args.fingerprint))throw Error('Use --manual for passive recording, or --source-id=<exact row ID> --fingerprint=<24 hex chars> for a repeat. No first-source selection is performed.')
const duration=Number(args.seconds??(manual?240:65));if(!Number.isFinite(duration)||duration<1||duration>600)throw Error('seconds must be 1..600')
const started=new Date();const outDir='.cache/malfoy-diagnostic';await fs.mkdir(outDir,{recursive:true})
const output=args.output??`${outDir}/${manual?'manual':'repeat'}-${started.toISOString().replace(/[:.]/g,'-')}.json`
const pid=execFileSync(adb,['-d','shell','pidof','app.nocta.prototype'],{encoding:'utf8'}).trim()
if(!pid)throw Error('Open Nocta on the connected phone first')
const events=[];let pending='';let done=false
const processLog=spawn(adb,['-d','logcat','--pid='+pid,'-T','1','-v','raw','NoctaMedia3:I','*:S'],{stdio:['ignore','pipe','pipe']})
processLog.stdout.on('data',data=>{
 pending+=data.toString();const lines=pending.split(/\r?\n/);pending=lines.pop()
 for(const line of lines){try{const event=JSON.parse(line);if(!event.sessionId||!event.event)continue;events.push({capturedAt:new Date().toISOString(),...event});if(event.event==='failed'||event.detail==='load-request'||event.event==='video'||event.event==='audio')console.log(JSON.stringify(event));}catch{}}
})
let writing=Promise.resolve()
const save=()=>{const data=JSON.stringify({mode:manual?'human-touch':'explicit-same-source-repeat',started:started.toISOString(),finished:new Date().toISOString(),pid,expectedSource:args['source-id'],expectedFingerprint:args.fingerprint,events},null,2);writing=writing.then(async()=>{await fs.writeFile(output+'.tmp',data);await fs.rename(output+'.tmp',output)});return writing}
const flush=setInterval(()=>{void save()},2000)
process.on('SIGINT',()=>{done=true})
let browser;let forward=false;let expectedSession
console.log(`CAPTURA ATIVA (${manual?'somente observação; nenhum toque automatizado':'repetição da fonte explicitamente selecionada'}) por ${duration}s. Arquivo: ${output}`)
try{
 if(!manual||args.open){
  execFileSync(adb,['-d','forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`]);forward=true
  browser=await chromium.connectOverCDP('http://127.0.0.1:9223')
  const page=browser.contexts()[0].pages().find(page=>page.url().startsWith('https://localhost'))
  if(!page)throw Error('No Nocta WebView')
  if(manual){
   if(!/^tt\d+$/.test(args.imdb??''))throw Error('--open requires --imdb=tt...')
   const season=Number(args.season??1),episode=Number(args.episode??1)
   if(!Number.isInteger(season)||season<1||!Number.isInteger(episode)||episode<1)throw Error('Invalid season/episode')
   await page.goto('https://localhost/configuracoes');await page.getByRole('checkbox').check()
   await page.getByLabel('Serviço',{exact:true}).selectOption('fenixflix-diagnostics')
   await page.getByLabel('Tipo experimental').selectOption('series')
   await page.getByLabel('Identificador experimental').fill(args.imdb)
   await page.getByLabel('Temporada experimental').fill(String(season));await page.getByLabel('Episódio experimental').fill(String(episode))
   await page.getByRole('button',{name:'Consultar fontes',exact:true}).click()
   await page.getByRole('status').filter({hasText:/FenixFlix: \d+ fontes/}).waitFor({timeout:45000})
   const other=page.getByText('Outras fontes',{exact:true});if(await other.count())await other.click()
   if(args['source-id'])await page.locator(`li[data-source-id=${JSON.stringify(args['source-id'])}]`).scrollIntoViewIfNeeded()
   console.log('Consulta preparada. Nenhuma fonte foi iniciada; toque no aparelho.')
  }else{
  // Attribute lookup, never first provider match, query or navigation.
  const exact=page.locator(`li[data-source-id=${JSON.stringify(args['source-id'])}]`)
  if(await exact.count()!==1)throw Error('The exact selected row is absent. Do not requery: manually select a new source and capture it first.')
  if(!(await exact.innerText()).includes(args.fingerprint))throw Error('Fingerprint mismatch: this is not the captured source/configuration')
  const priorSession=(await exact.innerText()).match(/tentativa ([a-f0-9-]{36})/)?.[1]
  await exact.getByRole('button',{name:/^(Testar|Tentar novamente) no Media3$/}).click()
  await page.waitForFunction(({sourceId,prior})=>{
   const row=[...document.querySelectorAll('li[data-source-id]')].find(row=>row.getAttribute('data-source-id')===sourceId)
   const session=row?.textContent?.match(/tentativa ([a-f0-9-]{36})/)?.[1]
   return !!session&&session!==prior
  },{sourceId:args['source-id'],prior:priorSession})
  expectedSession=(await exact.innerText()).match(/tentativa ([a-f0-9-]{36})/)?.[1]
  }
 }
 const until=Date.now()+duration*1000
 while(!done&&Date.now()<until){await new Promise(resolve=>setTimeout(resolve,500));if(!manual&&events.some(event=>event.sessionId===expectedSession&&!event.stale&&event.sourceId===args['source-id']&&event.inputFingerprint===args.fingerprint&&(event.event==='failed'||(event.event==='progress'&&event.videoRendered&&event.audioAdvancing&&event.positionSeconds>1))))break}
}finally{
 clearInterval(flush);processLog.kill();await save();if(browser)await browser.close();if(forward)execFileSync(adb,['-d','forward','--remove','tcp:9223'])
 const attempts=new Map();for(const event of events){if(!attempts.has(event.sessionId))attempts.set(event.sessionId,[]);attempts.get(event.sessionId).push(event)}
 for(const [sessionId,list] of attempts){const first=list[0],last=list.at(-1);console.log(JSON.stringify({sessionId,sourceId:first.sourceId,fingerprint:first.inputFingerprint,matchesExpected:manual?undefined:first.inputFingerprint===args.fingerprint,rendererEvidence:list.some(event=>event.event==='progress'&&event.videoRendered&&event.audioAdvancing&&event.positionSeconds>1),error:list.find(event=>event.event==='failed'),lastState:last.state,lastPosition:last.positionSeconds,events:list.length}))}
 console.log(`Captura salva em ${output}`)
}
