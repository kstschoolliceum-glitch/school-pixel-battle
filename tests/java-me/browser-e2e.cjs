// SPDX-License-Identifier: MIT
// Requires Playwright and an installed Chromium. Never downloads a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const watchdog = setTimeout(() => {
  console.error('FAIL: browser check exceeded 120 seconds'); process.exit(1);
}, 120000);
let server, browser;
async function main() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch {
    if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw Error('Install Playwright first; no download is attempted by this test.');
    ({ chromium } = createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, '../package.json'))('playwright'));
  }
  browser = await chromium.launch({ headless:true, timeout:15000,
    ...(process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH } : {}) });
  server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let target = path.resolve(root, '.' + pathname);
      if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      if ((await fs.stat(target)).isDirectory()) target = path.join(target, 'index.html');
      const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.jar':'application/java-archive' };
      res.writeHead(200, { 'Content-Type':types[path.extname(target)] || 'application/octet-stream' });
      res.end(await fs.readFile(target));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext({ viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000);
  const requested = [], errors = [];
  page.on('request', req => requested.push(req.url()));
  page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/tests/java-me/browser-smoke.html`;
  const openCatalog = () => page.locator('#java-games-open').click();
  const choose = id => page.locator(`[data-game="${id}"]`).click();
  async function screen() {
    await page.locator('iframe.jg-runtime-frame').waitFor({ state:'visible', timeout:30000 });
    return page.locator('iframe.jg-runtime-frame').contentFrame();
  }
  // Inspection below uses the browser automation debugger, not a production RPC.
  async function field(frame, name) {
    return frame.locator('body').evaluate((_, name) => {
      const screen = js2me.listeners.keypress[0].spbCanvas;
      const value = screen['$' + screen[name]];
      return value && typeof value === 'object' ? value.text : value;
    }, name);
  }
  async function expectField(frame, name, expected) {
    for (let n=0; n<100; n++) {
      if (await field(frame, name) === expected) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal(await field(frame, name), expected, name);
  }
  async function exit() {
    await page.locator('[data-action="exit"]').click();
    await page.locator('[data-confirm="yes"]').click();
    await page.locator('#jg-catalog-close').waitFor();
    assert.equal(await page.locator('iframe').count(), 0);
  }
  await page.goto(url);
  await openCatalog();
  assert.ok(!requested.some(u => /engine\.js|\.jar(?:$|\?)/.test(u)), 'catalog must remain lazy');
  await choose('nokia-test');
  assert.equal(await page.locator('iframe').count(), 0, 'tutorial must precede VM');
  const next = page.locator('.jg-tutorial > button');
  await next.click();
  for (const key of ['right','ok','5']) {
    assert.equal(await next.isDisabled(), true);
    await page.locator(`[data-key="${key}"]`).click(); await next.click();
  }
  await next.click(); await next.click(); await next.click();
  let frame = await screen();
  const pixels = await frame.locator('#screen > canvas').evaluate(canvas => {
    const bytes = canvas.getContext('2d').getImageData(0,0,240,320).data;
    const colors = new Set();
    for(let i=0;i<bytes.length;i+=4) colors.add(`${bytes[i]},${bytes[i+1]},${bytes[i+2]}`);
    return { width:canvas.width, height:canvas.height, colors:colors.size };
  });
  assert.equal(pixels.width,240); assert.equal(pixels.height,320);
  assert.ok(pixels.colors > 3, 'real text and Image must appear, not a blank frame');
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
  assert.equal(await frame.locator('body').evaluate(() => {
    try { return parent.localStorage.length; } catch(e) { return e.name; }
  }), 'SecurityError');
  const codes = { up:-1,down:-2,left:-3,right:-4,ok:-5,L:-6,R:-7,'*':42,'#':35 };
  for(let i=0;i<10;i++) codes[i]=48+i;
  for(const [key,code] of Object.entries(codes)) {
    const box = await page.locator(`[data-key="${key}"]`).boundingBox();
    assert.ok(box); await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
    await page.mouse.down();
    await expectField(frame,'$lastKeyI',code); await expectField(frame,'$downZ',1);
    await page.mouse.up(); await expectField(frame,'$downZ',0);
  }
  await page.keyboard.down('ArrowRight'); await expectField(frame,'$downZ',1);
  await new Promise(resolve => setTimeout(resolve,550)); await expectField(frame,'$downZ',1);
  await page.keyboard.up('ArrowRight'); await expectField(frame,'$downZ',0);
  if(process.env.JAVA_ME_SCREENSHOT) await page.screenshot({ path:process.env.JAVA_ME_SCREENSHOT });
  await exit();
  await choose('rms-audio-test'); frame = await screen();
  assert.equal(await page.locator('.jg-tutorial').count(),0);
  await expectField(frame,'$statusLjava_lang_String_','RMS launches: 1');
  await exit();
  await page.reload(); await openCatalog(); await choose('rms-audio-test'); frame = await screen();
  await expectField(frame,'$statusLjava_lang_String_','RMS launches: 2');
  await exit(); await page.locator('#jg-catalog-close').click();
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: browser MIDlet frame, 19 keys, hold/release, opaque sandbox, RMS after reload, catalog lifecycle.');
  console.log('Not checked: audible sound, Gameloft compatibility, physical Android/iOS performance.');
}
main().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  await browser?.close();
  if(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  clearTimeout(watchdog);
});
