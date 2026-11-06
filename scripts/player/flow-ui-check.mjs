import {createServer} from 'vite'
import {chromium,expect} from '@playwright/test'
import fs from 'node:fs/promises'
const directory=process.env.NOCTA_CHECK_DIRECTORY??'.cache/player-altura';await fs.mkdir(directory,{recursive:true})
const fixture=await fs.readFile('android/app/src/debug/assets/native-fixtures/sample.mp4')
const server=await createServer({server:{host:'127.0.0.1',port:5184,strictPort:true}});await server.listen()
let browser;const result={at:new Date().toISOString(),scope:'Real Nocta UI/TMDB metadata; controlled addon replies and pre-existing authorized video bytes. Not external playback verification.'}
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1080}});let mode='primary',calls=0,slowMedia=false
 await page.route(/https:\/\/(fenixflix\.fenixhub\.online|brazuca-play-stremio\.vercel\.app|zeus-br\.shardweb\.app)\//,async route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('manifest.json'))return route.fulfill({json:{id:'controlled',name:'Controlled',version:'1',types:['movie','series'],resources:['stream'],catalogs:[]}});if(u.pathname.includes('/stream/')){if(u.hostname!=='fenixflix.fenixhub.online')return route.fulfill({json:{streams:[]}});calls++;await new Promise(resolve=>setTimeout(resolve,mode==='primary'?5000:300));return route.fulfill({json:{streams:[{name:'Fenix Rubeo Dublado 1080p',url:'https://cdn-sv01.maximaimg.online/nocta-controlled.mp4'},...(mode==='language'?[{name:'Fenix Rubeo Legendado 720p',url:'https://cdn-sv01.maximaimg.online/nocta-controlled-sub.mp4'}]:[])]}})}return route.abort()})
 await page.route('https://cdn-sv01.maximaimg.online/nocta-controlled*.mp4',async route=>{if(slowMedia)await new Promise(resolve=>setTimeout(resolve,6200));return route.fulfill({body:fixture,contentType:'video/mp4',headers:{'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes'}})})
 await page.goto('http://127.0.0.1:5184/assistir/tmdb-movie-196254');await expect(page.getByRole('banner').getByRole('link',{name:'NOCTA — início',exact:true})).toBeVisible();await page.locator('.automatic-watch-title').waitFor();await expect(page.locator('.player-stage-backdrop')).toHaveAttribute('style',/image.tmdb.org/);await page.waitForTimeout(600);const stage=page.getByRole('region',{name:'Área de reprodução'});await expect(stage.locator('.provider-progress')).toHaveCount(0);result.desktopRect=await stage.boundingBox();await page.screenshot({path:directory+'/desktop-primary.png'})
 mode='language';await page.reload();await expect(stage.getByRole('tab',{name:'Dublado'})).toHaveAttribute('aria-selected','true');result.desktopSelectionRect=await stage.boundingBox();expect(result.desktopSelectionRect.height).toBeGreaterThan(result.desktopRect.height);await page.setViewportSize({width:412,height:915});const dubbed=stage.getByRole('tab',{name:'Dublado'}),subbed=stage.getByRole('tab',{name:'Legendado'});await expect(dubbed).toHaveAttribute('aria-selected','true');const d=await dubbed.boundingBox(),l=await subbed.boundingBox();result.tabsSideBySide=!!d&&!!l&&Math.abs(d.y-l.y)<1&&d.x<l.x;result.mobileSelectionRect=await stage.boundingBox();await stage.screenshot({path:directory+'/mobile-player-sources.png'});const before=calls;await subbed.click();await expect(stage.locator('.source-choice')).toHaveCount(1);slowMedia=true;await stage.locator('.source-choice').click();await expect(stage.getByText('A conexão está lenta. Aguarde mais alguns segundos...',{exact:true})).toBeVisible({timeout:6000});await expect(stage.locator('iframe')).toHaveCount(0);await expect(stage.locator('.provider-progress')).toHaveCount(0);result.slowWarningWithoutFallback=true
 await page.waitForTimeout(1300);const gesture=page.getByRole('button',{name:'Iniciar reprodução',exact:true});if(await gesture.count())await gesture.click();await expect.poll(()=>page.locator('video').evaluateAll(els=>els.some(v=>v.videoWidth>0&&v.currentTime>1&&!v.paused)),{timeout:10000}).toBe(true);await expect(stage.locator('.player-stage-backdrop')).toHaveCount(1);result.languageReusesQuery=calls===before;result.notAutoFullscreen=await page.evaluate(()=>!document.fullscreenElement);result.mobileVideo=await page.locator('video').evaluate(v=>({intrinsic:[v.videoWidth,v.videoHeight],objectFit:getComputedStyle(v).objectFit,stageHeight:v.closest('.nocta-player-stage').getBoundingClientRect().height,viewportHeight:innerHeight}));await stage.screenshot({path:directory+'/mobile-player-playing.png'});
 const frame=stage.locator('.video-frame'), video=frame.locator('video');
 await frame.focus();await stage.getByRole('button',{name:'Tela cheia',exact:true}).click();
 await expect(frame).toHaveCSS('background-color','rgb(0, 0, 0)');
 await expect(video).toHaveCSS('object-fit','contain');
 await page.setViewportSize({width:915,height:412});
 await expect(video).toHaveCSS('object-fit','cover');
 await page.setViewportSize({width:412,height:915});
 await expect(video).toHaveCSS('object-fit','contain');
 await expect(stage.getByRole('button',{name:/Ajustar|Preencher/})).toHaveCount(0);
 await expect(stage.getByRole('button',{name:'Servidores',exact:true})).toHaveCount(0);
 await stage.getByRole('button',{name:'Sair da tela cheia',exact:true}).click();
 await expect(video).toHaveCSS('object-fit','contain');
 await expect(stage.locator('.player-stage-backdrop')).toHaveCount(1);
 result.fullscreenFramingVerified=true;await frame.focus();await stage.getByRole('button',{name:'Servidores',exact:true}).click();await expect(stage.getByRole('tab',{name:'Legendado'})).toHaveAttribute('aria-selected','true');result.menuPreservesQuery=calls===before;result.noVendorNames=!(await page.locator('.automatic-watch').innerText()).match(/FenixFlix|Brazuca|EmbedMovies|Zeus|Rubeo|Malfoy/)
 slowMedia=false;await page.goto('http://127.0.0.1:5184/minha-lista');await page.getByRole('navigation',{name:'Navegação móvel'}).getByRole('link',{name:'Buscar',exact:true}).click();const input=page.getByLabel('Buscar filmes e séries');await expect(input).toBeFocused();result.navigationFocusesSearch=true;await page.locator('.poster-link').first().waitFor();await expect(page.getByText(/^Filmes e séries são combinados/)).toHaveCount(0);result.catalogNoticeRemoved=true;await input.fill('Barbie');await input.press('Enter');result.submitBlurs=await input.evaluate(el=>el!==document.activeElement);await page.getByRole('button',{name:'Filtros',exact:true}).click();await page.getByRole('combobox',{name:'Gênero',exact:true}).click();await page.getByRole('dialog',{name:'Opções: Gênero',exact:true}).waitFor();await page.screenshot({path:directory+'/mobile-search-filter.png'});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0)
 await page.locator('.poster-link').first().waitFor();const searchUrl=page.url();await page.screenshot({path:directory+'/mobile-search.png'});await page.locator('.poster-link').first().click();await page.getByRole('link',{name:'Voltar',exact:true}).click();await expect(page).toHaveURL(searchUrl);result.backRestoresSearch=await input.inputValue()==='Barbie';result.backDoesNotRefocus=await input.evaluate(el=>el!==document.activeElement)
 await page.goto('http://127.0.0.1:5184/assistir/tmdb-tv-60735?temporada=1&episodio=2');
 await expect(page.getByText('Em exibição · T1 E2',{exact:true})).toBeVisible();
 const episodes=page.getByRole('navigation',{name:'Navegação de episódios'});
 result.episodeNavigation=[];
 for(const width of [320,412,1440]){
  await page.setViewportSize({width,height:915});
  const previous=await episodes.getByRole('button',{name:'Anterior',exact:true}).boundingBox();
  const next=await episodes.getByRole('button',{name:'Próximo episódio',exact:true}).boundingBox();
  expect(previous&&next&&Math.abs(previous.y-next.y)<1&&previous.x<next.x).toBe(true);
  result.episodeNavigation.push({width,previous,next});
 }
 console.log(JSON.stringify(result));await fs.writeFile(directory+'/browser-ui.json',JSON.stringify(result,null,2))
}finally{await browser?.close();await server.close()}
