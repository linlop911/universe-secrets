const paths=require('./paths.cjs');
/* Native CDP acceptance suite. Node.js 22+ and an installed Chromium browser. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {browserSession,until,delay}=require('./test-support.cjs');
const manifest=require(paths.data('acceptance-manifest.json')),science=require(paths.data('science-content.json')),source=require('./content-source.cjs');
const useHttp=process.env.TEST_USE_HTTP==='1',core=process.env.TEST_CORE==='1';
const mode=useHttp?'http':'file',out=paths.output('acceptance',mode);
fs.mkdirSync(out,{recursive:true});
const report={date:new Date().toISOString().slice(0,10),mode,profile:core?'core':'full',started:new Date().toISOString(),results:[],environment:{},limits:['Physical mobile hardware and human listening are not automated.','Pixel hashes are compared on this browser/GPU; they are not cross-GPU golden images.']};
async function check(page,name,fn){try{const evidence=await fn();report.results.push({page,name,passed:true,evidence});console.log('PASS',page,name);}catch(error){report.results.push({page,name,passed:false,error:error.message});console.log('FAIL',page,name,error.message);if(page==='project'&&process.env.TEST_FAULT==='stale')throw Error('Fatal injected fault: '+error.message);if(b)try{await b.evaluate(`document.getElementById('btn-close-modal')?.click();document.getElementById('restore-hud')?.click();`);}catch{}}}
let b;
const evaluate=expression=>b.evaluate(expression);
const capture=(controls={},scene={})=>evaluate(`Cosmos.capture(2,${JSON.stringify(controls)},${JSON.stringify(scene)})`);
function comparePixels(a,b){
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);const x=Buffer.from(a.pixelData,'base64'),y=Buffer.from(b.pixelData,'base64');assert.equal(x.length,y.length);
  let maxDelta=0,changed=0;for(let i=0;i<x.length;i+=4){let different=false;for(let k=0;k<3;k++){const delta=Math.abs(x[i+k]-y[i+k]);maxDelta=Math.max(maxDelta,delta);if(delta)different=true;}if(different)changed++;}
  const changedFraction=changed/(a.width*a.height);assert.ok(maxDelta<=1&&changedFraction<=.0001,`Fixed-frame pixel mismatch: max delta ${maxDelta}, changed ${changedFraction}`);return {exact:a.hash===b.hash,maxDelta,changedPixels:changed,changedFraction,tolerance:'<=1/255 per channel on <=0.01% pixels; same browser/GPU'};
}
async function ready(){await until(async()=>{try{return (await evaluate('Cosmos.info()')).status==='ready';}catch{return false;}},'renderer ready');}
async function main(){
  await check('project','static integrity',async()=>{
    const expected=process.env.TEST_FAULT==='stale'?source.contentScript()+'\n/* injected source drift */':source.contentScript();
    assert.equal(fs.readFileSync(paths.app('content.js'),'utf8'),expected,'content.js is stale; run node tools/build_content.cjs');
    assert.equal(fs.readFileSync(paths.docs('六章分镜与旁白稿.md'),'utf8'),source.storyboard(),'storyboard is stale; run node tools/build_content.cjs');
    for(const page of Object.keys(manifest)){
      const html=fs.readFileSync(paths.page(page+'.html'),'utf8');
      for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
        if(/^(https?:|data:)/.test(match[1]))continue;
        assert.ok(fs.existsSync(paths.at(match[1])),'Missing asset '+match[1]);
      }
      const body=html.replace(/<script\b[\s\S]*?<\/script>/gi,'');
      assert.ok(!/\$[^$]+\$/.test(body),'Unrendered TeX in '+page);
      assert.ok(!/99\.2%|100% 相对论严密解|四阶 Runge-Kutta|直接严密对标|严格根据/.test(body),'Unsupported accuracy claim in '+page);
      assert.ok(!/requestAnimationFrame/.test(fs.readFileSync(paths.chapters(page+'.js'),'utf8')),'Scene owns a duplicate RAF chain');
      for(const id of science.chapters[page].sources)assert.ok(science.sources[id]?.url,'Missing source '+id);
    }
    return {pages:Object.keys(manifest).length,parameters:Object.values(manifest).reduce((n,m)=>n+Object.keys(m.parameters).length,0),nativeMathML:true,contentFresh:true,navigationScope:'whole session'};
  });
  async function newSession(){
  b=await browserSession(paths.root,useHttp);report.environment={node:process.version,browser:b.version,executable:b.executable,chapterIsolation:'independent browser/profile; input emulation isolated across chapter navigation'};
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
    const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window),pending=new Set();
    window.__rafPending=pending;window.requestAnimationFrame=fn=>{const id=request(time=>{pending.delete(id);fn(time);});pending.add(id);return id;};window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id);};
    const start=OscillatorNode.prototype.start;window.__audioStarts=[];OscillatorNode.prototype.start=function(time=0){window.__audioStarts.push({time,now:this.context.currentTime,frequency:this.frequency.value});if(window.__audioStarts.length>512)window.__audioStarts.shift();return start.call(this,time);};
  })();`});
  }
  await newSession();
  if(process.env.TEST_FAULT==='navigation')await b.load('__missing__.html');
  if(process.env.TEST_FAULT==='shader'){await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`WebGLRenderingContext.prototype.getShaderParameter=()=>false;`});await b.load('index.html');}
  for(const [page,configuration]of Object.entries(manifest)){
    if(page!==Object.keys(manifest)[0]){await b.close();await newSession();}
    try{
      await b.viewport(640,420);await b.load(page+'.html');await evaluate(`Cosmos.setQuality('high');Cosmos.setReduced(false);Cosmos.pause()`);
    }catch(error){await check(page,'load',()=>{throw error;});continue;}
    await check(page,'WebGL and deterministic frame',async()=>{
      const info=await evaluate('Cosmos.info()');assert.equal(info.status,'ready');assert.ok(info.linked);assert.ok(info.programCount>=1);assert.equal(info.rafPending,false);
      const first=await evaluate('Cosmos.capture(2,{},{},true)'),second=await evaluate('Cosmos.capture(2,{},{},true)');assert.equal(first.glError,0);const repeat=comparePixels(first,second);assert.ok(first.maxBrightness>15,'Default scene has no visible pixels');
      await b.load(page+'.html');await evaluate(`Cosmos.setQuality('high');Cosmos.pause()`);const reloaded=await evaluate('Cosmos.capture(2,{},{},true)');const reload=comparePixels(first,reloaded);delete first.pixelData;
      return {sample:first,repeat,reload,renderer:info.renderer};
    });
    await check(page,'all parameter endpoints change their documented model',async()=>{
      const inputs=await evaluate(`Object.fromEntries([...document.querySelectorAll('input[id^="param-"]')].map(el=>[el.id,{min:Number(el.min),max:Number(el.max),value:Number(el.value)}]))`);
      assert.deepEqual(Object.keys(inputs).sort(),Object.keys(configuration.parameters).sort(),'Parameter manifest does not cover every control');
      const evidence={};
      for(const [id,p]of Object.entries(configuration.parameters)){
        const min=await capture({...p.controls,[id]:inputs[id].min},p.scene||{}),max=await capture({...p.controls,[id]:inputs[id].max},p.scene||{});
        assert.equal(min.glError,0);assert.equal(max.glError,0);assert.equal(min.state[p.state],inputs[id].min,id+' minimum state');assert.equal(max.state[p.state],inputs[id].max,id+' maximum state');
        if(p.effect==='physical-readout'){assert.notDeepEqual(min.telemetry,max.telemetry,id+' did not change physical readouts');assert.equal(min.hash,max.hash,'Normalized black-hole shape should be mass-invariant');}
        else assert.notEqual(min.hash,max.hash,id+' has no pixel effect in its documented scene');
        const normal=await capture({...p.controls,[id]:inputs[id].value},p.scene||{});assert.equal(normal.glError,0);assert.equal(normal.state[p.state],inputs[id].value);
        await evaluate(`Cosmos.setQuality('low')`);const lowMin=await capture({...p.controls,[id]:inputs[id].min},p.scene||{}),lowMax=await capture({...p.controls,[id]:inputs[id].max},p.scene||{});assert.equal(lowMin.glError,0);assert.equal(lowMax.glError,0);if(p.effect!=='physical-readout')assert.notEqual(lowMin.hash,lowMax.hash,id+' lost its effect at low quality');await evaluate(`Cosmos.setQuality('high')`);
        evidence[id]={min:inputs[id].min,default:inputs[id].value,max:inputs[id].max,state:p.state,minHash:min.hash,defaultHash:normal.hash,maxHash:max.hash,lowMinHash:lowMin.hash,lowMaxHash:lowMax.hash,effect:p.effect||'visual'};
      }
      if(page==='heatdeath'){
        for(const value of [-1.8,-1.01,-1,-.99,-.8,-.5]){await capture({'param-w':value});const text=await evaluate(`(() => {const el=document.getElementById('param-w');el.value='${value}';el.dispatchEvent(new Event('input',{bubbles:true}));return document.getElementById('val-w').textContent;})()`);assert.ok(text.includes('主导：加速'),text);}
      }
      return evidence;
    });
    await check(page,'chapter mode, stage and toggle buttons',async()=>{
      const evidence=await evaluate(`(() => {
        const result=[];
        for(const button of document.querySelectorAll('button[data-mode],button[data-spec]')){button.click();const expected=Number(button.dataset.mode??button.dataset.spec),state=Cosmos.state;result.push({button:button.textContent.trim(),expected,actual:button.hasAttribute('data-mode')?state.currentMode:state.spectralMode});}
        const first=document.querySelector('button[data-mode],button[data-spec]');if(first)first.click();
        const slider=document.querySelector('#param-epoch,#param-stage'),original=slider?.value;
        for(const button of document.querySelectorAll('button[data-step]')){button.click();const state=Cosmos.state;result.push({button:button.textContent.trim(),expected:Number(button.dataset.step),actual:state.targetEpoch??state.targetStage});}
        if(slider){slider.value=original;slider.dispatchEvent(new Event('input',{bubbles:true}));}
        const toggles={'btn-director':'directorMode','btn-autoplay':'autoplay','btn-doppler':'dopplerActive','btn-spikes':'jwstSpikes','btn-penrose':'penroseActive','btn-synapse':'synapseActive','btn-scan':'showScan','btn-stars':'showStars','btn-beam':'showBeam'};
        for(const [id,key]of Object.entries(toggles)){const button=document.getElementById(id);if(!button)continue;const a=Cosmos.state[key];button.click();const b=Cosmos.state[key];button.click();result.push({button:id,toggle:true,changed:a!==b,restored:Cosmos.state[key]===a});}
        return result;
      })()`);for(const result of evidence)if(result.toggle){assert.ok(result.changed,result.button);assert.ok(result.restored,result.button);}else assert.equal(result.actual,result.expected,result.button);return evidence;
    });
    await check(page,'stages stay visible without additive whiteout',async()=>{
      const stageId=configuration.parameters['param-epoch']?'param-epoch':configuration.parameters['param-stage']?'param-stage':null;
      const maxStage=stageId?await evaluate(`Number(document.getElementById('${stageId}').max)`):0;
      const frames=[];for(const quality of ['high','low']){await evaluate(`Cosmos.setQuality('${quality}')`);for(const stage of stageId?Array.from({length:Math.floor(maxStage)+1},(_,i)=>i):[null]){
        const frame=await capture(stageId?{[stageId]:stage}:{});assert.equal(frame.glError,0);assert.ok(frame.maxBrightness>15,'Blank stage');assert.ok(frame.saturatedFraction<.15,'Additive whiteout');frames.push({quality,stage,hash:frame.hash,coverage:frame.coverage,mean:frame.meanBrightness,saturated:frame.saturatedFraction});
      }}await evaluate(`Cosmos.setQuality('high')`);return frames;
    });
    await check(page,'navigation, dialog keyboard, HUD and labels',async()=>{
      const links=await evaluate(`(() => {const modal=document.getElementById('modal-box');document.getElementById('btn-modal').click();return {links:[...document.querySelectorAll('.nav-tab')].map(a=>a.getAttribute('href')),active:document.querySelectorAll('.nav-tab[aria-current="page"]').length,open:modal.classList.contains('open'),focus:document.activeElement.id,role:modal.getAttribute('role'),labels:[...document.querySelectorAll('input[type=range]')].every(el=>el.labels?.length||el.getAttribute('aria-label'))};})()`);
      assert.equal(links.links.length,6);assert.equal(links.active,1);assert.equal(links.open,true);assert.equal(links.focus,'btn-close-modal');assert.equal(links.role,'dialog');assert.ok(links.labels);
      await evaluate(`[...document.querySelectorAll('#modal-box a')].at(-1).focus()`);await b.key('Tab');assert.equal(await evaluate('document.activeElement.id'),'btn-close-modal','Dialog focus escaped');
      await b.key('Escape');assert.equal(await evaluate(`document.getElementById('modal-box').classList.contains('open')`),false);assert.equal(await evaluate('document.activeElement.id'),'btn-modal');
      await evaluate(`document.getElementById('btn-toggle-hud').click()`);assert.equal(await evaluate(`document.getElementById('hud-layer').inert`),true);
      await evaluate(`document.getElementById('restore-hud').click()`);assert.equal(await evaluate(`document.getElementById('hud-layer').inert`),false);
      return links;
    });
    await check(page,'pointer, pinch, cancellation and scene keyboard',async()=>{
      await evaluate(`Cosmos.pause();document.getElementById('btn-toggle-hud').click()`);
      await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      assert.equal(await evaluate(`document.elementFromPoint(300,230)?.id`),'glcanvas','Canvas touch target is covered');
      const initial=await evaluate('Cosmos.state');
      await b.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
      await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:300,y:230,id:1}]});await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:360,y:245,id:1}]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const dragged=await evaluate('Cosmos.state');assert.ok(Math.abs(dragged.camPhi-initial.camPhi)>.1,'Touch did not rotate scene');assert.equal(dragged.isDragging,false);
      await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:250,y:220,id:1},{x:350,y:220,id:2}]});
      await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:240,y:220,id:1},{x:360,y:220,id:2}]});
      await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:220,y:220,id:1},{x:380,y:220,id:2}]});
      await b.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      const pinched=await evaluate('Cosmos.state');assert.ok(pinched.camRadius<dragged.camRadius,'Pinch did not zoom');assert.equal(pinched.isDragging,false);
      await b.send('Emulation.setTouchEmulationEnabled',{enabled:false});await evaluate(`document.getElementById('glcanvas').focus()`);await b.key('ArrowRight');assert.ok((await evaluate('Cosmos.state.camPhi'))>pinched.camPhi);
      await evaluate(`document.getElementById('restore-hud').click()`);
      const camera=await evaluate('Cosmos.state');await evaluate(`document.getElementById('controls-panel').dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true}));`);assert.equal((await evaluate('Cosmos.state')).camRadius,camera.camRadius,'Panel scrolling changed camera');
      return {initial:{yaw:initial.camPhi,radius:initial.camRadius},dragged:{yaw:dragged.camPhi},pinched:{radius:pinched.camRadius}};
    });
    await check(page,'four viewports and every reachable control',async()=>{
      const evidence=[];
      for(const [width,height]of [[360,800],[390,844],[768,1024],[1920,1080]]){
        await b.viewport(width,height,width<500?2:1);await evaluate(`document.getElementById('controls-panel').open=true;document.getElementById('science-panel').open=${width>=700};`);
        const samples=await capture();assert.ok(samples.width*samples.height<=2100000,'Pixel budget exceeded');assert.equal(samples.glError,0);
        const ids=await evaluate(`[...document.querySelectorAll('input[id^="param-"],#btn-audio,#btn-modal,#quality,#pause-scene')].map(el=>el.id)`);
        for(const id of ids){
          const r=await evaluate(`(() => {const el=document.getElementById(${JSON.stringify(id)});el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();const x=Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)),y=Math.max(0,Math.min(innerHeight-1,r.y+r.height/2));return {x:r.x,y:r.y,w:r.width,h:r.height,hit:document.elementFromPoint(x,y)===el||el.contains(document.elementFromPoint(x,y))};})()`);
          assert.ok(r.w>0&&r.h>0&&r.x<width&&r.x+r.w>0&&r.y<height&&r.y+r.h>0&&r.hit,`${width}x${height} ${id} unreachable: ${JSON.stringify(r)}`);
        }
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),'Horizontal body overflow');
        evidence.push({width,height,renderWidth:samples.width,renderHeight:samples.height,checkedControls:ids.length});
        if(width===390||width===1920){await capture();const screenshot=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`${page}-${width}.png`),Buffer.from(screenshot.data,'base64'));}
      }
      await b.viewport(640,420);return evidence;
    });
    await check(page,'quality levels, governor hysteresis and reduced motion',async()=>{
      const samples={};for(const level of ['high','medium','low']){await evaluate(`Cosmos.setQuality('${level}')`);samples[level]=await capture();assert.ok(samples[level].width*samples[level].height<=({low:600000,medium:1200000,high:2100000}[level]));}
      assert.ok(samples.low.width<samples.high.width);
      const governor=await evaluate(`(() => {Cosmos.setQuality('auto');const now=100000;Cosmos.observeQuality(45,now);Cosmos.observeQuality(45,now+1000);const before=Cosmos.settings.effective;Cosmos.observeQuality(45,now+2000);const after=Cosmos.settings.effective;Cosmos.observeQuality(45,now+2100);const held=Cosmos.settings.effective;Cosmos.observeQuality(16.67,now+6000);Cosmos.observeQuality(16.67,now+18001);const promoted=Cosmos.settings.effective;Cosmos.setQuality('high');Cosmos.setReduced(true);return {before,after,held,promoted};})()`);
      assert.equal(governor.before,'high');assert.equal(governor.after,'medium');assert.equal(governor.held,'medium');assert.equal(governor.promoted,'high');
      const a=await capture();const later=await evaluate('Cosmos.capture(5)');assert.equal(a.hash,later.hash,'Reduced motion still animates shader time');await evaluate('Cosmos.setReduced(false)');return {governor,samples:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,{width:v.width,height:v.height,hash:v.hash}]))};
    });
    await check(page,'three context losses preserve model and resources',async()=>{
      await evaluate(`Cosmos.pause()`);const id=Object.keys(configuration.parameters)[0];await evaluate(`(() => {const input=document.getElementById('${id}');input.value=input.max;input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      const before=await evaluate('Cosmos.info()'),value=await evaluate(`document.getElementById('${id}').value`);
      for(let i=0;i<3;i++){
        const generation=await evaluate('Cosmos.info().generation');
        await evaluate(`(() => {const ext=document.getElementById('glcanvas').getContext('webgl').getExtension('WEBGL_lose_context');if(!ext)throw Error('WEBGL_lose_context unavailable');window.__restoreGL=ext;ext.loseContext();})()`);
        await until(async()=>await evaluate(`Cosmos.info().status==='lost'`),'context loss');assert.equal(await evaluate('Cosmos.info().rafPending'),false);
        await evaluate('window.__restoreGL.restoreContext()');await until(async()=>await evaluate(`Cosmos.info().status==='ready' && Cosmos.info().generation>${generation}`),'context restoration');
        await evaluate('Cosmos.pause()');assert.equal(await evaluate(`document.getElementById('${id}').value`),value);const after=await evaluate('Cosmos.info()');assert.equal(after.programCount,before.programCount);assert.equal(after.resourceCount,before.resourceCount);assert.equal(after.rafPending,false);assert.equal((await capture()).glError,0);
      }
      return {generations:3,programs:before.programCount,resources:before.resourceCount};
    });
    await check(page,'single RAF and background visibility lifecycle',async()=>{
      await evaluate(`Cosmos.resume();for(let i=0;i<20;i++)Cosmos.resume()`);assert.equal(await evaluate('__rafPending.size'),1,'Duplicate RAF callbacks');
      await delay(100);await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`);
      const hidden=await evaluate('Cosmos.info()');await delay(220);const held=await evaluate('Cosmos.info()');assert.equal(held.elapsed,hidden.elapsed);assert.equal(held.frameCount,hidden.frameCount);assert.equal(await evaluate('__rafPending.size'),0);
      await evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))`);await delay(90);const restored=await evaluate('Cosmos.info()');assert.ok(restored.elapsed-hidden.elapsed<180,'Hidden time jumped into animation');assert.equal(await evaluate('__rafPending.size'),1);await evaluate('Cosmos.pause()');assert.equal(await evaluate('__rafPending.size'),0);
      return {visibility:'deterministic visibilitychange injection',hiddenElapsed:hidden.elapsed,resumedElapsed:restored.elapsed};
    });
    if(!core){
      await check(page,'audio signal, mute, repeat toggle and bounded nodes',async()=>{
        await evaluate(`Cosmos.setVolume(.5);Cosmos.resume();document.getElementById('btn-audio').click()`);
        let peak=0,rms=0;for(let i=0;i<12;i++){await delay(100);const s=await evaluate('Cosmos.audioSample()');peak=Math.max(peak,s.peak);rms=Math.max(rms,s.rms);}
        assert.ok(rms>1e-7,'No measurable output signal');assert.ok(peak<1.05,'Audio output clips');
        await evaluate('Cosmos.pause()');await until(async()=>(await evaluate('Cosmos.info().audioStates')).every(s=>s==='suspended'),'audio suspend');await evaluate('Cosmos.resume()');await until(async()=>(await evaluate('Cosmos.info().audioStates')).every(s=>s==='running'),'audio resume');
        let schedule=null;
        if(page==='stellar'){
          const intervals=[];for(const hz of [10,40]){await evaluate(`(() => {window.__audioStarts=[];const input=document.getElementById('param-spin');input.value='${hz}';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(500);const starts=await evaluate('__audioStarts');assert.ok(starts.length>=3);const errors=starts.slice(2).map((event,i)=>Math.abs(event.time-starts[i+1].time-1/hz));assert.ok(errors.every(e=>e<1e-8),'AudioContext pulse interval drift');intervals.push({hz,pulses:starts.length,maxIntervalError:Math.max(...errors),lookahead:Math.max(...starts.map(e=>e.time-e.now))});}schedule=intervals;
        }
        const recording=await evaluate('Cosmos.recordAudio(500)');fs.writeFileSync(path.join(out,page+'.webm'),Buffer.from(recording.base64,'base64'));
        await evaluate('Cosmos.setVolume(0)');await delay(700);assert.ok((await evaluate('Cosmos.audioSample()')).peak<1e-4,'Volume zero did not mute output');
        await evaluate(`Cosmos.setVolume(.5);document.getElementById('btn-audio').click()`);await delay(700);
        const before=await evaluate('Cosmos.info()');
        for(let i=0;i<8;i++){await evaluate(`document.getElementById('btn-audio').click();document.getElementById('btn-audio').click()`);}
        await delay(700);const after=await evaluate('Cosmos.info()');assert.equal(after.audioContexts,before.audioContexts,'Audio contexts accumulate');assert.ok(after.audioNodes<=before.audioNodes+2,'Audio nodes accumulate across toggles');
        await evaluate('Cosmos.pause()');return {peak,rms,schedule,recordingBytes:Buffer.from(recording.base64,'base64').length,beforeNodes:before.audioNodes,afterNodes:after.audioNodes};
      });
      await check(page,'measured GPU performance at desktop and phone viewport',async()=>{
        const measurements=[];for(const [width,height]of [[1280,720],[360,800]]){await b.viewport(width,height,width<500?2:1);for(const level of ['high','low']){await evaluate(`Cosmos.setQuality('${level}')`);const sample=await capture();const timing=await evaluate('Cosmos.benchmark(24)');assert.ok(Number.isFinite(timing.p95)&&timing.frames===24);measurements.push({viewport:{width,height},quality:level,canvas:{width:sample.width,height:sample.height},...timing});}}
        await b.viewport(640,420);await evaluate(`Cosmos.setQuality('high')`);return measurements;
      });
    }
    await check(page,'no external runtime requests or uncaught exceptions',async()=>{assert.deepEqual(b.externalRequests,[]);assert.deepEqual(b.failures,[]);return {externalRequests:b.externalRequests.length,uncaught:b.failures.length,navigationScope:b.navigations};});
  }
  await check('wormhole','traversal toggles once and reduced motion completes',async()=>{
    await b.load('wormhole.html');await evaluate(`Cosmos.setReduced(false);Cosmos.resume();document.getElementById('btn-traverse').click()`);
    const initial=await evaluate('Cosmos.state.inUniverseB');await until(async()=>!(await evaluate('Cosmos.state.isTraversing')),'traversal completion',15000);const crossed=await evaluate('Cosmos.state.inUniverseB');assert.equal(crossed,1-initial);await delay(200);assert.equal(await evaluate('Cosmos.state.inUniverseB'),crossed);
    await evaluate(`Cosmos.setReduced(true);document.getElementById('btn-traverse').click()`);await until(async()=>!(await evaluate('Cosmos.state.isTraversing')),'reduced traversal');assert.equal(await evaluate('Cosmos.state.inUniverseB'),initial);await evaluate(`Cosmos.setReduced(false);Cosmos.pause()`);return {initial,crossed,returned:initial};
  });
  await check('project','sonification geometry and scale',async()=>{
    await b.load('cosmicweb.html');
    const events=await evaluate(`CosmosMath.scanEvents([[0,0,0],[.5,.5,0],[-.8,0,0]],new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),.4,.8,0,1,0)`);
    assert.equal(events.length,2);assert.equal(events[0].pan,0);assert.equal(events[0].frequency,261.63);assert.equal(events[1].pan,.5);assert.ok(events[1].frequency>events[0].frequency);assert.ok(events.every(e=>e.intensity>=.6&&e.intensity<=1));
    const changed=await evaluate(`(() => {const m=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);return {a:CosmosMath.scanEvents([[0,0,0]],m,.4,.8),b:CosmosMath.scanEvents([[0,.8,0]],m,.4,.8),again:CosmosMath.scanEvents([[0,0,0]],m,.4,.8),outside:CosmosMath.scanEvents([[-.8,0,0]],m,.4,.8)};})()`);assert.deepEqual(changed.a,changed.again);assert.ok(changed.b[0].frequency>changed.a[0].frequency);assert.deepEqual(changed.outside,[]);return {events,changed};
  });
  const injections=[
    {name:'WebGL unavailable',source:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};`},
    {name:'Shader compile',source:`const original=WebGLRenderingContext.prototype.getShaderParameter;WebGLRenderingContext.prototype.getShaderParameter=function(shader,param){return param===this.COMPILE_STATUS?false:original.call(this,shader,param);};`},
    {name:'WebGL program link',source:`const original=WebGLRenderingContext.prototype.getProgramParameter;WebGLRenderingContext.prototype.getProgramParameter=function(program,param){return param===this.LINK_STATUS?false:original.call(this,program,param);};`}
  ];
  for(const page of Object.keys(manifest))for(const injection of injections){
    await check(page,'fault injection: '+injection.name,async()=>{
      const script=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:injection.source});
      try{
        await b.send('Page.navigate',{url:b.url(page+'.html')});
        await until(async()=>{try{return await evaluate(`document.readyState==='complete'&&window.Cosmos?.info().status==='error'`);}catch{return false;}},injection.name);
        const state=await evaluate('Cosmos.info()');assert.ok(state.errors.some(e=>e.includes(injection.name)));assert.equal(state.rafPending,false);assert.equal(state.resourceCount,0);assert.ok(await evaluate(`!!document.getElementById('render-error')`));return {status:state.status,diagnostic:state.errors[0],resources:state.resourceCount};
      }finally{await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier});}
    });
  }
}
(async()=>{
  try{await main();}catch(error){report.results.push({page:'runner',name:'fatal',passed:false,error:error.stack});console.error(error);}
  finally{
    try{if(b)await b.close();}catch(error){report.results.push({page:'runner',name:'cleanup',passed:false,error:error.message});}
    report.finished=new Date().toISOString();report.passed=report.results.every(r=>r.passed);
    report.counts={passed:report.results.filter(r=>r.passed).length,failed:report.results.filter(r=>!r.passed).length};
    fs.writeFileSync(process.env.TEST_REPORT||paths.evidence(mode==='http'?'test-results-http.json':'test-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report.counts));if(!report.passed)process.exitCode=1;
  }
})();
