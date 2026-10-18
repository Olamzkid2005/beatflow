/** Run: node tools/generate-orbital-images.mjs [--verify-only | --check-prototype | --serve] */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public/images/orbital");
const checkPrototype = process.argv.includes("--check-prototype");
const serveOnly = process.argv.includes("--serve");
const verifyOnly = process.argv.includes("--verify-only") || checkPrototype || serveOnly;
const chromePath = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
if (!serveOnly) assert(existsSync(chromePath), "Set CHROME_PATH to your installed Chrome binary.");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Orbital image generation</title></head>
<body style="margin:0;background:#101211;color:#ddd"><p id="status">Preparing artwork…</p>
<script type="module">import {createOrbitalArtwork} from '/art.mjs';
window.makeArtwork = createOrbitalArtwork;
window.ready = true;</script></body></html>`;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/save" && req.method === "POST" && !verifyOnly) {
      const name = new URL(req.url, "http://localhost").searchParams.get("name");
      assert(/^[a-z0-9-]+\.(png|jpg)$/.test(name));
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; assert(size < 8 * 1024 * 1024); chunks.push(chunk); }
      await mkdir(output, { recursive: true });
      await writeFile(join(output, name), Buffer.concat(chunks));
      res.end("ok"); return;
    }
    if (path === "/") { res.setHeader("Content-Type", "text/html"); res.end(html); return; }
    if (path === "/progress") { console.log("artwork:", new URL(req.url, "http://localhost").searchParams.get("stage")); res.end("ok"); return; }
    let file;
    let mime;
    let source;
    if (path === "/art.mjs") { file = join(root, "tools/orbital-art.mjs"); mime = "text/javascript"; }
    else if (path === "/font.woff2") { file = join(root, "app/fonts/JetBrainsMono-Variable.woff2"); mime = "font/woff2"; }
    else if (path === "/assets.js" || path === "/template-schema.js") {
      file = join(root, "lib/renderer", path === "/assets.js" ? "assets.ts" : "template-schema.ts");
      source = ts.transpileModule(await readFile(file, "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText.replace('"./template-schema"', '"/template-schema.js"').replace('"zod"', '"/zod/index.js"');
      mime = "text/javascript";
    } else if (path.startsWith("/zod/") && path.endsWith(".js")) {
      const base = join(root, "node_modules/zod");
      file = resolve(base, path.slice(5));
      assert(file.startsWith(base + sep)); mime = "text/javascript";
    } else if (path.startsWith("/prototypes/orbital/") || path.startsWith("/images/orbital/")) {
      const publicRoot = join(root, "public");
      file = resolve(publicRoot, path.slice(1) + (path.endsWith("/") ? "index.html" : ""));
      assert(file.startsWith(publicRoot + sep));
      const ext = file.split(".").pop();
      mime = {html:"text/html",mjs:"text/javascript",png:"image/png",jpg:"image/jpeg",woff2:"font/woff2",txt:"text/plain",json:"application/json"}[ext];
      assert(mime, "Unsupported file type");
    } else if (path.startsWith("/images/")) {
      file = resolve(output, path.slice(8));
      assert(file.startsWith(output + sep));
      mime = path.endsWith(".png") ? "image/png" : "image/jpeg";
    } else { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", mime);
    res.end(source ?? await readFile(file));
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
server.on("error", (error) => { console.error(error); process.exitCode = 1; });
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(serveOnly ? Number(process.env.ORBITAL_PORT ?? 3136) : 0, "127.0.0.1", resolve); });
const url = `http://127.0.0.1:${server.address().port}`;
if (serveOnly) {
  console.log(`Orbital prototype ready: ${url}/prototypes/orbital/`);
  await new Promise((resolve) => {
    const close = () => server.close(resolve);
    process.once("SIGINT", close); process.once("SIGTERM", close);
  });
  process.exit(0);
}
const profile = await mkdtemp(join(tmpdir(), "beatflow-orbital-"));
const chrome = spawn(chromePath, ["--headless=new", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
let spawnFailure;
chrome.on("error", (error) => { spawnFailure = error; });
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    if (spawnFailure) throw spawnFailure;
    if (chrome.exitCode !== null) throw new Error(`Chrome exited: ${chrome.exitCode}`);
    try { port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; await sleep(100); }
  }
  assert(port, "Chrome debugging endpoint did not start.");
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  assert(response.ok);
  socket = new WebSocket((await response.json()).webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  const failures = [];
  const external = [];
  let pageFrames = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id); pending.delete(message.id); clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
    }
    if (message.method === 'Page.screencastFrame') { pageFrames++; void send('Page.screencastFrameAck',{sessionId:message.params.sessionId}); }
    if (message.method === "Runtime.exceptionThrown") failures.push(message.params.exceptionDetails);
    if (message.method === "Network.requestWillBeSent") {
      const request = message.params.request.url;
      if (/^https?:/.test(request) && !request.startsWith(`${url}/`)) external.push(request);
    }
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(next, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async (expression) => {
    const value = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    return value.result.value;
  };
  await send("Runtime.enable"); await send("Network.enable");
  // Reload under observation: catch generation/font/asset network activity from the beginning.
  await send("Page.navigate", { url });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (await evaluate("window.ready === true")) { ready = true; break; }
    await sleep(100);
  }
  assert(ready, "Artwork module did not become ready.");
  const browserVersion = await send("Browser.getVersion");
  console.log(`Browser: ${browserVersion.product}`);
  let manifest;
  if (!verifyOnly) {
    console.log("Generating Canvas artwork…");
    await evaluate("window.makeArtwork().then(files => { window.artwork = files; }, error => { window.artworkError = String(error.stack || error); }); 'started'");
    let images;
    for (let i = 0; i < 400; i++) {
      const state = await evaluate("({files:window.artwork,error:window.artworkError})");
      if (state.error) throw new Error(state.error);
      if (state.files) { images = state.files; break; }
      await sleep(100);
    }
    assert(images, "Artwork generation did not finish.");
    assert.equal(images.length, 8);
    await mkdir(output, { recursive: true });
    manifest = { formatVersion: 1, generator: "tools/orbital-art.mjs", seed: 421337,
      note: "Original local procedural assets. Concepts/thumbnail contain sample text and are static, not audio-reactive outputs.", files: [] };
    for (const info of images) {
      assert(/^[a-z0-9-]+\.(png|jpg)$/.test(info.name));
      const bytes = await readFile(join(output, info.name));
      manifest.files.push({ ...info, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  } else manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));

  const results = await evaluate(`(async () => {
    const {decodeImageFile} = await import('/assets.js');
    const files = ${JSON.stringify(manifest.files)};
    const results = [];
    for (const file of files) {
      const response = await fetch('/images/' + file.name);
      if (!response.ok) throw new Error('Missing image: ' + file.name);
      const blob = await response.blob();
      const image = new Image(); image.src = URL.createObjectURL(blob);
      await image.decode();
      const bitmap = await decodeImageFile(new File([blob], file.name, {type: file.mime}));
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap,0,0);
      const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let minAlpha=255,maxAlpha=0,minLuma=255,maxLuma=0,total=0;
      for (let i=0;i<pixels.length;i+=4) {
        minAlpha=Math.min(minAlpha,pixels[i+3]); maxAlpha=Math.max(maxAlpha,pixels[i+3]);
        const luma=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
        minLuma=Math.min(minLuma,luma); maxLuma=Math.max(maxLuma,luma); total+=luma;
      }
      results.push({name:file.name,width:image.naturalWidth,height:image.naturalHeight,
        loaderWidth:bitmap.width,loaderHeight:bitmap.height,minAlpha,maxAlpha,minLuma,maxLuma,meanLuma:total/(pixels.length/4)});
      bitmap.close(); URL.revokeObjectURL(image.src);
    }
    document.getElementById('status').textContent='Generated and verified: ' + files.length + ' images';
    const preview = document.createElement('img'); preview.src='/images/asset-sheet.jpg';
    preview.alt='Orbital static concept and text-free background alternatives'; preview.style.width='100%';
    document.body.append(preview); await preview.decode();
    return results;
  })()`);
  for (const file of manifest.files) {
    const bytes = await readFile(join(output, file.name));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    assert.equal(bytes.length, file.bytes);
    assert(bytes.length < 8 * 1024 * 1024, `Oversized: ${file.name}`);
    if (file.mime === "image/png") assert.equal(bytes.subarray(0,8).toString("hex"), "89504e470d0a1a0a");
    else assert.equal(bytes.subarray(0,3).toString("hex"), "ffd8ff");
    const result = results.find((item) => item.name === file.name);
    assert.equal(result.width, file.width); assert.equal(result.height, file.height);
    assert.equal(result.loaderWidth, file.width); assert.equal(result.loaderHeight, file.height);
    if (file.kind === "texture") {
      assert.equal(result.minAlpha, 0); assert(result.maxAlpha > 30 && result.maxAlpha < 255);
    } else {
      assert.equal(result.minAlpha,255); assert.equal(result.maxAlpha,255);
      assert(result.maxLuma - result.minLuma > 10, `Blank image: ${file.name}`);
    }
  }
  if (checkPrototype) {
    const downloadDir = join(profile, "downloads"); await mkdir(downloadDir);
    await send("Browser.setDownloadBehavior", {behavior:"allow",downloadPath:downloadDir});
    await send('Page.bringToFront');
    await send('Page.startScreencast',{format:'jpeg',quality:30,maxWidth:720,maxHeight:550});
    await send("Emulation.setDeviceMetricsOverride", {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
    await send("Page.navigate", {url:`${url}/prototypes/orbital/`});
    let prototypeReady = false;
    for (let i=0;i<100;i++) {
      if (await evaluate("window.orbitalPrototype?.ready === true")) {prototypeReady=true;break;}
      await sleep(100);
    }
    assert(prototypeReady, "Prototype failed to load.");
    const assertions = await evaluate(`(async () => {
      const $ = id => document.getElementById(id);
      const require = (ok, message) => {if(!ok) throw new Error(message);};
      const snap = () => $('scene').toDataURL();
      const set = (id,value) => {$(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));};
      require(!window.orbitalPrototype.getState().running,'Autoplay must be off');
      require(document.body.textContent.includes('synthetic energy curve'),'Simulation warning missing');
      const first=snap();
      set('title','NEW TRACK'); require(snap()!==first,'Title did not change pixels');
      set('title','ORBITAL'); require(snap()===first,'Title reset is not deterministic');
      set('message',''); require(snap()!==first,'Message did not clear');
      set('message','PURCHASE THIS TRACK FOR COMMERCIAL USE');
      for (const name of ['obsidian','umber']) {set('background',name);require(snap()!==first,'Background failed: '+name);}
      set('background','monochrome');require(snap()===first,'Background reset failed');
      set('rings','12'); require(snap()!==first,'Ring count did not change pixels'); set('rings','8');
      set('time','7.5'); const sought=snap(); require(sought!==first,'Time did not change pixels');
      set('time','2'); set('time','7.5'); require(snap()===sought,'Seek-history-dependent pixels');
      set('sensitivity','0'); require(snap()!==sought,'Sensitivity did not change pixels'); set('sensitivity','1');
      $('shuffle').click();require(window.orbitalPrototype.getState().seed!==421337,'Shuffle did not change seed');
      require(snap()!==sought,'Shuffle did not change pixels');
      $('play').click(); require(window.orbitalPrototype.getState().running,'Play failed');
      await new Promise(resolve=>setTimeout(resolve,250));
      $('play').click(); require(!window.orbitalPrototype.getState().running,'Pause failed');
      require(window.orbitalPrototype.getState().time>7.5,'Playback clock did not advance: '+JSON.stringify({state:window.orbitalPrototype.getState(),hidden:document.hidden,visibility:document.visibilityState}));
      $('reset').click(); require(window.orbitalPrototype.getState().time===0,'Reset failed');
      $('download').click();
      require(document.documentElement.scrollWidth<=innerWidth,'Desktop horizontal overflow');
      return {controls:true,deterministicSeek:true,playPauseReset:true,noAutoplay:true,desktopNoOverflow:true};
    })()`);
    let downloaded;
    for (let i=0;i<100;i++) {
      try {downloaded=await readFile(join(downloadDir,"orbital-prototype.png"));break;}
      catch(error) {if(error.code!=="ENOENT") throw error;await sleep(100);}
    }
    assert(downloaded, "PNG download missing.");
    assert.equal(downloaded.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.equal(downloaded.readUInt32BE(16),1920); assert.equal(downloaded.readUInt32BE(20),1080);
    await writeFile(join(root,'public/prototypes/orbital/downloaded-prototype.png'),downloaded);
    // Restore canonical sample content for review screenshots.
    await send("Page.navigate",{url:`${url}/prototypes/orbital/`});
    for(let i=0;i<100;i++){if(await evaluate('window.orbitalPrototype?.ready === true'))break;await sleep(100);}
    assert(await evaluate('window.orbitalPrototype?.ready === true'),'Reloaded prototype did not become ready');
    const desktop=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await writeFile(join(root,'public/prototypes/orbital/desktop-preview.png'),Buffer.from(desktop.data,'base64'));
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:1500,deviceScaleFactor:1,mobile:true});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile horizontal overflow');
    assert(await evaluate('!window.orbitalPrototype.getState().running'),'Reduced-motion autoplay');
    const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await writeFile(join(root,'public/prototypes/orbital/mobile-preview.png'),Buffer.from(mobile.data,'base64'));
    const prototypeReport = {browser:browserVersion.product,...assertions,mobileNoOverflow:true,reducedMotionPaused:true,pageFrames,
      downloadedPng:{path:'public/prototypes/orbital/downloaded-prototype.png',width:1920,height:1080,bytes:downloaded.length,sha256:createHash('sha256').update(downloaded).digest('hex')}};
    console.log('PROTOTYPE PASS:',JSON.stringify(prototypeReport));
    await writeFile(join(root,'public/prototypes/orbital/verification.json'),JSON.stringify({
      ...prototypeReport,assetChecks:results,externalPageRequests:external,uncaughtPageExceptions:failures,
      limitations:['Simulated energy, not audio analysis','No production MP4/render/upload integration','Not an independent visual-quality approval or performance benchmark']
    },null,2)+'\n');
  }
  assert.equal(failures.length, 0, JSON.stringify(failures));
  assert.equal(external.length, 0, `Unexpected external requests: ${external.join(", ")}`);
  console.log(JSON.stringify({ verified: results.length, totalBytes: manifest.files.reduce((n, f) => n+f.bytes, 0),
    externalRequests: external.length, results }, null, 2));
} finally {
  socket?.close(); chrome.kill("SIGTERM");
  for (let i = 0; i < 40 && chrome.exitCode === null && chrome.signalCode === null; i++) await sleep(100);
  if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill("SIGKILL");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
