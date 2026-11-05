import {chromium} from '@playwright/test';import fs from 'node:fs/promises'
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const result={at:new Date().toISOString(),tests:[]};let current
page.on('console',message=>{const text=message.text();if(current){if(/mixed content/i.test(text))current.mixedContent=true;if(/CORS policy/i.test(text))current.corsError=true}})
try{
 await page.goto('http://127.0.0.1:5176/configuracoes');await page.getByRole('checkbox').check();await page.getByLabel('Serviço',{exact:true}).selectOption('fenixflix-diagnostics')
 for(const test of [{id:'tt7441658',type:'series',providers:['Rubeo']},{id:'tt0096697',type:'series',providers:['Badger','Zunder']}]){
  await page.getByLabel('Tipo experimental').selectOption(test.type);await page.getByLabel('Identificador experimental').fill(test.id);await page.getByRole('button',{name:'Consultar fontes',exact:true}).click();await page.getByRole('status').filter({hasText:/FenixFlix: \d+ fontes/}).waitFor({timeout:45000})
  for(const provider of test.providers){const row={id:test.id,provider};current=row;try{
   const source=page.locator('li').filter({hasText:provider}).first();const button=source.getByRole('button',{name:/Reproduzir/});row.before=await source.innerText();await button.click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,{},{timeout:15000});await page.locator('video').evaluate(el=>el.play());await page.waitForFunction(()=>document.querySelector('video')?.currentTime>2,{},{timeout:15000});row.video=await page.locator('video').evaluate(el=>({time:el.currentTime,width:el.videoWidth,audioBytes:el.webkitAudioDecodedByteCount??null}));row.after=await source.innerText()
  }catch(error){row.error=error.message.split('\n')[0];row.alerts=await page.getByRole('alert').allTextContents();row.after=await page.locator('li').filter({hasText:provider}).first().innerText()}
  result.tests.push(row);console.log(JSON.stringify(row));current=undefined
  }
  if(test.id==='tt0096697'){
   await page.locator('li').filter({hasText:'Badger'}).first().getByRole('button',{name:'Reproduzir mp4'}).click()
   await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,{},{timeout:15000});await page.locator('video').evaluate(el=>el.play());await page.waitForFunction(()=>document.querySelector('video')?.currentTime>2,{},{timeout:15000})
   result.recoveryAfterFailure=await page.locator('video').evaluate(el=>({time:el.currentTime,width:el.videoWidth}))
  }
 }
 await page.screenshot({path:'.cache/fenix-alternatives/browser.png',fullPage:true})
}finally{await fs.writeFile('.cache/fenix-alternatives/browser.json',JSON.stringify(result,null,2));await browser.close()}
