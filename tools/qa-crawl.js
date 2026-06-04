#!/usr/bin/env node
/*
 * QA Crawler — coleta determinística de fatos sobre um app web.
 * Abre a URL num Chrome controlado, captura erros de console, requisições
 * quebradas, clica nos elementos interativos, testa desktop + mobile e
 * salva screenshots + um relatório JSON/MD.
 *
 * Uso:
 *   node qa-crawl.js --url https://seu-app.com [--max 25] [--no-mobile]
 *
 * Requer Chrome/Chromium. Por padrao usa o do sistema (CHROMIUM_PATH ou
 * /usr/bin/chromium). Pode apontar pra outro com CHROMIUM_PATH=/caminho.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (!v || v.startsWith('--')) ? true : v;
}

const URL = arg('url');
const MAX_CLICKS = parseInt(arg('max', 25), 10);
const DO_MOBILE = !arg('no-mobile', false);
const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

if (!URL) {
  console.error('uso: node qa-crawl.js --url https://seu-app.com [--max 25] [--no-mobile]');
  process.exit(1);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const host = URL.replace(/^https?:\/\//, '').replace(/[^\w.-]/g, '_').slice(0, 40);
const outDir = path.join(__dirname, 'reports', `${host}_${ts}`);
fs.mkdirSync(outDir, { recursive: true });

const report = {
  url: URL,
  startedAt: new Date().toISOString(),
  pages: {},          // por viewport: desktop / mobile
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  buttonsTested: [],
  brokenLinks: [],
  screenshots: [],
  summary: {}
};

function attachListeners(page, label) {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      report.consoleErrors.push({ where: label, text: msg.text().slice(0, 300) });
    }
  });
  page.on('pageerror', err => {
    report.pageErrors.push({ where: label, text: String(err).slice(0, 300) });
  });
  page.on('requestfailed', req => {
    report.failedRequests.push({ where: label, url: req.url().slice(0, 200), reason: req.failure()?.errorText });
  });
  page.on('response', resp => {
    const s = resp.status();
    if (s >= 400) report.failedRequests.push({ where: label, url: resp.url().slice(0, 200), status: s });
  });
}

// rola a pagina inteira em passos pra disparar lazy-load / animacoes de revelar no scroll
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const step = 300;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight + window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  try { await autoScroll(page); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(`${name}.png`); }
  catch { /* ignore */ }
  return file;
}

async function run() {
  console.log(`[qa] abrindo ${URL} com ${CHROMIUM}`);
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--no-sandbox'] });

  // ---------- DESKTOP ----------
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  attachListeners(page, 'desktop');

  const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => ({ err: e.message }));
  await page.waitForTimeout(1500);
  report.pages.desktop = {
    finalUrl: page.url(),
    title: await page.title().catch(() => ''),
    httpStatus: resp && resp.status ? resp.status() : (resp && resp.err ? 'ERRO: ' + resp.err : null)
  };
  await shot(page, 'desktop-home');

  // descobrir elementos interativos
  const inventory = await page.evaluate(() => {
    const q = sel => Array.from(document.querySelectorAll(sel));
    const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const label = el => (el.innerText || el.getAttribute('aria-label') || el.value || el.getAttribute('title') || '').trim().slice(0, 50);
    return {
      buttons: q('button, [role=button], input[type=submit], input[type=button]').filter(visible).map(label),
      links: q('a[href]').filter(visible).map(a => ({ text: label(a), href: a.getAttribute('href') })),
      inputs: q('input, textarea, select').filter(visible).length
    };
  });
  report.pages.desktop.inventory = { buttons: inventory.buttons.length, links: inventory.links.length, inputs: inventory.inputs };

  // testar cliques nos botoes (com reset entre cada um)
  const btnLabels = inventory.buttons.slice(0, MAX_CLICKS);
  for (let i = 0; i < btnLabels.length; i++) {
    const before = report.consoleErrors.length + report.pageErrors.length;
    let result = 'ok';
    try {
      const handles = await page.$$('button, [role=button], input[type=submit], input[type=button]');
      if (handles[i]) {
        await handles[i].click({ timeout: 4000 }).catch(() => { result = 'nao-clicavel'; });
        await page.waitForTimeout(800);
      }
    } catch (e) { result = 'erro: ' + e.message.slice(0, 80); }
    const after = report.consoleErrors.length + report.pageErrors.length;
    if (after > before && result === 'ok') result = 'gerou-erro-no-console';
    report.buttonsTested.push({ index: i, label: btnLabels[i] || '(sem texto)', result });
    // reset pro estado inicial
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  // checar links internos quebrados (status >= 400) via requisicao
  const internal = inventory.links
    .map(l => l.href)
    .filter(h => h && !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('tel:'))
    .map(h => { try { return new URL(h, URL).href; } catch { return null; } })
    .filter(Boolean);
  const uniqueLinks = [...new Set(internal)].slice(0, 30);
  for (const link of uniqueLinks) {
    try {
      const r = await ctx.request.get(link, { timeout: 10000 });
      if (r.status() >= 400) report.brokenLinks.push({ url: link, status: r.status() });
    } catch (e) { report.brokenLinks.push({ url: link, status: 'falhou: ' + e.message.slice(0, 60) }); }
  }

  await ctx.close();

  // ---------- MOBILE ----------
  if (DO_MOBILE) {
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
    const mpage = await mctx.newPage();
    attachListeners(mpage, 'mobile');
    await mpage.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await mpage.waitForTimeout(1500);
    // detectar overflow horizontal (layout quebrado no mobile)
    const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 4);
    report.pages.mobile = { finalUrl: mpage.url(), overflowHorizontal: overflow };
    await shot(mpage, 'mobile-home');
    await mctx.close();
  }

  await browser.close();

  // ---------- SUMARIO ----------
  report.summary = {
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
    failedRequests: report.failedRequests.length,
    brokenLinks: report.brokenLinks.length,
    buttonsComProblema: report.buttonsTested.filter(b => b.result !== 'ok').length,
    botoesTestados: report.buttonsTested.length,
    mobileOverflow: report.pages.mobile?.overflowHorizontal || false
  };
  report.finishedAt = new Date().toISOString();

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'report.md'), toMarkdown(report));
  console.log('[qa] relatorio salvo em', outDir);
  console.log('[qa] resumo:', JSON.stringify(report.summary));
}

function toMarkdown(r) {
  const L = [];
  L.push(`# Relatório de QA — ${r.url}`);
  L.push(`Rodado: ${r.startedAt}\n`);
  L.push(`## Resumo`);
  for (const [k, v] of Object.entries(r.summary)) L.push(`- ${k}: ${v}`);
  L.push(`\n## Páginas`);
  L.push('```json\n' + JSON.stringify(r.pages, null, 2) + '\n```');
  if (r.consoleErrors.length) { L.push(`\n## Erros de console (${r.consoleErrors.length})`); r.consoleErrors.slice(0, 20).forEach(e => L.push(`- [${e.where}] ${e.text}`)); }
  if (r.pageErrors.length) { L.push(`\n## Erros de página/JS (${r.pageErrors.length})`); r.pageErrors.slice(0, 20).forEach(e => L.push(`- [${e.where}] ${e.text}`)); }
  if (r.failedRequests.length) { L.push(`\n## Requisições falhas (${r.failedRequests.length})`); r.failedRequests.slice(0, 25).forEach(e => L.push(`- [${e.where}] ${e.status || e.reason} — ${e.url}`)); }
  if (r.brokenLinks.length) { L.push(`\n## Links quebrados (${r.brokenLinks.length})`); r.brokenLinks.forEach(e => L.push(`- ${e.status} — ${e.url}`)); }
  L.push(`\n## Botões testados (${r.buttonsTested.length})`);
  r.buttonsTested.forEach(b => L.push(`- [${b.result}] ${b.label}`));
  L.push(`\n## Screenshots`);
  r.screenshots.forEach(s => L.push(`- ${s}`));
  return L.join('\n');
}

run().catch(e => { console.error('[qa] falhou:', e.message); process.exit(1); });
