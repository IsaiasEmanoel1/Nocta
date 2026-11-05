import {chromium} from '@playwright/test'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs/promises'
const adb='C:\\Users\\PC\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'
const pid=execFileSync(adb,['-d','shell','pidof','app.nocta.prototype'],{encoding:'utf8'}).trim().split(/\s+/)[0]
execFileSync(adb,['-d','forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`])
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223')
const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://localhost'))
if(!page)throw Error('Nocta WebView not found')
const results={at:new Date().toISOString(),device:'Samsung SM-S911B',controlled:[],external:[]}
try{
 await page.goto('https://localhost/configuracoes')
 results.plugin=await page.evaluate(()=>({platform:window.Capacitor.getPlatform(),headers:window.Capacitor.PluginHeaders.map(p=>p.name).filter(n=>n==='NoctaNativePlayer')}))
 await page.getByRole('checkbox').check()
 for(const [name,label] of [['MP4','Testar MP4 controlado no Media3'],['HLS','Testar HLS controlado no Media3']]){
  const row={name};try{await page.getByRole('button',{name:label,exact:true}).click();await page.getByText('Reprodução nativa verificada: vídeo renderizado e áudio avançando',{exact:true}).waitFor({timeout:20000});row.verified=true;row.status=await page.getByText('Reprodução nativa verificada: vídeo renderizado e áudio avançando',{exact:true}).textContent()}catch(error){row.verified=false;row.error=error.message.split('\n')[0];row.text=(await page.locator('body').innerText()).slice(-2500)}
  execFileSync(adb,['-d','shell','input','keyevent','4']);await page.waitForTimeout(500);results.controlled.push(row);console.log(JSON.stringify(row))
 }
 if(results.controlled.every(row=>row.verified)){
  await page.getByLabel('Serviço',{exact:true}).selectOption('fenixflix-diagnostics');await page.getByLabel('Tipo experimental').selectOption('series');await page.getByLabel('Identificador experimental').fill('tt7441658');await page.getByRole('button',{name:'Consultar fontes',exact:true}).click();await page.getByRole('status').filter({hasText:/FenixFlix: \d+ fontes/}).waitFor({timeout:45000})
  const other=page.getByText('Outras fontes',{exact:true});if(await other.count())await other.click()
  for(const vendor of ['Arthur','Malfoy']){
   const row={vendor};const source=page.locator('li').filter({hasText:vendor}).first()
   if(!await source.count()){row.absent=true;results.external.push(row);continue}
   const button=source.getByRole('button',{name:'Testar no Media3',exact:true})
   if(!await button.count()){row.candidate=false;results.external.push(row);continue}
   await button.click()
   try{await page.waitForFunction(vendor=>[...document.querySelectorAll('li')].find(li=>li.textContent.includes(vendor))?.textContent.includes('Reprodução nativa verificada: vídeo renderizado e áudio avançando'),vendor,{timeout:25000});row.verified=true}catch(error){row.verified=false;row.observation='Não confirmou vídeo e áudio em 25 segundos; nenhuma causa de rede/codec foi inferida.'}
   row.status=await source.innerText();execFileSync(adb,['-d','shell','input','keyevent','4']);await page.waitForTimeout(500);results.external.push(row);console.log(JSON.stringify(row))
  }
 }
 await page.getByText('Registro de erros (sem URLs)',{exact:true}).click();results.log=await page.getByText('Registro de erros (sem URLs)',{exact:true}).locator('..').innerText()
}finally{await fs.mkdir('.cache/media3-physical',{recursive:true});await fs.writeFile('.cache/media3-physical/result.json',JSON.stringify(results,null,2));await fs.writeFile(`.cache/media3-physical/result-${results.at.replace(/[:.]/g,'-')}.json`,JSON.stringify(results,null,2));await browser.close()}
