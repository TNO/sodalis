'use strict';const {test}=require('node:test'),a=require('node:assert/strict'),M=require('../../src/web-io-models.js');
test('master switch overrides every subordinate feature',()=>{const s=M.settings({defaults:{enabled:false,save:true},apps:{demo:{open:true,enabled:true}}});a.ok(Object.values(M.policy(s,'demo')).every(x=>!x));});
test('per-app granular settings preserve independent defaults',()=>{const s=M.settings({defaults:{open:false},apps:{demo:{save:false}}});a.equal(M.policy(s,'demo').save,false);a.equal(M.policy(s,'other').save,true);a.equal(M.policy(s,'other').open,false);a.equal(M.policy(s,'demo').storage,false);});
test('untrusted setting keys and prototype pollution are discarded',()=>{const s=M.settings(JSON.parse('{"apps":{"__proto__":{"open":false},"ok":{"eval":true,"save":false}}}'));a.equal(s.apps.ok.save,false);a.equal(s.apps.ok.eval,undefined);a.equal(Object.hasOwn(s.apps,'__proto__'),false);});
test('path traversal and host/system paths are rejected',()=>{for(const p of ['/Documents/../secret','/Local/a','/.Trash/x','/a//b','relative','/a\\b'])a.throws(()=>M.path(p));});
test('scope checks require whole path boundaries',()=>{a.equal(M.inside('/Documents/A','/Documents/AB'),false);a.equal(M.inside('/Documents/A','/Documents/A/b'),true);});
test('names preserve Unicode and spaces but reject separators',()=>{a.equal(M.name('żółć 日本語.txt'),'żółć 日本語.txt');for(const n of ['', '..','a/b','a\\b',' x','x\0'])a.throws(()=>M.name(n));});
test('media and extension filters',()=>{a.ok(M.accepts('PHOTO.JPG','image/jpeg',['.jpg']));a.ok(M.accepts('x','image/png',['image/*']));a.equal(M.accepts('a.exe','application/exe',['.txt']),false);});
test('picker normalizes supported fields and validates extensions',()=>{a.throws(()=>M.options({excludeAcceptAllOption:true}));a.throws(()=>M.options({types:[{accept:{'text/plain':['txt']}}]}));a.equal(M.options({multiple:true,mode:'readwrite'}).multiple,true);});
test('bounded positions never allow negative, infinite or huge allocations',()=>{for(const x of [-1,NaN,Infinity,1.5,2**32])a.throws(()=>M.integer(x));a.equal(M.integer(0),0);});
test('relative imports reject absolute and parent traversal',()=>{for(const p of ['../file','/a','x/../y','a//b'])a.throws(()=>M.relative(p));a.equal(M.relative('folder/child.txt'),'folder/child.txt');});
test('revision identifies equal-size concurrent writes',()=>{a.notEqual(M.stamp({kind:'file',size:4,modified:1,revision:'a'}),M.stamp({kind:'file',size:4,modified:1,revision:'b'}));});
test('settings and handles have explicit finite limits',()=>{a.equal(M.LIMITS.file,67108864);a.ok(M.LIMITS.entries<=2048);a.ok(M.LIMITS.requests<=12);});

test('bound MIME dictionaries and extension lists',()=>{a.throws(()=>M.options({types:[{accept:{'text/plain':Array(65).fill('.txt')}}]}));a.throws(()=>M.options({types:[{accept:Object.fromEntries(Array.from({length:17},(_,i)=>['text/x-'+i,['.x']]))}]}));});
test('project dotfiles remain usable inside a granted user folder',()=>{a.equal(M.path('/Projects/repo/.git/config'),'/Projects/repo/.git/config');a.equal(M.path('/Documents/.env'),'/Documents/.env');a.throws(()=>M.path('/.private'));});

test('root is allowed only for navigation, never as a capability',()=>{a.equal(M.path('/'),'/');a.throws(()=>M.grantPath('/'),{name:'NotAllowedError'});});
test('private scopes are excluded from public grants and sibling apps',()=>{a.throws(()=>M.grantPath('/Documents/App storage/a'),{name:'NotAllowedError'});a.throws(()=>M.grantPath('/Documents/App storage/b/x','/Documents/App storage/a'),{name:'NotAllowedError'});a.equal(M.grantPath('/Documents/App storage/a/x','/Documents/App storage/a'),'/Documents/App storage/a/x');});
test('write policy is independent from reading and is normalized on reload',()=>{const raw=M.settings({apps:{app:{write:false}}});const p=M.policy(raw,'app');a.equal(p.write,false);a.equal(p.open,true);a.equal(p.save,true);a.equal(M.policy(M.settings(JSON.parse(JSON.stringify(raw))),'app').write,false);});
test('handle capacity accommodates full bounded directory and its parent',()=>{a.ok(M.LIMITS.handles>M.LIMITS.entries);a.ok(M.LIMITS.handles<=4096);});
test('public path prefix similarity cannot enter a private scope',()=>{a.equal(M.grantPath('/Documents/App storage notes/a'),'/Documents/App storage notes/a');a.throws(()=>M.grantPath('/Documents/App storage/a/../b'),{name:'TypeError'});});
