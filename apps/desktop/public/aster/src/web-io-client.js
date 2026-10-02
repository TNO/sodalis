/* Aster file SDK. A standalone, cooperative adapter; never executes in the host. MIT. */
'use strict';
(function(root){
    function install(win,port,initial={}){
        if(win.AsterFiles?.connected)return win.AsterFiles;
        const pending=new Map(),meta=new WeakMap(),handles=new Map(),urls=new Map(),undo=[],streams=new Set();let policy={...initial.policy},dead=false,next=0,bypass=0,dragTarget=null,blobBytes=0;
        const MAX=64*1024*1024;
        const activate=()=>{if(!win.navigator.userActivation?.isActive)throw error('A user click or key press is required.','SecurityError');};
        const error=(msg,name='NotAllowedError')=>new win.DOMException(msg,name);
        function request(op,args={}){if(dead)return Promise.reject(error('Aster connection closed.','AbortError'));if(pending.size>=12)return Promise.reject(error('Too many pending file operations.','QuotaExceededError'));return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(error('Aster file request timed out.','TimeoutError'));},180000);pending.set(id,{resolve,reject,timer});try{port.postMessage({id,op,args});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}
        function file(row){const f=new win.File([row.blob],row.name,{type:row.type||row.blob.type,lastModified:row.modified||Date.now()});if(row.relativePath)Object.defineProperty(f,'webkitRelativePath',{value:row.relativePath});return f;}
        const opts=o=>{o=o||{};const v={...o};if(o.startIn&&typeof o.startIn==='object')v.startIn=meta.get(o.startIn)?.token||'documents';return v;};
        function handle(row){if(handles.has(row.token))return handles.get(row.token);const h=row.kind==='directory'?new Directory(row):new FileHandle(row);handles.set(row.token,h);return h;}
        class Handle{
            constructor(row){Object.defineProperties(this,{kind:{enumerable:true,value:row.kind},name:{enumerable:true,value:row.name}});meta.set(this,row);}
            queryPermission(o={}){return request('permission',{token:meta.get(this).token,mode:o.mode||'read'});}
            requestPermission(o={}){return request('requestPermission',{token:meta.get(this).token,mode:o.mode||'read'});}
            isSameEntry(other){return meta.has(other)?request('same',{token:meta.get(this).token,other:meta.get(other).token}):Promise.resolve(false);}
        }
        class FileHandle extends Handle{
            async getFile(){return file(await request('read',{token:meta.get(this).token}));}
            async createWritable(o={}){const opened=await request('writeBegin',{token:meta.get(this).token,keep:o.keepExistingData===true,mode:o.mode||'siloed'});return writable(opened.id);}
            createSyncAccessHandle(){return Promise.reject(error('Synchronous worker handles are not provided by the Aster bridge.','NotSupportedError'));}
        }
        class Directory extends Handle{
            async getFileHandle(name,o={}){return handle(await request('child',{token:meta.get(this).token,name,kind:'file',create:o.create===true}));}
            async getDirectoryHandle(name,o={}){return handle(await request('child',{token:meta.get(this).token,name,kind:'directory',create:o.create===true}));}
            removeEntry(name,o={}){return request('remove',{token:meta.get(this).token,name,recursive:o.recursive===true});}
            resolve(other){return meta.has(other)?request('resolve',{token:meta.get(this).token,other:meta.get(other).token}):Promise.resolve(null);}
            async *entries(){const rows=await request('entries',{token:meta.get(this).token});for(const r of rows)yield [r.name,handle(r)];}
            async *keys(){for await(const [k] of this.entries())yield k;}
            async *values(){for await(const [,v] of this.entries())yield v;}
            [Symbol.asyncIterator](){return this.entries();}
        }
        function writable(id){let closed=false;const sink={
            async write(chunk){try{if(closed)throw error('Stream is closed.','InvalidStateError');let command={type:'write',data:chunk};if(chunk&&typeof chunk==='object'&&typeof chunk.type==='string'&&!(chunk instanceof win.Blob)&&!ArrayBuffer.isView(chunk))command={...chunk};
                if(command.type==='write'){let d=command.data;if(typeof d==='string')d=new win.Blob([d]);else if(ArrayBuffer.isView(d)||d instanceof win.ArrayBuffer)d=new win.Blob([d]);if(!(d instanceof win.Blob)||d.size>MAX)throw error('Unsupported or oversized write.','QuotaExceededError');command.data=d;}
                return await request('writeChunk',{id,command});}catch(e){closed=true;request('writeAbort',{id}).catch(()=>{});throw e;}},
            async close(){try{await request('writeClose',{id});}finally{closed=true;streams.delete(id);}},
            async abort(){closed=true;streams.delete(id);return request('writeAbort',{id});}
        };streams.add(id);const stream=new win.WritableStream(sink);stream.write=async v=>{const writer=stream.getWriter();try{return await writer.write(v);}finally{writer.releaseLock();}};stream.seek=position=>stream.write({type:'seek',position});stream.truncate=size=>stream.write({type:'truncate',size});return stream;}
        function replace(obj,key,value){if(!obj)return;const desc=Object.getOwnPropertyDescriptor(obj,key);try{Object.defineProperty(obj,key,{configurable:true,writable:true,value});undo.push(()=>{if(obj[key]===value){if(desc)Object.defineProperty(obj,key,desc);else delete obj[key];}});}catch{/* Capability is reported; never relax sandbox/CSP to patch a read-only property. */}}
        function patchPicker(key,feature,op,many=false){const native=win[key];replace(win,key,function(o){if(!policy[feature])return typeof native==='function'?native.call(win,o):Promise.reject(error('The browser does not provide this picker.','NotSupportedError'));try{activate();}catch(e){return Promise.reject(e);}return request(op,{options:opts(o)}).then(r=>many?r.map(handle):handle(r));});}
        patchPicker('showOpenFilePicker','open','open',true);patchPicker('showSaveFilePicker','save','save');patchPicker('showDirectoryPicker','folders','folder');
        // Optional private-root mapping, distinct from public folder grants. Existing
        // IndexedDB and worker-owned OPFS are deliberately not monkey-patched.
        try{const storage=win.navigator.storage,native=storage?.getDirectory;if(storage)replace(storage,'getDirectory',function(){if(!policy.storage)return native?native.call(storage):Promise.reject(error('Browser private storage unavailable.','NotSupportedError'));return request('storage').then(handle);});}catch{}
        const inputs=new WeakSet(),routeInput=input=>policy.inputs&&(!input.webkitdirectory||policy.folders);
        async function chooseInput(input){if(inputs.has(input))return;inputs.add(input);try{activate();let rows;
            if(input.webkitdirectory){const h=await request('folder',{options:{mode:'read'}});rows=await request('treeFiles',{token:h.token});}
            else{const types=input.accept?input.accept.split(',').map(s=>s.trim()).filter(Boolean):[];rows=await request('input',{accept:types,multiple:input.multiple});}
            const dt=new win.DataTransfer();rows.forEach(row=>dt.items.add(file(row)));input.files=dt.files;input.dispatchEvent(new win.Event('input',{bubbles:true}));input.dispatchEvent(new win.Event('change',{bubbles:true}));
        }catch(e){input.dispatchEvent(new win.Event('cancel',{bubbles:true}));if(e.name!=='AbortError')win.dispatchEvent(new win.CustomEvent('aster-file-error',{detail:{name:e.name,message:e.message}}));}finally{inputs.delete(input);}}
        const originalInputClick=win.HTMLInputElement.prototype.click,originalShow=win.HTMLInputElement.prototype.showPicker;
        replace(win.HTMLInputElement.prototype,'click',function(){if(!bypass&&this.type==='file'&&routeInput(this)){if(!this.disabled)void chooseInput(this);return;}return originalInputClick.call(this);});
        if(originalShow)replace(win.HTMLInputElement.prototype,'showPicker',function(){if(!bypass&&this.type==='file'&&routeInput(this)){if(!this.disabled)void chooseInput(this);return;}return originalShow.call(this);});
        const clicked=e=>{if(bypass)return;const input=e.target.closest?.('input[type=file]')||e.target.closest?.('label')?.control;if(input?.type==='file'&&routeInput(input)&&!input.disabled){e.preventDefault();e.stopImmediatePropagation();void chooseInput(input);}};
        win.document.addEventListener('click',clicked,true);undo.push(()=>win.document.removeEventListener('click',clicked,true));
        const originalCreate=win.URL.createObjectURL,originalRevoke=win.URL.revokeObjectURL;
        replace(win.URL,'createObjectURL',function(blob){const url=originalCreate.call(win.URL,blob);if(blob instanceof win.Blob&&blob.size<=MAX){urls.set(url,blob);blobBytes+=blob.size;while(urls.size>128||blobBytes>128*1024*1024){const [key,value]=urls.entries().next().value;urls.delete(key);blobBytes-=value.size;}}return url;});
        replace(win.URL,'revokeObjectURL',function(url){if(urls.has(url)){blobBytes-=urls.get(url).size;urls.delete(url);}return originalRevoke.call(win.URL,url);});
        async function saveBlob(blob,name){if(!(blob instanceof win.Blob)||blob.size>MAX)throw error('Export exceeds 64 MiB.','QuotaExceededError');return request('download',{blob,name:name||'Download'});}
        function blobForLink(a){const url=a.href;if(urls.has(url))return urls.get(url);if(url.startsWith('data:')&&url.length<MAX*1.4){const split=url.indexOf(','),head=url.slice(0,split),body=url.slice(split+1);try{const data=head.endsWith(';base64')?Uint8Array.from(win.atob(body),c=>c.charCodeAt(0)):decodeURIComponent(body);return new win.Blob([data],{type:head.slice(5).split(';')[0]});}catch{return null;}}return null;}
        const originalAnchor=win.HTMLAnchorElement.prototype.click;
        function download(a){if(!policy.downloads||!a.hasAttribute('download'))return false;const blob=blobForLink(a);if(!blob)return false;void saveBlob(blob,a.download).catch(e=>{if(e.name!=='AbortError')win.dispatchEvent(new win.CustomEvent('aster-file-error',{detail:{name:e.name,message:e.message}}));});return true;}
        replace(win.HTMLAnchorElement.prototype,'click',function(){if(!bypass&&download(this))return;return originalAnchor.call(this);});
        const anchorClick=e=>{if(bypass)return;const a=e.target.closest?.('a[download]');if(a&&download(a)){e.preventDefault();e.stopImmediatePropagation();}};
        win.document.addEventListener('click',anchorClick,true);undo.push(()=>win.document.removeEventListener('click',anchorClick,true));
        const transferred=new WeakSet();
        function dataTransfer(rows){const dt=new win.DataTransfer();rows.forEach(row=>dt.items.add(file(row)));return dt;}
        async function receiveDrop(token,target,coords){try{const r=await request('dropRead',{token});if(dead||!policy.dropIn||!target?.isConnected)return;const dt=dataTransfer(r.files);if(target.matches?.('input[type=file]')){target.files=dt.files;target.dispatchEvent(new win.Event('input',{bubbles:true}));target.dispatchEvent(new win.Event('change',{bubbles:true}));return;}const event=new win.DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,...coords});transferred.add(event);target.dispatchEvent(event);win.dispatchEvent(new win.CustomEvent('aster-files-drop',{detail:{files:[...dt.files],handles:(r.handles||[]).map(handle)}}));}catch(e){win.dispatchEvent(new win.CustomEvent('aster-file-error',{detail:{name:e.name,message:e.message}}));}}
        const dragover=e=>{if(policy.dropIn&&[...e.dataTransfer.types].includes('application/x-aster-transfer')){e.preventDefault();e.dataTransfer.dropEffect='copy';dragTarget=e.target;}};
        const drop=e=>{if(transferred.has(e)||!policy.dropIn)return;const token=e.dataTransfer.getData('application/x-aster-transfer');if(!token)return;e.preventDefault();e.stopImmediatePropagation();void receiveDrop(token,e.target||dragTarget,{clientX:e.clientX,clientY:e.clientY});};
        win.document.addEventListener('dragover',dragover,true);win.document.addEventListener('drop',drop,true);undo.push(()=>{win.document.removeEventListener('dragover',dragover,true);win.document.removeEventListener('drop',drop,true);});
        // Capture genuine page File payloads during dragstart (the only write phase).
        let lastPointer=null;const rememberPointer=e=>{if(e.isTrusted&&e.button===0)lastPointer={pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,ctrlKey:e.ctrlKey};};win.addEventListener('pointerdown',rememberPointer,true);undo.push(()=>win.removeEventListener('pointerdown',rememberPointer,true));
        const dragstart=e=>{if(!policy.dropOut||!e.isTrusted||!lastPointer)return;const anchor=e.target.closest?.('a[download]'),blob=anchor&&blobForLink(anchor);let files=[...e.dataTransfer.files];if(!files.length&&blob)files=[new win.File([blob],anchor.download||'Download',{type:blob.type})];if(!files.length)return;
            // Capture bytes before the browser leaves its read/write drag phase.
            // Opaque frames cannot reliably use native cross-frame drags; relay
            // this gesture; isolated remote release requires host confirmation.
            e.preventDefault();const offered=request('offer',{files:files.map(f=>({name:f.name,blob:f,type:f.type}))}).then(r=>{api.lastOffer=r;return r;});relayDrag(e.target,offered,{...lastPointer,clientX:e.clientX,clientY:e.clientY});
        };
        win.document.addEventListener('dragstart',dragstart);undo.push(()=>win.document.removeEventListener('dragstart',dragstart));
        // Pointer events may remain in the source iframe's browser process until
        // release. Forward that gesture over the existing port. The host treats
        // remote release as untrusted and asks for confirmation before sharing.
        function relayDrag(element,offer,startEvent){
            const gesture=Array.from(win.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
            let prepared=null,ready=false,finished=false,last={phase:'move',x:startEvent.clientX,y:startEvent.clientY,ctrlKey:startEvent.ctrlKey};
            const send=()=>{if(ready&&!dead)port.postMessage({type:'pointer',gesture,token:prepared.token,...last});};
            const move=e=>{if(!e.isTrusted||e.pointerId!==startEvent.pointerId||finished)return;last={phase:'move',x:e.clientX,y:e.clientY,ctrlKey:e.ctrlKey};send();};
            const release=e=>{if(!e.isTrusted||e.pointerId!==startEvent.pointerId||finished)return;finished=true;last={phase:e.type==='pointercancel'?'cancel':'end',x:e.clientX,y:e.clientY,ctrlKey:e.ctrlKey};cleanup();send();};
            const cancel=e=>{if(e.key==='Escape'){finished=true;last.phase='cancel';cleanup();send();}};
            function cleanup(){win.removeEventListener('pointermove',move,true);win.removeEventListener('pointerup',release,true);win.removeEventListener('pointercancel',release,true);win.removeEventListener('keydown',cancel,true);clearTimeout(timer);try{if(element.hasPointerCapture(startEvent.pointerId))element.releasePointerCapture(startEvent.pointerId);}catch{}}
            win.addEventListener('pointermove',move,true);win.addEventListener('pointerup',release,true);win.addEventListener('pointercancel',release,true);win.addEventListener('keydown',cancel,true);
            try{element.setPointerCapture(startEvent.pointerId);}catch{}
            const timer=setTimeout(()=>{finished=true;last.phase='cancel';cleanup();send();},15000);
            Promise.resolve(offer).then(value=>{prepared=value;return request('pointerStart',{token:prepared.token,gesture,x:startEvent.clientX,y:startEvent.clientY});}).then(()=>{ready=true;send();}).catch(()=>{finished=true;cleanup();});
        }
        const api={version:1,get connected(){return !dead;},get policy(){return {...policy};},get settings(){return {...policy};},get capabilities(){return {structuredCloneHandles:false,syncAccess:false,opaqueFiles:true};},
            open:o=>{activate();return request('open',{options:opts(o)}).then(r=>r.map(handle));},save:o=>{activate();return request('save',{options:opts(o)}).then(handle);},directory:o=>{activate();return request('folder',{options:opts(o)}).then(handle);},saveBlob,exportFile:saveBlob,
            describeHandle:h=>{const r=meta.get(h);if(!r)throw error('Foreign handle.','TypeMismatchError');return {asterFileHandle:1,token:r.token,session:initial.session};},
            restoreHandle:d=>d?.session===initial.session?request('describe',{token:d.token}).then(handle):Promise.reject(error('Select files again after reload.')),
            setDragFiles(event,files){for(const f of files)event.dataTransfer.items.add(f);},
            async makeDraggable(element,files){
                const rows=files.map(f=>({name:f.name,blob:f,type:f.type})),offer=await request('offer',{files:rows});
                // Pointer relay avoids native drag restrictions on opaque sandbox
                // frames. Remote release is confirmed by the host before importing.
                let origin=null,suppressClickUntil=0;const prior=element.draggable,oldTouch=element.style.touchAction;
                element.draggable=false;element.style.touchAction='none';
                const down=e=>{if(!policy.dropOut||e.button!==0||!e.isTrusted)return;origin={x:e.clientX,y:e.clientY};e.preventDefault();};
                const move=e=>{if(!origin||!e.buttons)return;if(Math.hypot(e.clientX-origin.x,e.clientY-origin.y)<6)return;origin=null;suppressClickUntil=Date.now()+16000;
                    relayDrag(element,offer,e);};
                const up=()=>{origin=null;if(suppressClickUntil)suppressClickUntil=Date.now()+500;};const click=e=>{if(Date.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}};element.addEventListener('click',click,true);element.addEventListener('pointerdown',down);win.addEventListener('pointermove',move);win.addEventListener('pointerup',up);
                const dispose=()=>{element.removeEventListener('click',click,true);element.removeEventListener('pointerdown',down);win.removeEventListener('pointermove',move);win.removeEventListener('pointerup',up);element.draggable=prior;element.style.touchAction=oldTouch;request('releaseOffer',{token:offer.token}).catch(()=>{});};undo.push(dispose);return dispose;
            },
            exportFiles:files=>request('offer',{files:files.map(f=>({name:f.name,blob:f,type:f.type})),show:true}),
            dispose(){if(dead)return;try{port.postMessage({type:'bye'});}catch{}dead=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(error('Aster connection closed.','AbortError'));}pending.clear();for(const fn of undo.reverse())try{fn();}catch{}urls.clear();handles.clear();port.close();}
        };
        port.onmessage=e=>{const m=e.data;if(m?.type==='deliver'){void receiveDrop(m.token,win.document.elementFromPoint(m.x,m.y),{clientX:m.x,clientY:m.y});return;}if(m?.type==='policy'){policy={...m.policy};return;}if(m?.type==='close'){api.dispose();return;}const p=pending.get(m?.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(error(m.error.message,m.error.name)):p.resolve(m.value);};port.start();
        win.AsterFiles=api;win.addEventListener('pagehide',()=>api.dispose(),{once:true});port.postMessage({type:'ready'});return api;
    }
    function connect(options={}){
        if(root.window!==root||root.parent===root)return Promise.resolve(null);
        if(root.AsterFiles?.connected)return Promise.resolve(root.AsterFiles);
        if(options.parentOrigins)root.ASTER_FILE_HOST_ORIGINS=[...options.parentOrigins];
        const allowed=root.ASTER_FILE_HOST_ORIGINS;
        if(!Array.isArray(allowed)||!allowed.length)return Promise.resolve(null);
        if(root.__asterFilesConnecting)return root.__asterFilesConnecting;
        const promise=new Promise(resolve=>{
            let finished=false;const nonce=Array.from(root.crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
            const done=value=>{if(finished)return;finished=true;clearInterval(timer);clearTimeout(timeout);root.removeEventListener('message',receive);root.__asterFilesConnecting=null;resolve(value);};
            const receive=event=>{if(event.source!==root.parent||event.data?.type!=='aster-io-offer'||!event.ports?.[0]||!allowed.includes(event.origin))return;done(install(root,event.ports[0],event.data));};
            root.addEventListener('message',receive);
            const send=()=>{if(root.AsterFiles?.connected){done(root.AsterFiles);return;}root.parent.postMessage({type:'aster-io-ready',nonce},'*');};
            const timer=setInterval(send,250),timeout=setTimeout(()=>done(null),10000);send();
        });root.__asterFilesConnecting=promise;return promise;
    }
    root.AsterIOClient={install,connect};root.AsterFileClient=Object.freeze({install,connect});
    if(root.window===root&&root.parent!==root)void connect();
})(globalThis);
