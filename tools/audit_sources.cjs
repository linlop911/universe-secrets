const paths=require('./paths.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const chapters=require(paths.data('chapter-content.json')),assets=require(paths.data('asset-manifest.json')).assets,science=require(paths.data('science-content.json'));
const urls=new Map();for(const [id,source]of Object.entries(science.sources))urls.set(source.url,{id,title:source.title});
for(const [id,chapter]of Object.entries(chapters)){urls.set(chapter.sourceUrl,{id:id+'-topic',title:chapter.sourceLabel});for(const related of chapter.related)urls.set(related.url,{id:id+'-related',title:related.label});}
for(const asset of assets)urls.set(asset.sourceUrl,{id:asset.id,title:asset.title});
const rules=[
 [/black-holes\/$/,['Black Holes']], [/astronomers-reveal-first-image/,['Astronomers Reveal First Image','Sagittarius']],
 [/data-sonifications\/$/,['Sonification','Perseus']], [/cosmic-microwave-background-cmb-radiation/,['Cosmic Microwave Background','Planck']],
 [/planck-s-view/,['Planck','temperature']], [/1e0657/,['1E 0657','gas']], [/cosmic-cliffs/,['Cosmic Cliffs','NGC 3324']],
 [/the-crab-nebula/,['Crab','supernova']], [/webb\/sonifications/,['Sonifications','Cosmic Cliffs']],
 [/publications.html/,['Kip Thorne','Wormholes in Spacetime']], [/m644f-tbz27/,['Wormholes, time machines','weak energy condition']],
 [/nasa-finds-direct-proof-of-dark-matter/,['Dark Matter','bullet cluster']], [/dark-energy\/$/,['Dark Energy','universe']], [/1510.07674/,['Nominal','Conversion Constants']], [/0004075/,['Cosmological Constant','Carroll']]
];
(async()=>{
 const results=await Promise.all([...urls].map(async([url,source])=>{try{
  const response=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Mozilla/5.0 CosmosEducation/1.0'}}),buffer=Buffer.from(await response.arrayBuffer());
  const pdf=buffer.subarray(0,5).toString()==='%PDF-';let title,excerpt,contentChecked=false;
  if(pdf){fs.writeFileSync(paths.output('sources',source.id+'.pdf'),buffer);title=source.title;excerpt='PDF saved; first-page text verification is performed by tools/verify_pdf_source.py';contentChecked=false;}
  else{const html=buffer.toString('utf8');fs.writeFileSync(paths.output('sources','verified-'+source.id+'.html'),html,'utf8');title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];const text=html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ');const rule=rules.find(([pattern])=>pattern.test(url));assert.ok(rule,'Missing semantic rule '+url);for(const keyword of rule[1])assert.ok(text.toLowerCase().includes(keyword.toLowerCase()),'Topic not present: '+keyword);const position=text.toLowerCase().indexOf(rule[1][0].toLowerCase());excerpt=text.slice(Math.max(0,position-60),position+450);contentChecked=true;}
  assert.equal(response.status,200,'HTTP status '+url);assert.ok(title,'Missing content proof');
  return{...source,requestedUrl:url,finalUrl:response.url,status:response.status,title,excerpt,contentChecked,pdf,bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),checked:new Date().toISOString().slice(0,10),passed:true};
 }catch(error){return{...source,requestedUrl:url,passed:false,error:error.message,checked:new Date().toISOString().slice(0,10)};}}));
 const report={date:new Date().toISOString().slice(0,10),passed:results.every(r=>r.passed),results};fs.writeFileSync(paths.evidence('source-audit.json'),JSON.stringify(report,null,2)+'\n');for(const r of results)console.log(r.passed?'PASS':'FAIL',r.requestedUrl,r.error||r.title);if(!report.passed)process.exitCode=1;
})();
