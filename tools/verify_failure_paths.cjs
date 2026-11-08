const paths=require('./paths.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=paths.root,out=path.join(root,'output','acceptance','failures');fs.mkdirSync(out,{recursive:true});
const profiles=()=>new Set(fs.readdirSync(os.tmpdir()).filter(n=>n.startsWith('cosmos-acceptance-')));
(async()=>{
  const results=[];
  for(const fault of ['browser','navigation','shader','stale']){
    const before=profiles(),reportPath=path.join(out,fault+'.json'),start=Date.now();
    const env={...process.env,TEST_FAULT:fault,TEST_REPORT:reportPath,TEST_CORE:'1',TEST_USE_HTTP:'0'};
    if(fault==='browser')env.EDGE_PATH=path.join(out,'nonexistent-browser.exe');
    const child=spawn(process.execPath,[paths.tool('verify_all_pages.js')],{cwd:paths.root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
    const timer=setTimeout(()=>child.kill(),45000);
    const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timer);fs.writeFileSync(path.join(out,fault+'.log'),log,'utf8');
    assert.equal(exit,1,fault+' must exit 1');const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));assert.equal(report.passed,false);assert.ok(report.counts.failed>0);
    const leaked=[...profiles()].filter(n=>!before.has(n));assert.deepEqual(leaked,[],'Leaked temporary profiles');results.push({fault,exit,failed:report.counts.failed,milliseconds:Date.now()-start,leakedProfiles:0});
  }
  fs.writeFileSync(paths.evidence('runner-failure-results.json'),JSON.stringify({passed:true,results},null,2)+'\n');console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1;});
