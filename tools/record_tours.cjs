const paths=require('./paths.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {browserSession,delay,until}=require('./test-support.cjs'),chapters=require(paths.data('chapter-content.json'));
const ffmpeg=paths.ffmpeg();
const output=paths.output('tours');fs.mkdirSync(output,{recursive:true});
(async()=>{const selected=process.env.TOUR_PAGE?[process.env.TOUR_PAGE]:Object.keys(chapters),recordings=process.env.TOUR_PAGE?require(paths.evidence('tour-recordings.json')).recordings.filter(r=>!selected.includes(r.page)):[];
 for(const page of selected){
  const b=await browserSession(paths.root,true),directory=path.join(output,page+'-frames');fs.mkdirSync(directory,{recursive:true});
  const frames=[],ackErrors=[];let unsubscribe;
  try{
   await b.viewport(1280,720);await b.load(page+'.html');await b.evaluate(`Cosmos.setQuality('medium');Cosmos.setReduced(false);Cosmos.setVolume(.5);Cosmos.resume();document.getElementById('btn-audio').click()`);
   await b.evaluate(`window.__tourAudio=Cosmos.recordAudio(46500).then(result=>window.__tourRecording=result);true`);
   unsubscribe=b.on('Page.screencastFrame',event=>{const filename='frame-'+String(frames.length).padStart(5,'0')+'.jpg';fs.writeFileSync(path.join(directory,filename),Buffer.from(event.data,'base64'));frames.push({filename,time:event.metadata.timestamp});b.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(error=>ackErrors.push(error.message));});
   await b.send('Page.startScreencast',{format:'jpeg',quality:82,maxWidth:1280,maxHeight:720,everyNthFrame:4});await b.evaluate('CosmicGuide.start()');
   let lastStep=-1;await until(async()=>{const guide=await b.evaluate('CosmicGuide.info()');if(guide.step!==lastStep){lastStep=guide.step;console.log(page,Math.round(guide.time),guide.status,guide.step);}return guide.status==='complete';},'full guide '+page,65000);
   await delay(400);await b.send('Page.stopScreencast');unsubscribe();
   await until(async()=>!!await b.evaluate('window.__tourRecording'),'tour audio',10000);const sound=await b.evaluate('window.__tourRecording');fs.writeFileSync(path.join(output,page+'-audio.webm'),Buffer.from(sound.base64,'base64'));
   assert.ok(frames.length>100,'Not enough screencast frames');assert.deepEqual(ackErrors,[]);assert.deepEqual(b.failures,[]);await b.evaluate('Cosmos.pause()');
   const duration=frames.at(-1).time-frames[0].time;assert.ok(duration>=43&&duration<=55,'Unexpected actual recording duration '+duration);
   let concat='ffconcat version 1.0\n';for(let i=0;i<frames.length-1;i++)concat+=`file '${frames[i].filename}'\nduration ${Math.max(.001,frames[i+1].time-frames[i].time).toFixed(6)}\n`;concat+=`file '${frames.at(-1).filename}'\n`;
   fs.writeFileSync(path.join(directory,'frames.ffconcat'),concat,'utf8');
   const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-safe','0','-i',path.join(directory,'frames.ffconcat'),'-i',path.join(output,page+'-audio.webm'),'-vf','scale=1280:720:flags=lanczos','-r','15','-c:v','libx264','-preset','veryfast','-crf','22','-c:a','aac','-b:a','128k','-t',duration.toFixed(3),'-movflags','+faststart',path.join(output,page+'.mp4')],{windowsHide:true,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
   recordings.push({page,path:'output/tours/'+page+'.mp4',audio:'output/tours/'+page+'-audio.webm',frames:frames.length,duration,bytes:fs.statSync(path.join(output,page+'.mp4')).size,viewport:{width:1280,height:720},quality:'medium',capture:'Actual CDP page screencast with timestamps, 15 fps export; recorded synthesized audio',guideStatus:await b.evaluate('CosmicGuide.info()')});
   recordings.sort((a,b)=>Object.keys(chapters).indexOf(a.page)-Object.keys(chapters).indexOf(b.page));fs.writeFileSync(paths.evidence('tour-recordings.json'),JSON.stringify({date:new Date().toISOString().slice(0,10),passed:recordings.length===6,recordings},null,2)+'\n');console.log('RECORDED',page,frames.length,duration);
  }finally{await b.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
