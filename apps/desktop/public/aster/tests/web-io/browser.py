"""Real browser file API adapter tests with an explicitly named conformance app.
HTTP additionally covers automatic same-origin attachment. Opaque frames cover
MessagePort isolation. --inject is separately labelled memory-only local evidence.
"""
import argparse,json,threading,time
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def main(args):
 out=args.output or ROOT/'tests/web-io/artifacts';out.mkdir(parents=True,exist_ok=True)
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
 report={'mode':'injected memory' if args.inject else 'standalone' if args.standalone else 'HTTP/IndexedDB','engine':args.engine,'checks':[],'errors':[]}
 with sync_playwright() as p:
  browser=getattr(p,args.engine).launch(headless=True,executable_path=args.browser or None,args=['--no-sandbox'] if args.engine=='chromium' else [])
  ctx=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True,service_workers='allow');ctx.add_init_script("window.ioHandshake=[];addEventListener('message',e=>{if(e.data?.type?.startsWith('aster-io-')&&ioHandshake.length<12)ioHandshake.push({type:e.data.type,origin:e.origin,parent:e.source===parent,ports:e.ports.length});});");page=ctx.new_page();page.set_default_timeout(12000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
  def js(text,arg=None):return page.evaluate('async arg=>{const OS=Aster;const assert=(x,m="Assertion failed")=>{if(!x)throw Error(m);};'+text+'}',arg)
  def check(name,fn):
   start=time.monotonic()
   try:r=fn();report['checks'].append({'name':name,'status':'PASS','detail':r,'ms':round((time.monotonic()-start)*1000)});print('PASS',name,flush=True)
   except Exception as e:report['checks'].append({'name':name,'status':'FAIL','error':str(e)});page.screenshot(path=str(out/'failure.png'));raise
  def picker(kind='Open from Aster',folder='/Documents/IO'):
   d=page.get_by_role('dialog',name=kind,exact=True);d.wait_for();d.get_by_label('Aster folder',exact=True).fill(folder);d.get_by_role('button',name='Go',exact=True).click();page.wait_for_function('(p)=>document.querySelector(".io-picker-status")?.textContent.startsWith(p)',arg=folder);return d
  def done():frame.wait_for_function('result!==null||error!==null');return frame.evaluate('({result,error})')
  try:
   if args.inject:page.set_content((ROOT/'Aster.html').read_text())
   else:page.goto((ROOT/'Aster.html').as_uri() if args.standalone else origin)
   page.wait_for_function('Aster.booted && Aster.webIO');page.locator('#boot').wait_for(state='detached');js('await OS.ready;OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();for(const w of [...OS.windows.values()])await w.close(true);OS.closePanels();')
   js("await OS.fs.mkdir('/Documents/IO');await OS.fs.write('/Documents/IO/a.txt','Unicode żółć 日本語 🧪');await OS.fs.write('/Documents/IO/b.bin',new Blob([new Uint8Array([0,255,128,1])]));await OS.fs.mkdir('/Documents/IO/sub');await OS.fs.write('/Documents/IO/sub/c.txt','child');await OS.fs.write('/Documents/io-fixture.html',arg,'text/html');OS.registerCustom({id:'io-fixture',title:'File API fixture',path:'/Documents/io-fixture.html'});window.iow=OS.openApp('io-fixture');await iow.ready;",(ROOT/'tests/web-io/fixture.html').read_text())
   page.wait_for_function('Aster.webIO.sessions.some(s=>s.app==="io-fixture"&&s.state==="connected")');frame=page.locator('.app-frame').element_handle().content_frame();frame.wait_for_function('window.AsterFiles?.connected')
   def opening():
    assert frame.evaluate('ASTER_FILE_HOST_ORIGINS')==[page.evaluate('window.origin')]
    frame.locator('#open').click();d=picker();d.locator('[data-io-path="/Documents/IO/a.txt"]').click();page.screenshot(path=str(out/'aster-open-picker.png'));d.get_by_role('button',name='Open',exact=True).click();r=done();assert r['error'] is None,r;assert r['result']['text']=='Unicode żółć 日本語 🧪';assert frame.evaluate('(()=>{try{return !parent.Aster}catch(e){return e.name==="SecurityError"}})()')
   check('Opaque sandbox gets real selected bytes without access to the parent desktop',opening)
   def multiple():
    frame.locator('#multi').click();d=picker();d.locator('[data-io-path="/Documents/IO/a.txt"]').click();d.locator('[data-io-path="/Documents/IO/b.bin"]').click(modifiers=['Control']);d.get_by_role('button',name='Open',exact=True).click();r=done();assert len(r['result']['names'])==2,r
   check('Multiple file selection returns actual file handles',multiple)
   def saving():
    frame.locator('#text').fill('Saved Unicode Ω 日本語');frame.locator('#save').click();d=picker('Save to Aster');d.get_by_label('File name',exact=True).fill('new.txt');d.get_by_role('button',name='Save',exact=True).click();r=done();assert r['error'] is None,r;js("assert(await OS.fs.text(await OS.fs.read('/Documents/IO/new.txt'))==='Saved Unicode Ω 日本語');")
   check('Save picker writes the real Aster virtual file',saving)
   def stream():
    r=frame.evaluate('''async()=>{const s=await h.createWritable();await s.write(new Uint8Array([0,255,128,1]));await s.seek(1);await s.write(new Uint8Array([7]));await s.truncate(6);await s.close();return [...new Uint8Array(await(await h.getFile()).arrayBuffer())]}''');assert r==[0,7,128,1,0,0],r
    frame.evaluate('''async()=>{const s=await h.createWritable({keepExistingData:true});await s.write('discard');await s.abort();}''');js("assert(JSON.stringify([...new Uint8Array(await(await OS.fs.blob(await OS.fs.read('/Documents/IO/new.txt'))).arrayBuffer())])==='[0,7,128,1,0,0]');assert((await OS.history.list('/Documents/IO/new.txt')).length>0);")
   check('Binary stream seek/truncate/abort are exact and previous versions are retained',stream)
   def conflict():
    frame.evaluate('''async()=>{window.writer=await h.createWritable();await writer.write('obsolete');}''');js("await OS.fs.write('/Documents/IO/new.txt','newer');");r=frame.evaluate('async()=>{try{await writer.close();return "unsafe"}catch(e){return e.name}}');assert r=='InvalidModificationError',r;js("assert(await OS.fs.text(await OS.fs.read('/Documents/IO/new.txt'))==='newer');")
   check('Atomic close refuses to overwrite a concurrent newer edit',conflict)
   def folder():
    frame.locator('#folder').click();d=picker('Choose Aster folder');d.get_by_role('button',name='Select folder',exact=True).click();r=done();assert r['error'] is None,r
    r=frame.evaluate('''async()=>{const f=await dir.getFileHandle('created.txt',{create:true});const s=await f.createWritable();await s.write('folder content');await s.close();const paths=await dir.resolve(f);const again=await dir.getFileHandle('created.txt');return {paths,same:await again.isSameEntry(f),text:await(await f.getFile()).text()}}''');assert r=={'paths':['created.txt'],'same':True,'text':'folder content'},r
    r=frame.evaluate('async()=>{try{await dir.getFileHandle("../outside.txt",{create:true});return "unsafe"}catch(e){return e.name}}');assert r=='TypeError',r
    frame.evaluate('async()=>{await dir.removeEntry("created.txt");}');js("assert(!await OS.fs.stat('/Documents/IO/created.txt'));assert(await OS.fs.stat('/Documents/IO/a.txt'));")
   check('Scoped directories enumerate/create/write/resolve/remove without path traversal',folder)
   def inputfile():
    frame.locator('#pick-input').click();d=picker();d.locator('[data-io-path="/Documents/IO/b.bin"]').click();d.get_by_role('button',name='Open',exact=True).click();frame.wait_for_function('result?.files?.[0]?.name==="b.bin"');r=frame.evaluate('async()=>({bytes:[...new Uint8Array(await document.querySelector("#input").files[0].arrayBuffer())],events})');assert r['bytes']==[0,255,128,1];assert r['events'][-2:]==['input','change']
   check('Ordinary file input dispatches real FileList and input/change events',inputfile)
   def inputdirectory():
    frame.locator('#pick-directory').click();d=picker('Choose Aster folder');d.get_by_role('button',name='Select folder',exact=True).click();frame.wait_for_function('result?.files?.some(f=>f.relativePath==="IO/sub/c.txt")');assert not frame.evaluate('error')
   check('Directory input includes nested files and webkitRelativePath',inputdirectory)
   def cancel():
    frame.locator('#open').click();d=picker();d.get_by_role('button',name='Cancel',exact=True).click();assert done()['error']['name']=='AbortError'
   check('Picker cancellation rejects cleanly rather than falling into a browser dialog',cancel)
   def revoke():
    js("OS.webIO.revoke('io-fixture');");r=frame.evaluate('async()=>({p:await h.queryPermission(),r:await h.getFile().then(()=>"unsafe",e=>e.name)})');assert r=={'p':'denied','r':'NotAllowedError'},r
   check('Revocation invalidates old handles while leaving the application open',revoke)
   def native():
    js("await OS.webIO.update('io-fixture','inputs',false);");frame.wait_for_function('!AsterFiles.policy.inputs')
    with page.expect_file_chooser() as fc:frame.locator('#pick-input').click()
    fc.value.set_files({'name':'native.txt','mimeType':'text/plain','buffer':b'native browser bytes'})
    frame.wait_for_function('result?.files?.[0]?.name==="native.txt"');assert frame.evaluate('result.files[0].text')=='native browser bytes';assert not page.locator('.io-picker').count();js("await OS.webIO.update('io-fixture','inputs',None);".replace('None','null'))
   check('Per-app disabled input route uses the actual browser-native file chooser',native)
   def downloads():
    frame.locator('#download').click();d=picker('Save to Aster');d.get_by_role('button',name='Save',exact=True).click();js("await new Promise((resolve,reject)=>{const start=Date.now();const poll=async()=>{if(await OS.fs.stat('/Documents/IO/export.bin'))resolve();else if(Date.now()-start>10000)reject(Error('Download save timed out'));else setTimeout(poll,25)};poll();});");js("assert(JSON.stringify([...new Uint8Array(await(await OS.fs.blob(await OS.fs.read('/Documents/IO/export.bin'))).arrayBuffer())])==='[0,255,128,13,10]');await OS.webIO.update('io-fixture','downloads',false);");frame.wait_for_function('!AsterFiles.policy.downloads')
    with page.expect_download() as dl:frame.locator('#download').click()
    assert Path(dl.value.path()).read_bytes()==bytes([0,255,128,13,10]);js("await OS.webIO.update('io-fixture','downloads',null);")
   check('Generated Blob downloads save in Aster or download natively according to policy',downloads)
   def appdrop():
    frame.locator('#export').click();assert done()['result']['prepared'];js("window.explorer=OS.openApp('files',{path:'/Documents/IO'});await explorer.ready;explorer.rect={x:840,y:90,w:570,h:700};explorer.sync();iow.rect={x:30,y:70,w:780,h:600};iow.sync();")
    source=frame.locator('#out').bounding_box();target=page.locator('[data-window]').filter(has=page.locator('.explorer-main')).locator('.explorer-main').bounding_box()
    page.mouse.move(source['x']+20,source['y']+8);page.mouse.down();page.mouse.move(target['x']+target['width']-30,target['y']+target['height']-30,steps=30);page.mouse.up();page.wait_for_function("document.querySelector('.file-row[data-path=\"/Documents/IO/drag.bin\"]') || [...document.querySelectorAll('[role=\"dialog\"]')].some(d=>d.textContent.includes('Complete file transfer?'))");confirmation=page.get_by_role('dialog',name='Complete file transfer?',exact=True)
    if confirmation.count():confirmation.get_by_role('button',name='Transfer files',exact=True).click()
    page.locator('.file-row[data-path="/Documents/IO/drag.bin"]').wait_for();js("assert(JSON.stringify([...new Uint8Array(await(await OS.fs.blob(await OS.fs.read('/Documents/IO/drag.bin'))).arrayBuffer())])==='[0,255,128,13,10]');")
   check('Actual pointer drag from app export into Explorer preserves binary bytes',appdrop)
   def remoteconfirmation():
    js("document.querySelector('.file-operation-panel header button')?.click();window.remoteSource=OS.webIO.makeSession(iow,iow.body.querySelector('iframe'),'io-fixture');window.remoteOffer=OS.webIO.offer([{name:'untrusted.bin',blob:new Blob(['untrusted'])}],remoteSource);const area=explorer.body.querySelector('.explorer-main').getBoundingClientRect();window.remoteGesture='0123456789abcdef0123456789abcdef';window.remoteFinish=()=>{const control=OS.webIO.pointerDrag(remoteOffer.token,80,120,remoteSource,remoteGesture);const r=remoteSource.frame.getBoundingClientRect();control.remote({gesture:remoteGesture,token:remoteOffer.token,phase:'end',x:area.right-20-r.left,y:area.bottom-20-r.top});};remoteFinish();")
    confirm=page.get_by_role('dialog',name='Complete file transfer?',exact=True);confirm.wait_for();js("assert(!await OS.fs.stat('/Documents/IO/untrusted.bin'));");confirm.get_by_role('button',name='Cancel',exact=True).click();js("assert(!await OS.fs.stat('/Documents/IO/untrusted.bin'));remoteFinish();");confirm.get_by_role('button',name='Transfer files',exact=True).click();page.locator('.file-row[data-path="/Documents/IO/untrusted.bin"]').wait_for();js("assert(await OS.fs.text(await OS.fs.read('/Documents/IO/untrusted.bin'))==='untrusted');OS.webIO.removeOffer(remoteOffer.token);remoteSource.alive=false;")
    return 'Direct broker security test: an untrusted remote release cannot import until the actual host confirmation is accepted'
   check('Remote pointer reports require an independent host confirmation and respect Cancel',remoteconfirmation)
   def explorerDrop():
    js('document.querySelector(".file-operation-panel header button")?.click();');source=page.locator('.file-row[data-path="/Documents/IO/b.bin"]');source.click(trial=True);b=source.bounding_box();t=frame.locator('#drop').bounding_box();page.mouse.move(b['x']+70,b['y']+10);page.mouse.down();page.mouse.move(t['x']+40,t['y']+20,steps=30);page.mouse.up();frame.wait_for_function('window.dropped?.some(f=>f.name==="b.bin")');assert frame.evaluate('dropped.find(f=>f.name==="b.bin").bytes')==[0,255,128,1]
   check('Actual pointer drag from Explorer into the isolated app delivers real File data',explorerDrop)
   def settingsui():
    js("await explorer.close(true);await iow.minimize();window.settingsWindow=OS.openApp('settings',{section:'webfiles'});await settingsWindow.ready;");panel=page.locator('.window[data-app="settings"]');panel.get_by_label('File integration app',exact=True).select_option('io-fixture');panel.get_by_label('Save and write access',exact=True).select_option('false');page.wait_for_function('Aster.webIO.settings.apps["io-fixture"].save===false');assert panel.get_by_text('connected',exact=False).count()>0;page.screenshot(path=str(out/'file-integration-settings.png'));panel.get_by_label('Save and write access',exact=True).select_option('inherit');page.wait_for_function('Aster.webIO.settings.apps["io-fixture"].save===undefined');js('await settingsWindow.close(true);iow.minimized=false;iow.sync();iow.focus();')
   check('In-place Settings has inherited per-app switches and actual connection state',settingsui)
   if not args.inject and not args.standalone:
    def sameorigin():
     js('OS.register("same-io",{title:"Same origin fixture",width:800,height:650,mount:w=>{const f=OS.el("iframe",{class:"same-fixture",src:arg+"/tests/web-io/fixture.html"});w.body.append(f);OS.webIO.attach(w,f,"same-io",f.src);}});window.same=OS.openApp("same-io");await same.ready;',origin);page.wait_for_function('Aster.webIO.sessions.some(s=>s.app==="same-io"&&s.state==="connected")');f=page.locator('.same-fixture').element_handle().content_frame();f.locator('#open').click();d=picker();d.locator('[data-io-path="/Documents/IO/a.txt"]').click();d.get_by_role('button',name='Open',exact=True).click();f.wait_for_function('result?.name==="a.txt"');assert f.evaluate('result.text')=='Unicode żółć 日本語 🧪'
     js("await OS.webIO.update('same-io','storage',true);");f.wait_for_function('AsterFiles.policy.storage');f.evaluate('window.privateHandle=null;window.privateFailure=null;void navigator.storage.getDirectory().then(h=>privateHandle=h,e=>privateFailure=e.name)');page.get_by_role('dialog',name='Use Aster app storage?',exact=True).get_by_role('button',name='Use Aster storage',exact=True).click();f.wait_for_function('privateHandle||privateFailure');assert not f.evaluate('privateFailure'), f.evaluate('privateFailure');f.evaluate('async()=>{const f=await privateHandle.getFileHandle("cache.bin",{create:true});const s=await f.createWritable();await s.write(new Uint8Array([0,255,17]));await s.close();}');js("assert((await OS.fs.read('/Documents/App storage/same-io/cache.bin')).size===3);await OS.webIO.update('same-io','storage',false);");f.wait_for_function('!AsterFiles.policy.storage');assert f.evaluate('privateHandle.queryPermission()')=='denied';js('await same.close(true);')
    check('Owned same-origin pages connect automatically without source replacement',sameorigin)
   def revokedstream():
    frame.locator('#text').click();frame.locator('#text').fill('Original before revocation');assert frame.locator('#text').input_value()=='Original before revocation',frame.locator('#text').input_value();frame.locator('#save').click();d=picker('Save to Aster');d.get_by_label('File name',exact=True).fill('revoked.txt');d.get_by_role('button',name='Save',exact=True).click();assert not done()['error'];frame.evaluate('async()=>{window.stream=await h.createWritable();await stream.write("must not commit");}');js("OS.webIO.revoke('io-fixture');");result=frame.evaluate('async()=>{try{await stream.close();return "unsafe"}catch(e){return e.name}}');assert result=='InvalidStateError',result;js("assert(await OS.fs.text(await OS.fs.read('/Documents/IO/revoked.txt'))==='Original before revocation','Revocation must preserve the committed original bytes');")
    frame.locator('#open').click();picker();js("OS.webIO.revoke('io-fixture');");assert done()['error']['name']=='AbortError';assert page.locator('.io-picker').count()==0
   check('Revoking a pending stream and picker cannot commit staged bytes or leave a dialog',revokedstream)
   def readonly():
    frame.locator('#open').click();d=picker();d.locator('[data-io-path="/Documents/IO/a.txt"]').click();d.get_by_role('button',name='Open',exact=True).click();assert not done()['error'];assert frame.evaluate('h.queryPermission({mode:"readwrite"})')=='prompt';frame.locator('#text').fill('explicit permission');frame.locator('#write').click();page.get_by_role('dialog',name='Allow this app to edit?',exact=True).get_by_role('button',name='Allow editing',exact=True).click();assert not done()['error'];js("assert(await OS.fs.text(await OS.fs.read('/Documents/IO/a.txt'))==='explicit permission');")
   check('Read-only selections require a separate visible write-permission grant',readonly)
   def master():
    js("await OS.webIO.update('io-fixture','enabled',false);await OS.webIO.update('io-fixture','inputs',true);");frame.wait_for_function('!AsterFiles.policy.inputs');assert not frame.evaluate('AsterFiles.policy.open');assert frame.evaluate('h.queryPermission()')=='denied';
    with page.expect_file_chooser() as fc:frame.locator('#pick-input').click()
    fc.value.set_files({'name':'master-native.txt','mimeType':'text/plain','buffer':b'master disabled'})
    frame.wait_for_function('result?.files?.[0]?.name==="master-native.txt"');js("await OS.webIO.update('io-fixture','enabled',null);await OS.webIO.update('io-fixture','inputs',null);")
   check('Master-off overrides enabled child routes and retains native browser file input',master)
   def private():
    js("await OS.webIO.update('io-fixture','storage',true);");frame.wait_for_function('AsterFiles.policy.storage');frame.evaluate('window.privateResult=null;window.privateError=null; void (navigator.storage?.getDirectory ? navigator.storage.getDirectory().then(x=>window.privateResult=x,e=>window.privateError=e.name) : (window.privateError="Unavailable"))')
    # An opaque origin may not expose navigator.storage; explicit SDK directory
    # grants remain available there. The actual private-root test runs same-origin.
    if frame.evaluate('privateError==="Unavailable"'):return 'Opaque browser does not expose storage; no property spoofed'
    page.get_by_role('dialog',name='Use Aster app storage?',exact=True).get_by_role('button',name='Use Aster storage',exact=True).click();frame.wait_for_function('privateResult||privateError');assert not frame.evaluate('privateError');frame.evaluate('async()=>{const f=await privateResult.getFileHandle("cache.txt",{create:true});const s=await f.createWritable();await s.write("app storage");await s.close()}');js("assert(await OS.fs.text(await OS.fs.read('/Documents/App storage/io-fixture/cache.txt'))==='app storage');await OS.webIO.update('io-fixture','storage',null);")
   check('Opt-in private storage uses a confirmed app-specific root when browser supports it',private)
   def treeimport():
    js("const payload=[{relativePath:'Native folder/empty',kind:'directory',blob:null},{relativePath:'Native folder/sub/b.bin',kind:'file',blob:new Blob([new Uint8Array([0,255,128])])}];await OS.webIO.importNativeTree(Promise.resolve(payload),'/Downloads');assert((await OS.fs.stat('/Downloads/Native folder/empty')).kind==='directory');assert((await OS.fs.read('/Downloads/Native folder/sub/b.bin')).size===3);await OS.webIO.importNativeTree(Promise.resolve(payload),'/Downloads');assert(await OS.fs.stat('/Downloads/Native folder (2)/sub/b.bin'));await OS.webIO.update('','nativeDrop',false);try{await OS.webIO.importNativeTree(Promise.resolve(payload),'/Pictures');throw Error('unsafe')}catch(e){assert(e.name==='NotAllowedError');}assert(!await OS.fs.stat('/Pictures/Native folder'));await OS.webIO.update('','nativeDrop',true);")
    return 'Real binary/folder transaction; native directory entry enumeration is tested separately'
   check('Directory transfer plans preserve hierarchy, empty folders and conflicting roots atomically',treeimport)
   def shelf():
    js("window.offered=OS.webIO.offer([{name:'one.bin',blob:new Blob([new Uint8Array([1])])},{name:'two.bin',blob:new Blob([new Uint8Array([2])])}]);assert(OS.webIO.getOffer(offered.token+':1').files.length===1);assert(OS.webIO.getOffer(offered.token+':1').files[0].name==='two.bin');try{OS.webIO.getOffer(offered.token+':999');throw Error('unsafe')}catch(e){assert(e.message==='Invalid transfer item.');}OS.webIO.removeOffer(offered.token);try{OS.webIO.getOffer(offered.token);throw Error('unsafe')}catch(e){assert(e.name==='NotAllowedError');}")
   check('Transfer shelf items are individually scoped and removing them revokes the tokens',shelf)
   if args.engine=='chromium':
    def nativedrop():
     js("iow.minimize();window.nativeExplorer=OS.openApp('files',{path:'/Documents/IO'});await nativeExplorer.ready;nativeExplorer.rect={x:30,y:90,w:750,h:620};nativeExplorer.sync();")
     payload=out/'from-browser.bin';payload.write_bytes(bytes([0,255,37,128,9]));target=page.locator('.window[data-app="files"] .explorer-main').last.bounding_box();cdp=ctx.new_cdp_session(page);data={'items':[],'files':[str(payload.resolve())],'dragOperationsMask':1};point={'x':target['x']+target['width']-30,'y':target['y']+target['height']-30}
     for event in ['dragEnter','dragOver','drop']:cdp.send('Input.dispatchDragEvent',{'type':event,**point,'data':data})
     page.locator('.file-row[data-path="/Documents/IO/from-browser.bin"]').wait_for();js("assert(JSON.stringify([...new Uint8Array(await(await OS.fs.blob(await OS.fs.read('/Documents/IO/from-browser.bin'))).arrayBuffer())])==='[0,255,37,128,9]');await nativeExplorer.close(true);iow.minimized=false;iow.focus();");cdp.detach();payload.unlink()
     return 'Chromium protocol supplies an actual disk file through browser-generated drag events; no DOM FileList mock'
    check('Browser-native file drop events import exact disk-file bytes into Explorer',nativedrop)
   def themepicker():
    for theme in ['windows-light','macos26-light','ubuntu-dark']:
     js("await OS.themes.select(arg);",theme);frame.locator('#open').click();d=picker();assert d.is_visible();page.screenshot(path=str(out/('picker-'+theme+'.png')));d.get_by_role('button',name='Cancel',exact=True).click();assert done()['error']['name']=='AbortError'
    page.set_viewport_size({'width':390,'height':844});page.wait_for_function('innerWidth===390');js('iow.minimized=false;iow.focus();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));');frame.locator('#open').focus();frame.locator('#open').press('Enter');d=page.get_by_role('dialog',name='Open from Aster',exact=True);d.wait_for();bounds=d.bounding_box();assert bounds['x']>=0 and bounds['x']+bounds['width']<=391;page.screenshot(path=str(out/'picker-mobile.png'));page.keyboard.press('Escape');frame.wait_for_function('error?.name==="AbortError"');page.set_viewport_size({'width':1440,'height':1000});js("await OS.themes.select('windows-light');")
   check('The real picker follows three OS profiles, preserves cancellation and fits mobile',themepicker)
   from review_checks import run as review_checks
   review_checks(page,ctx,js,picker,frame,done,check,args,ROOT,origin)
   def cleanup():
    js('await iow.close(true);');page.wait_for_function('!Aster.webIO.sessions.length');assert page.locator('.io-picker').count()==0
   check('Closing windows revokes sessions, streams and transfer offers',cleanup)
   if not args.inject:
    def persistence():
     js("await OS.webIO.update('io-fixture','open',false);await OS.persistSessionNow();");page.reload();page.wait_for_function('Aster.booted && Aster.webIO');js("await OS.ready;assert(!OS.db.memory);assert(OS.webIO.settings.apps['io-fixture'].open===false);assert(await OS.fs.text(await OS.fs.read('/Documents/IO/new.txt'))==='newer');assert((await OS.history.list('/Documents/IO/new.txt')).length>0);assert(!OS.webIO.sessions.length);")
    check('Full reload retains actual bytes, file history and granular preferences but not grants',persistence)
    if args.standalone:
     ctx.set_offline(True);page.reload();page.wait_for_function('Aster.booted && Aster.webIO');js("assert(await OS.fs.stat('/Documents/IO/export.bin'));");check('Standalone boots with networking disabled',lambda:True)
   assert not report['errors'],report['errors'];report['status']='PASS'
  except Exception as e:
   report['status']='FAIL';report['error']=str(e)
   try:
    report['bootstrapDiagnostics']=page.evaluate('({url:location.href,environmentOrigin:window.origin,urlOrigin:location.origin,sessions:Aster.webIO?.sessions,messages:window.ioHandshake})')
    report['frameDiagnostics']=[f.evaluate('({url:location.href,environmentOrigin:window.origin,urlOrigin:location.origin,allowed:window.ASTER_FILE_HOST_ORIGINS,connected:window.AsterFiles?.connected,messages:window.ioHandshake})') for f in page.frames]
    page.screenshot(path=str(out/'failure.png'))
   except Exception as detail:report['diagnosticError']=str(detail)
   raise
  finally:(out/'results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--inject',action='store_true');ap.add_argument('--standalone',action='store_true');ap.add_argument('--engine',default='chromium');ap.add_argument('--browser');ap.add_argument('--output',type=Path);main(ap.parse_args())
