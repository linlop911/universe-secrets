const paths=require('./paths.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {browserSession,delay,until}=require('./test-support.cjs'),source=require('./content-source.cjs');
const chapters=source.read('chapter-content.json'),manifest=source.read('asset-manifest.json'),voices=source.read('voiceover.json');
const http=process.env.TEST_USE_HTTP==='1',mode=http?'http':'file',out=paths.output('experience',mode);fs.mkdirSync(out,{recursive:true});
const report={date:new Date().toISOString().slice(0,10),mode,results:[]};let b;
async function check(page,name,fn){try{report.results.push({page,name,passed:true,evidence:await fn()});console.log('PASS',page,name);}catch(error){report.results.push({page,name,passed:false,error:error.stack});console.log('FAIL',page,name,error.message);if(b)await b.evaluate(`document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close())`);}}
(async()=>{try{
 await check('project','content freshness, asset contract and story rhythm',async()=>{
  assert.ok(!/requestAnimationFrame|setInterval|catch\s*\(|\?\./.test(fs.readFileSync(paths.app('experience.js'),'utf8')),'New feature contains an extra animation loop or speculative fallback');
  assert.equal(fs.readFileSync(paths.app('content.js'),'utf8'),source.contentScript(),'content.js is stale; run node tools/build_content.cjs');
  assert.equal(fs.readFileSync(paths.docs('六章分镜与旁白稿.md'),'utf8'),source.storyboard(),'storyboard is stale; run node tools/build_content.cjs');
  for(const asset of manifest.assets){
   assert.ok(fs.existsSync(paths.at(asset.localPath)),asset.localPath);
   assert.equal(fs.statSync(paths.at(asset.localPath)).size,asset.bytes,asset.id+': bytes');
   assert.ok(asset.credit&&asset.processing&&asset.supportsClaim&&asset.dimensions&&asset.institution,asset.id+': fields');
   if(asset.assetOrigin==='original')assert.ok(!asset.assetUrl,asset.id+': original diagram must not claim an external URL');
   else assert.ok(asset.assetUrl&&asset.assetUrl.startsWith('https://'),asset.id+': assetUrl');
  }
  const beats=[];
  for(const [id,chapter]of Object.entries(chapters)){
   assert.equal(chapter.frames.length,voices[id].length,id+': voice count');
   assert.equal(chapter.frames[0].at,0,id+': first beat');
   assert.ok(chapter.frames.at(-1).at<source.duration,id+': closing hold');
   assert.ok(voices[id].join('').length<=source.duration*4.5,id+': voice too long for the timeline');
   assert.ok(chapter.sourceUrl.startsWith('https://')&&chapter.assets.length,id+': source and assets');
   assert.ok(chapter.frames.every(frame=>frame.text&&frame.voice===undefined&&frame.camera.length===3),id+': source frames must not carry generated voice');
   beats.push(chapter.frames.length);
  }
  for(const [id,chapter]of Object.entries(source.load().chapters))chapter.frames.forEach((frame,index)=>assert.equal(frame.voice,voices[id][index],id+': generated voice mismatch'));
  return{chapters:Object.keys(chapters).length,assets:manifest.assets.length,beats,duration:source.duration,bytes:manifest.assets.reduce((n,a)=>n+a.bytes,0)};
 });
 b=await browserSession(paths.root,http);
 await check('all','English and Japanese on every chapter page',async()=>{
  const samples=[];
  for(const page of Object.keys(chapters)){
   for(const lang of ['en','ja']){
    await b.load(page+'.html','?lang='+lang+'&seed=20261106');await delay(150);
    const pack=source.load(lang).chapters[page];
    const sample=await b.evaluate(`(()=>({lang:document.documentElement.lang,question:document.getElementById('chapter-question').textContent,voice:document.getElementById('guide-voice').textContent,source:document.getElementById('chapter-source').textContent,switchText:document.querySelector('.language-switch .active').textContent,title:document.title}))()`);
    assert.equal(sample.lang,lang,page+': html lang');
    assert.equal(sample.question,pack.question,page+': translated question');
    assert.equal(sample.voice,pack.frames[0].voice,page+': translated first voice');
    assert.ok(sample.source.includes(pack.sourceLabel),page+': translated source label');
    assert.equal(sample.switchText,lang==='en'?'EN':'日',page+': active language link');
    assert.ok(lang==='en'?sample.title.includes('The Secrets of the Universe'):sample.title.includes('宇宙の秘密'),page+': translated title');
    samples.push({page,lang});
   }
  }
  return samples;
 });
 for(const [page,chapter]of Object.entries(chapters)){
  await b.viewport(1280,720);await b.load(page+'.html');await b.evaluate(`Cosmos.setReduced(false);Cosmos.setQuality('high');Cosmos.pause();Cosmos.setVolume(0)`);
  await check(page,'native official link and every local comparison',async()=>{
   assert.equal(await b.evaluate(`document.getElementById('chapter-source').href`),chapter.sourceUrl);await b.evaluate(`document.getElementById('open-observatory').click()`);assert.ok(await b.evaluate(`document.getElementById('observatory').open`));
   const assets=[];for(let index=0;index<chapter.assets.length;index++){const info=await b.evaluate(`(async()=>{document.querySelectorAll('.observation-tabs button')[${index}].click();const img=document.getElementById('observation-image');await img.decode();return {width:img.naturalWidth,height:img.naturalHeight,url:img.getAttribute('src'),credit:document.querySelector('.asset-credit').textContent,kind:document.querySelector('.observation-plate .asset-kind').textContent};})()`);assert.ok(info.width>100&&info.height>100);assert.equal(info.url,manifest.assets.find(a=>a.id===chapter.assets[index]).localPath);assert.ok(info.credit.length>5);assets.push(info);}
   await b.key('Escape');assert.equal(await b.evaluate(`document.getElementById('observatory').open`),false);assert.equal(await b.evaluate('document.activeElement.id'),'open-observatory');return assets;
  });
  await check(page,'new controls reachable at four viewports',async()=>{
   const evidence=[];for(const [width,height]of [[360,800],[390,844],[768,1024],[1920,1080]]){
    await b.viewport(width,height,width<500?2:1);
    for(const id of ['chapter-control','chapter-source','open-observatory','guide-play','guide-next','guide-exit']){const hit=await b.evaluate(`(()=>{const el=document.getElementById('${id}');const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,w:r.width,h:r.height,hit:document.elementFromPoint(x,y)===el};})()`);assert.ok(hit.x>0&&hit.x<width&&hit.y>0&&hit.y<height&&hit.hit,`${width}x${height} ${id}: ${JSON.stringify(hit)}`);}
    assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Body overflow');evidence.push({width,height});
    if(width===390||width===1920){await b.evaluate('Cosmos.capture(2)');const screen=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,page+'-'+width+'.png'),Buffer.from(screen.data,'base64'));}
   }return evidence;
  });
  await check(page,'guide frames, voice line, beats, manual control and reduced motion',async()=>{
   await b.viewport(1280,720);await b.evaluate('CosmicGuide.start()');const frames=[];
   for(const [index,frame]of chapter.frames.entries()){
    const sample=await b.evaluate(`(()=>{CosmicGuide.seek(${frame.at});return {guide:CosmicGuide.info(),title:document.getElementById('guide-title').textContent,voice:document.getElementById('guide-voice').textContent,beats:document.querySelectorAll('#guide-beats span').length,current:[...document.querySelectorAll('#guide-beats span')].findIndex(el=>el.classList.contains('is-current')),state:Cosmos.state,evidence:!document.querySelector('.guide-evidence').hidden};})()`);
    assert.equal(sample.title,frame.title);assert.equal(sample.voice,voices[page][index],page+': voice not connected to the guide');
    assert.equal(sample.beats,chapter.frames.length);assert.equal(sample.current,index,page+': beat indicator');
    assert.equal(sample.guide.time,frame.at);assert.equal(sample.evidence,Boolean(frame.evidence));assert.equal(sample.state.camRadius,frame.camera[0]);
    frames.push({time:frame.at,title:frame.title,voice:sample.voice,evidence:sample.evidence});
   }
   await b.evaluate(`CosmicGuide.seek(16);const core=document.getElementById('chapter-control');core.value=core.min;core.dispatchEvent(new Event('input',{bubbles:true}));`);assert.equal((await b.evaluate('CosmicGuide.info()')).status,'paused');assert.equal(await b.evaluate(`Number(document.getElementById('${chapter.core}').value)`),Number(await b.evaluate(`document.getElementById('chapter-control').min`)));
   await b.evaluate(`CosmicGuide.start();document.getElementById('btn-toggle-hud').click()`);await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:600,y:350,button:'left',clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:600,y:350,button:'left',clickCount:1});assert.equal((await b.evaluate('CosmicGuide.info()')).status,'paused');await b.evaluate(`document.getElementById('restore-hud').click();CosmicGuide.start()`);
   const generation=await b.evaluate('Cosmos.info().generation');await b.evaluate(`window.__tourContext=document.getElementById('glcanvas').getContext('webgl').getExtension('WEBGL_lose_context');window.__tourContext.loseContext()`);await until(async()=>await b.evaluate(`Cosmos.info().status==='lost'`),'guide context loss');const heldTime=await b.evaluate('CosmicGuide.info().time');await delay(100);assert.equal(await b.evaluate('CosmicGuide.info().time'),heldTime);await b.evaluate('window.__tourContext.restoreContext()');await until(async()=>await b.evaluate(`Cosmos.info().generation>${generation}`),'guide context restoration');assert.equal((await b.evaluate('CosmicGuide.info()')).status,'playing');
   await b.evaluate('CosmicGuide.stop();Cosmos.setReduced(true);CosmicGuide.start()');await delay(180);assert.equal((await b.evaluate('CosmicGuide.info()')).status,'reading');assert.equal((await b.evaluate('CosmicGuide.info()')).time,0);await b.evaluate('CosmicGuide.next()');assert.equal((await b.evaluate('CosmicGuide.info()')).step,1);await b.evaluate('CosmicGuide.stop();Cosmos.setReduced(false)');
   return frames;
  });
  await check(page,'guide respects runtime pause and evidence screenshot',async()=>{
   await b.evaluate('CosmicGuide.start()');assert.equal(await b.evaluate(`document.getElementById('pause-scene').textContent`),'暂停画面');await delay(120);await b.evaluate('Cosmos.pause()');assert.equal(await b.evaluate(`document.getElementById('pause-scene').textContent`),'继续播放');const held=await b.evaluate('CosmicGuide.info().time');await delay(180);assert.equal(await b.evaluate('CosmicGuide.info().time'),held);
   await b.viewport(1280,720);await b.evaluate('CosmicGuide.seek(40);Cosmos.capture(2)');const screen=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,page+'-evidence.png'),Buffer.from(screen.data,'base64'));await b.evaluate('CosmicGuide.stop()');assert.deepEqual(b.failures,[]);assert.deepEqual(b.externalRequests,[]);return{pausedTime:held,uncaught:b.failures.length,externalRequests:b.externalRequests.length,navigationScope:b.navigations};
  });
 }
}catch(error){report.results.push({page:'runner',name:'fatal',passed:false,error:error.stack});console.error(error);}finally{
 if(b)await b.close();report.passed=report.results.every(r=>r.passed);report.counts={passed:report.results.filter(r=>r.passed).length,failed:report.results.filter(r=>!r.passed).length};fs.writeFileSync(paths.evidence('experience-results-'+mode+'.json'),JSON.stringify(report,null,2)+'\n');console.log(report.counts);if(!report.passed)process.exitCode=1;
}})();
