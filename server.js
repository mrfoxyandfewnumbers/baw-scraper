const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(express.json());

let browser;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });
  }
  return browser;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', browserActive: !!browser });
});

app.post('/baw/documents', async (req, res) => {
  try {
    const { keyword = '', pageSize = 20 } = req.body;
    
    const browser = await getBrowser();
    const page = await browser.newPage();
    
    await page.goto('https://baw.nfz.gov.pl/NFZ/tabBrowser/mainSearch', {
  waitUntil: 'domcontentloaded',
  timeout: 60000
});
    
    const response = await page.evaluate(async (kw, ps) => {
      const res = await fetch('https://baw.nfz.gov.pl/api/documents/GetDocumentsNewGrid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageNumber: 0,
          pageSize: ps,
          isBlocked: true,
          searchText: kw,
          SearchForType: 22,
          InstitutionId: 4,
          DevExtremeGridOptions: { skip: 0, take: ps }
        })
      });
      return await res.json();
    }, keyword, pageSize);
    
    await page.close();
    
    res.json({ success: true, data: response });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
