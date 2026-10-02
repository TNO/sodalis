/* Bounded file integration policy and payload validation. MIT. */
'use strict';
(function(root){
    const LIMITS=Object.freeze({file:64*1024*1024,batch:128*1024*1024,entries:2048,handles:4096,requests:12,streams:8,apps:256,depth:24});
    const FEATURES=Object.freeze(['enabled','open','save','folders','inputs','downloads','dropIn','dropOut','storage','write']);
    const DEFAULTS=Object.freeze({enabled:true,open:true,save:true,folders:true,inputs:true,downloads:true,dropIn:true,dropOut:true,storage:false,write:true});
    const fail=(message,name='TypeError')=>{const e=new Error(message);e.name=name;throw e;};
    function name(value){if(typeof value!=='string'||!value||value.length>255||value.trim()!==value||/[\\/\x00-\x1f]/.test(value)||value==='.'||value==='..')fail('Invalid file or folder name.');return value;}
    function path(value){if(typeof value!=='string'||value.length>2048||!value.startsWith('/')||value.includes('\\'))fail('Invalid virtual path.');const parts=value.split('/').slice(1);if(value==='/')return value;parts.forEach(name);if(parts.length>LIMITS.depth)fail('Folder nesting limit exceeded.');if(parts[0]==='Local'||parts[0].startsWith('.'))fail('System and mounted host folders are not shared.','NotAllowedError');return value;}
    const privatePath=p=>p==='/Documents/App storage'||p.startsWith('/Documents/App storage/');
    function grantPath(p,storageRoot=null){path(p);if(p==='/')fail('Select one user folder, not the filesystem root.','NotAllowedError');if(privatePath(p)&&(!storageRoot||!inside(storageRoot,p)))fail('App-private storage is not a public file scope.','NotAllowedError');return p;}
    function relative(value){if(typeof value!=='string'||value.length>2048)fail('Invalid relative path.');const parts=value.split('/');parts.forEach(name);if(parts.length>LIMITS.depth)fail('Folder nesting limit exceeded.');return parts.join('/');}
    const inside=(base,p)=>p===base||(base==='/'?p.startsWith('/'):p.startsWith(base+'/'));
    function options(value={}){if(!value||typeof value!=='object')fail('Invalid picker options.');const types=[];
        for(const item of (Array.isArray(value.types)?value.types:[]).slice(0,32)){const accept=[];if(!item||typeof item!=='object'||Object.keys(item.accept||{}).length>16)fail('Too many MIME filters.');for(const [mime,exts] of Object.entries(item.accept||{})){if(!/^[\w!#$&^.+-]+\/(?:[\w!#$&^.+-]+|\*)$/.test(mime))fail('Invalid MIME filter.');if(!Array.isArray(exts)||exts.length>64)fail('Extensions must be an array.');for(const ext of exts){if(typeof ext!=='string'||!/^\.[\p{L}\p{N}._+-]{1,15}$/u.test(ext))fail('Invalid extension filter.');accept.push(ext.toLowerCase());}accept.push(mime.toLowerCase());}if(accept.length)types.push({description:String(item.description||'Files').slice(0,80),accept});}
        if(value.excludeAcceptAllOption&&!types.length)fail('At least one file type is required.');
        return {types,multiple:value.multiple===true,excludeAcceptAllOption:value.excludeAcceptAllOption===true,suggestedName:name(value.suggestedName||'Untitled'),startIn:typeof value.startIn==='string'?value.startIn.slice(0,100):'documents',mode:value.mode==='readwrite'?'readwrite':'read',id:typeof value.id==='string'?value.id.slice(0,32):''};
    }
    function accepts(filename,mime,list){return !list?.length||list.some(s=>s[0]==='.'?filename.toLowerCase().endsWith(s):s.endsWith('/*')?mime.toLowerCase().startsWith(s.slice(0,-1)):mime.toLowerCase()===s);}
    function settings(raw={}){const out={version:1,defaults:{...DEFAULTS},apps:{},nativeDrop:true};if(raw.nativeDrop===false)out.nativeDrop=false;for(const k of FEATURES)if(typeof raw.defaults?.[k]==='boolean')out.defaults[k]=raw.defaults[k];for(const [id,v] of Object.entries(raw.apps||{}).slice(0,LIMITS.apps)){if(!/^[\w-]{1,100}$/.test(id)||!v||typeof v!=='object'||['__proto__','constructor','prototype'].includes(id))continue;const o={};for(const k of FEATURES)if(typeof v[k]==='boolean')o[k]=v[k];out.apps[id]=o;}return out;}
    function policy(raw,id){const p={...DEFAULTS,...raw.defaults,...raw.apps?.[id]};if(raw.defaults?.enabled===false||!p.enabled)for(const k of FEATURES)p[k]=false;return p;}
    function integer(value,max=LIMITS.file){if(!Number.isSafeInteger(value)||value<0||value>max)fail('Position or size exceeds the file limit.','QuotaExceededError');return value;}
    function stamp(e){return e?JSON.stringify([e.kind,e.revision||null,e.modified||0,e.size||0]):null;}
    const api=Object.freeze({LIMITS,FEATURES,DEFAULTS,name,path,grantPath,privatePath,relative,inside,options,accepts,settings,policy,integer,stamp,fail});root.AsterIOModels=api;if(typeof module==='object')module.exports=api;
})(globalThis);
