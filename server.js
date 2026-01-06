const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(express.json({ limit: '1mb' }));

let browser = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getBrowser() {
  if (browser) {
    try {
      await browser.version();
      return browser;
    } catch (e) {
      try { await browser.close(); } catch (_) {}
      browser = null;
    }
  }

  browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });

  browser.on('disconnected', () => {
    browser = null;
  });

  return browser;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', browserActive: !!browser });
});

app.get('/warmup-browser', async (req, res) => {
  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const type = r.resourceType();
      if (type === 'image' || type === 'media' || type === 'font' || type === 'stylesheet') {
        return r.abort();
      }
      return r.continue();
    });

    await page.goto('https://baw.nfz.gov.pl/NFZ/tabBrowser/mainSearch', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    if (page) {
      try { await page.close(); } catch (_) {}
    }
  }
});

app.post('/baw/documents', async (req, res) => {
  let page;
  try {
    const { keyword = '', pageSize = 20 } = req.body ?? {};

    const b = await getBrowser();
    page = await b.newPage();

    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const type = r.resourceType();
      if (type === 'image' || type === 'media' || type === 'font' || type === 'stylesheet') {
        return r.abort();
      }
      return r.continue();
    });

    await page.goto('https://baw.nfz.gov.pl/NFZ/tabBrowser/mainSearch', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await sleep(800);

    const response = await page.evaluate(async (kw, ps) => {
      const r = await fetch('https://baw.nfz.gov.pl/api/documents/GetDocumentsNewGrid', {
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

      const text = await r.text();
      try {
        return JSON.parse(text);
      } catch {
        return {
          nonJson: true,
          status: r.status,
          bodyPreview: text.slice(0, 500),
        };
      }
    }, keyword, pageSize);

    res.json({ success: true, data: response });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (page) {
      try { await page.close(); } catch (_) {}
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

process.on('SIGTERM', async () => {
  try {
    if (browser) await browser.close();
  } catch (_) {}
  process.exit(0);
});
