'use strict';
/* Standing maintenance entry for data/math-conversion.json. */
const fs=require('node:fs'),assert=require('node:assert/strict'),paths=require('./paths.cjs');
const ledger=require(paths.data('math-conversion.json'));
assert.equal(ledger.expressions.length,ledger.count,'math-conversion count mismatch');
assert.deepEqual(ledger.unknown,[],'unconverted expressions remain');
const registered=new Set(ledger.expressions.map(item=>item.page));
const mathPages=paths.pages.filter(page=>(fs.readFileSync(paths.page(page),'utf8').match(/<math\b/g)||[]).length>0);
for(const page of mathPages)assert.ok(registered.has(page.replace('.html','')),page+': MathML page missing from ledger');
for(const id of registered)assert.ok(mathPages.includes(id+'.html'),id+': ledger entry has no MathML page');
console.log(JSON.stringify({expressions:ledger.count,pages:mathPages.map(page=>page.replace('.html','')),unknown:ledger.unknown.length}));
