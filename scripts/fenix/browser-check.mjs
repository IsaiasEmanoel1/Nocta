import {chromium} from '@playwright/test';import fs from 'node:fs/promises'
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const result={at:new Date().toISOString(),tests:[]}
try{
 await page.goto('http://127.0.0.1:5176/configuracoes');await page.getByRole('checkbox').check();await page.getByLabel('Serviço',{exact:true}).selectOption('fenixflix-diagnostics')
 for(const test of [{type:'movie',id:'tt35538033'},{type:'series',id:'tt7441658'}]){
  await page.getByLabel('Tipo experimental').selectOption(test.type);await page.getByLabel('Identificador experimental').fill(test.id);await page.getByRole('button',{name:'Consultar fontes',exact:true}).click()
  const row={...test};try{
   await page.getByRole('button',{name:'Reproduzir hls',exact:true}).first().waitFor({timeout:60000});row.sources=await page.getByRole('button',{name:/Reproduzir /}).count()
   const playable=page.getByRole('button',{name:'Reproduzir hls',exact:true});row.playable=await playable.count()
   for(let i=0;i<await playable.count();i++)if(await playable.nth(i).isEnabled()){await playable.nth(i).click();break}
   await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,{},{timeout:25000});await page.locator('video').evaluate(el=>el.play());await page.waitForFunction(()=>document.querySelector('video')?.currentTime>2,{},{timeout:20000})
   row.video=await page.locator('video').evaluate(el=>({time:el.currentTime,width:el.videoWidth,paused:el.paused,muted:el.muted,volume:el.volume,audioDecodedBytes:el.webkitAudioDecodedByteCount??null}));row.audioTracks=await page.getByLabel('Faixa de áudio').locator('option').allTextContents()
  }catch(error){row.error=error.message.split('\n')[0];row.status=await page.getByRole('status').allTextContents();row.alerts=await page.getByRole('alert').allTextContents()}
  result.tests.push(row);console.log(JSON.stringify(row))
 }
 await page.screenshot({path:'.cache/fenix-configured/browser.png',fullPage:true})
}finally{await fs.writeFile('.cache/fenix-configured/browser.json',JSON.stringify(result,null,2));await browser.close()}
