import puppeteer from 'puppeteer';

// Testando com o ID de exemplo do MyEmbed (ou troque pelo ID do TMDB)
const EMBED_URL = 'https://www.embedmovies.org/#playground'; 

async function testarMyEmbed() {
  console.log(`🚀 Abrindo MyEmbed: ${EMBED_URL}`);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  const linksEncontrados = new Set();

  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('.m3u8') || url.includes('.mp4')) {
      if (!linksEncontrados.has(url)) {
        linksEncontrados.add(url);
        console.log('\n🎯 [MÍDIA ENCONTRADA NO MYEMBED!]:', url);
      }
    }
  });

  try {
    await page.goto(EMBED_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('\n📌 Página carregada! Dê play no player do navegador que abriu...');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  } catch (error) {
    console.error('⚠️ Erro:', error.message);
  } finally {
    await browser.close();
  }
}

testarMyEmbed();