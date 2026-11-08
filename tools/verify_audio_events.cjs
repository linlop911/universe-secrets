const paths=require('./paths.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {browserSession,delay,until}=require('./test-support.cjs');
(async()=>{
 const b=await browserSession(paths.root),results=[];
 try{for(const [page,id]of [['index','btn-chirp'],['wormhole','btn-traverse'],['heatdeath','btn-rebirth']]){
  await b.viewport(640,420);await b.load(page+'.html');await b.evaluate(`Cosmos.setVolume(0);Cosmos.resume();document.getElementById('${id}').click()`);
  let mutedPeak=0;for(let i=0;i<8;i++){await delay(100);mutedPeak=Math.max(mutedPeak,(await b.evaluate('Cosmos.audioSample()')).peak);}assert.ok(mutedPeak<1e-5,page+' one-shot bypasses mute');
  await until(async()=>(await b.evaluate('Cosmos.info().audioNodes'))===0,'transient graph cleanup',8000);
  await b.evaluate(`Cosmos.setVolume(.5);document.getElementById('${id}').click()`);let peak=0,rms=0;
  for(let i=0;i<12;i++){await delay(100);const s=await b.evaluate('Cosmos.audioSample()');peak=Math.max(peak,s.peak);rms=Math.max(rms,s.rms);}assert.ok(rms>1e-5,page+' one-shot silent');assert.ok(peak<=1.05,page+' transient clips');
  await b.evaluate('Cosmos.pause()');await until(async()=>(await b.evaluate('Cosmos.info().audioStates')).every(s=>s==='suspended'),'one-shot pause');await b.evaluate('Cosmos.resume()');await until(async()=>(await b.evaluate('Cosmos.info().audioStates')).every(s=>s==='running'),'one-shot resume without continuous soundtrack');
  await until(async()=>(await b.evaluate('Cosmos.info().audioNodes'))===0,'post-play graph cleanup',8000);const info=await b.evaluate('Cosmos.info()');assert.equal(info.audioContexts,1);assert.equal(info.timerCount,0);results.push({page,mutedPeak,peak,rms,remainingNodes:info.audioNodes,contexts:info.audioContexts});console.log('PASS',page);
 }}finally{await b.close();}
 fs.writeFileSync(paths.evidence('audio-event-results.json'),JSON.stringify({passed:true,results},null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
