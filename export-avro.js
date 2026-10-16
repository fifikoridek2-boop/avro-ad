#!/usr/bin/env node
/*
 * Avro ad -> MP4 (1920x1080, 60 fps, H.264 high quality)
 *
 * Renders the page frame by frame (the scene is a pure function of time, so the
 * result is identical on every run and never drops frames), pipes PNG frames to
 * ffmpeg. Motion blur is part of each frame (sub-frame accumulation).
 *
 * Usage:  node export-avro.js index.html avro-ad.mp4 [--fps 60] [--crf 14]
 *                             [--from 0] [--to 13.1] [--three ./three.min.js]
 * Needs:  node, `npm i playwright`, ffmpeg on PATH, a Chromium (playwright install chromium).
 * The page loads three.js (cdnjs r128) and the Outfit font (Google Fonts); if the
 * machine is offline pass --three with a local three.min.js and install Outfit locally.
 */
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const [html, out] = [process.argv[2], process.argv[3]];
if (!html || !out) { console.error('usage: node export-avro.js <page.html> <out.mp4> [--fps 60] [--crf 14] [--from s] [--to s] [--three file]'); process.exit(1); }
const FPS = +arg('fps', 60), CRF = arg('crf', '14'), T0 = +arg('from', 0), T1 = arg('to', null);

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('Install playwright first:  npm i playwright && npx playwright install chromium'); process.exit(1); }
  const exe = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch({
    executablePath: exe || undefined,
    args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-background-timer-throttling']
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  if (arg('three')) {
    const body = fs.readFileSync(arg('three'), 'utf8');
    await page.route('**/three.min.js', r => r.fulfill({ contentType: 'application/javascript', body }));
  }
  await page.goto('file://' + path.resolve(html) + '?export', { waitUntil: 'load' });
  const dur = await page.evaluate(() => window.avroScene.dur);
  const end = T1 === null ? dur : Math.min(+T1, dur);
  const need3D = end > 8.9;

  /* everything small must really be loaded before the first frame: fonts for the painted phone text, and three.js */
  await page.evaluate(() => Promise.all(['400', '500', '600', '700'].map(w => document.fonts.load(w + ' 20px Outfit'))).catch(() => {}));
  if (need3D) {
    const t0 = Date.now();
    while (!(await page.evaluate(() => window.avroScene.ready())) && Date.now() - t0 < 60000) await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({
      ready: window.avroScene.ready(),
      three: typeof THREE !== 'undefined',
      fonts: ['400', '500', '600', '700'].every(w => document.fonts.check(w + ' 20px Outfit'))
    }));
    if (!st.three || !st.ready) { console.error('three.js did not load or the 3D scene failed to build. Pass --three ./three.min.js or check the network.', errs); process.exit(2); }
    if (!st.fonts) { console.error('The Outfit font is not available, the phone text would be wrong. Check the network or install Outfit.'); process.exit(3); }
  }

  const frames = Math.round((end - T0) * FPS);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF), '-pix_fmt', 'yuv420p',
    '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-r', String(FPS), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.stdin.on('error', () => {});
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    const t = T0 + i / FPS;
    const b64 = await page.evaluate(t => {
      window.avroScene.render(t);
      return window.avroScene.canvas.toDataURL('image/png').slice(22);
    }, t);
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${frames}  t=${t.toFixed(2)}s  ${((Date.now() - started) / 1000).toFixed(0)}s elapsed`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log(`\ndone: ${out}  (${frames} frames, ${FPS} fps, 1920x1080)` + (errs.length ? '\npage errors: ' + errs.join(' | ') : ''));
})();
