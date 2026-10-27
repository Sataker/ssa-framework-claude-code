#!/usr/bin/env node
/*
 * QA Crawler — deterministic fact collection for a web app.
 * Opens the URL in a controlled Chromium, captures console errors and failed
 * requests, clicks every interactive element, tests desktop + mobile and
 * saves screenshots plus a JSON/Markdown report.
 *
 * Usage:
 *   node tools/qa-crawl.js --url https://your-app.com [--max 25] [--no-mobile]
 *
 * Requires Chrome/Chromium. Defaults to /usr/bin/chromium; override with
 * CHROMIUM_PATH=/path/to/chromium. Reports go to ./reports/<host>_<timestamp>/.
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

const TARGET_URL = arg('url');
const MAX_CLICKS = parseInt(arg('max', 25), 10);
const DO_MOBILE = !arg('no-mobile', false);
const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

if (!TARGET_URL) {
  console.error('usage: node tools/qa-crawl.js --url https://your-app.com [--max 25] [--no-mobile]');
  process.exit(1);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const host = TARGET_URL.replace(/^https?:\/\//, '').replace(/[^\w.-]/g, '_').slice(0, 40);
const outDir = path.join(process.cwd(), 'reports', `${host}_${ts}`);
fs.mkdirSync(outDir, { recursive: true });

const report = {
  url: TARGET_URL,
  startedAt: new Date().toISOString(),
  pages: {},          // per viewport: desktop / mobile
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

// scroll the whole page in steps to trigger lazy-load and scroll-reveal animations
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
  console.log(`[qa] opening ${TARGET_URL} with ${CHROMIUM}`);
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--no-sandbox'] });

  // ---------- DESKTOP ----------
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  attachListeners(page, 'desktop');

  const resp = await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => ({ err: e.message }));
  await page.waitForTimeout(1500);
  report.pages.desktop = {
    finalUrl: page.url(),
    title: await page.title().catch(() => ''),
    httpStatus: resp && resp.status ? resp.status() : (resp && resp.err ? 'ERRO: ' + resp.err : null)
  };
  await shot(page, 'desktop-home');

  // discover interactive elements
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

  // click each button (resetting the page between clicks)
  const btnLabels = inventory.buttons.slice(0, MAX_CLICKS);
  for (let i = 0; i < btnLabels.length; i++) {
    const before = report.consoleErrors.length + report.pageErrors.length;
    let result = 'ok';
    try {
      const handles = await page.$$('button, [role=button], input[type=submit], input[type=button]');
      if (handles[i]) {
        await handles[i].click({ timeout: 4000 }).catch(() => { result = 'not-clickable'; });
        await page.waitForTimeout(800);
      }
    } catch (e) { result = 'error: ' + e.message.slice(0, 80); }
    const after = report.consoleErrors.length + report.pageErrors.length;
    if (after > before && result === 'ok') result = 'caused-console-error';
    report.buttonsTested.push({ index: i, label: btnLabels[i] || '(no text)', result });
    // back to the initial state
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  // check links for broken targets (status >= 400)
  const internal = inventory.links
    .map(l => l.href)
    .filter(h => h && !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('tel:'))
    .map(h => { try { return new URL(h, TARGET_URL).href; } catch { return null; } })
    .filter(Boolean);
  const uniqueLinks = [...new Set(internal)].slice(0, 30);
  for (const link of uniqueLinks) {
    try {
      const r = await ctx.request.get(link, { timeout: 10000 });
      // 429 = rate limited by the target site, not a broken link
      if (r.status() >= 400 && r.status() !== 429) report.brokenLinks.push({ url: link, status: r.status() });
    } catch (e) { report.brokenLinks.push({ url: link, status: 'failed: ' + e.message.slice(0, 60) }); }
  }

  await ctx.close();

  // ---------- MOBILE ----------
  if (DO_MOBILE) {
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
    const mpage = await mctx.newPage();
    attachListeners(mpage, 'mobile');
    await mpage.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await mpage.waitForTimeout(1500);
    // detect horizontal overflow (broken mobile layout)
    const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 4);
    report.pages.mobile = { finalUrl: mpage.url(), overflowHorizontal: overflow };
    await shot(mpage, 'mobile-home');
    await mctx.close();
  }

  await browser.close();

  // ---------- SUMMARY ----------
  report.summary = {
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
    failedRequests: report.failedRequests.length,
    brokenLinks: report.brokenLinks.length,
    buttonsWithIssues: report.buttonsTested.filter(b => b.result !== 'ok').length,
    buttonsTested: report.buttonsTested.length,
    mobileOverflow: report.pages.mobile?.overflowHorizontal || false
  };
  report.finishedAt = new Date().toISOString();

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'report.md'), toMarkdown(report));
  console.log('[qa] report saved to', outDir);
  console.log('[qa] summary:', JSON.stringify(report.summary));
}

function toMarkdown(r) {
  const L = [];
  L.push(`# QA Report — ${r.url}`);
  L.push(`Run at: ${r.startedAt}\n`);
  L.push(`## Summary`);
  for (const [k, v] of Object.entries(r.summary)) L.push(`- ${k}: ${v}`);
  L.push(`\n## Pages`);
  L.push('```json\n' + JSON.stringify(r.pages, null, 2) + '\n```');
  if (r.consoleErrors.length) { L.push(`\n## Console errors (${r.consoleErrors.length})`); r.consoleErrors.slice(0, 20).forEach(e => L.push(`- [${e.where}] ${e.text}`)); }
  if (r.pageErrors.length) { L.push(`\n## Page / JS errors (${r.pageErrors.length})`); r.pageErrors.slice(0, 20).forEach(e => L.push(`- [${e.where}] ${e.text}`)); }
  if (r.failedRequests.length) { L.push(`\n## Failed requests (${r.failedRequests.length})`); r.failedRequests.slice(0, 25).forEach(e => L.push(`- [${e.where}] ${e.status || e.reason} — ${e.url}`)); }
  if (r.brokenLinks.length) { L.push(`\n## Broken links (${r.brokenLinks.length})`); r.brokenLinks.forEach(e => L.push(`- ${e.status} — ${e.url}`)); }
  L.push(`\n## Buttons tested (${r.buttonsTested.length})`);
  r.buttonsTested.forEach(b => L.push(`- [${b.result}] ${b.label}`));
  L.push(`\n## Screenshots`);
  r.screenshots.forEach(s => L.push(`- ${s}`));
  return L.join('\n');
}

run().catch(e => { console.error('[qa] failed:', e.message); process.exit(1); });
