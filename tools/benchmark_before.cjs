const paths=require('./paths.cjs');
/* Read-only baseline: retained pre-refactor snapshot, fixed seed/time/camera, no extra RAF chains. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {browserSession,until}=require('./test-support.cjs');
const pages=Object.keys(require(paths.data('acceptance-manifest.json')));
(async()=>{
  const browser=await browserSession(paths.root);const results=[];
  try{
    await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
      let seed=20261106;Math.random=()=>{seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
      localStorage.setItem('cosmos-quality','high');window.__nativeRAF=window.requestAnimationFrame.bind(window);const callbacks=new Map();let id=0;window.requestAnimationFrame=fn=>{callbacks.set(++id,fn);return id;};window.cancelAnimationFrame=id=>callbacks.delete(id);window.__legacyStep=time=>{const ready=[...callbacks.values()];callbacks.clear();ready.forEach(fn=>fn(time));};
    })();`});
    for(const page of pages)for(const [width,height]of [[1280,720],[360,800]]){
      await browser.viewport(width,height,width<500?2:1);await browser.send('Page.navigate',{url:browser.url('archive/baseline-20261106/'+page+'.html')});
      await until(async()=>{try{return await browser.evaluate(`document.readyState==='complete'&&decodeURIComponent(location.pathname).endsWith('/${page}.html')&&typeof render==='function'`);}catch{return false;}},'legacy '+page);
      const result=await browser.evaluate(`(async() => {
        isDragging=true;startTime=0;const gl=document.getElementById('glcanvas').getContext('webgl');
        const pixel=new Uint8Array(4),sync=()=>gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        for(let i=0;i<3;i++){await new Promise(__nativeRAF);__legacyStep(2000);sync();}const times=[];
        for(let i=0;i<24;i++){await new Promise(__nativeRAF);const start=performance.now();__legacyStep(2000+i*16.667);sync();times.push(performance.now()-start);}
        times.sort((a,b)=>a-b);const debug=gl.getExtension('WEBGL_debug_renderer_info');return {p50:times[12],p95:times[22],frames:24,longFrames:times.filter(t=>t>50).length,canvas:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},renderer:gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER),glError:gl.getError()};
      })()`);assert.equal(result.glError,0);results.push({page,viewport:{width,height},quality:'high',...result});console.log(page,width,result.p95);
    }
  }finally{await browser.close();}
  fs.writeFileSync(paths.evidence('benchmark-before.json'),JSON.stringify({date:'2026-11-06',method:'fixed seed/time/camera; original callbacks + synchronous 1-pixel readback completion barrier, wall time, 24 frames, one sample per native RAF matching current benchmark cadence',environment:{node:process.version,browser:browser.version},results},null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
