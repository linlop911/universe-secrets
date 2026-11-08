const paths=require('./paths.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const {browserSession}=require('./test-support.cjs'),manifest=require(paths.data('acceptance-manifest.json'));
(async()=>{
 const before=await browserSession(paths.root),after=await browserSession(paths.root),results=[];
 try{
  for(const page of Object.keys(manifest)){
   await before.viewport(1280,720);await before.load('archive/baseline-20261107/'+page+'.html');await before.evaluate('Cosmos.pause();Cosmos.setReduced(false)');
   await after.viewport(1280,720);await after.load(page+'.html');await after.evaluate('Cosmos.pause();Cosmos.setReduced(false)');
   for(const [width,height]of [[1280,720],[360,800]])for(const quality of ['high','low']){
    const row={page,viewport:{width,height,dpr:width<500?2:1},quality};
    for(const [version,b]of [['before',before],['after',after]]){
     await b.viewport(width,height,width<500?2:1);await b.evaluate(`Cosmos.setQuality('${quality}')`);const patch=page==='index'?{camRadius:8.2,camTheta:.22,camPhi:.85}:{};
     await b.evaluate(`Cosmos.benchmark(3,${JSON.stringify(patch)})`);row[version]=await b.evaluate(`Cosmos.benchmark(40,${JSON.stringify(patch)})`);
     row[version].canvas=await b.evaluate(`({width:document.getElementById('glcanvas').width,height:document.getElementById('glcanvas').height})`);
    }
    assert.deepEqual(row.before.canvas,row.after.canvas,'Canvas mismatch');for(const field of ['camRadius','camTheta','camPhi',...Object.values(manifest[page].parameters).map(p=>p.state)])assert.equal(row.before.model[field],row.after.model[field],page+' model mismatch: '+field);
    results.push(row);console.log(page,width,quality,'P95',row.before.p95.toFixed(2),'->',row.after.p95.toFixed(2));
   }
  }
 }finally{await before.close();await after.close();}
 const threshold=1.0;
 const regressions=results.filter(row=>row.after.p95>row.before.p95+threshold||row.after.longFrames>row.before.longFrames);
 const p95Drift=results.filter(row=>row.after.p95>row.before.p95).length;
 const passed=regressions.length===0;
 fs.writeFileSync(paths.evidence('upgrade-performance.json'),JSON.stringify({date:new Date().toISOString().slice(0,10),passed,thresholdMs:threshold,p95Regressions:p95Drift,regressions:regressions.map(r=>({page:r.page,viewport:r.viewport,quality:r.quality,deltaP95:r.after.p95-r.before.p95,longFrames:[r.before.longFrames,r.after.longFrames]})),method:'40 frames after 3 warmup frames; same native RAF cadence, parameter values, camera, seed, viewport, DPR and quality; draw + synchronous 1-pixel readback wall time',baseline:'archive/baseline-20261107',indexCamera:'8.2, .22, .85 for both versions; current landing camera is 14',environment:{node:process.version,browser:after.version},results},null,2)+'\n');
 console.log(JSON.stringify({passed,p95Regressions:p95Drift,overThreshold:regressions.length,thresholdMs:threshold}));
})().catch(error=>{console.error(error);process.exitCode=1;});
