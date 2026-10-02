"""Unchanged deployed Notepad XP and TwinForge, inside the exact proposed Aster host.
Only /Aster/ resources are served from the checkout. Application requests are
never fulfilled, altered or mocked. Original application UI and model do the I/O.
"""
import hashlib,json,mimetypes,time
from pathlib import Path
from urllib.parse import urlsplit,unquote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tests/web-io/artifacts/live'
HOST='https://wieslawsoltes.github.io/Aster/'

def main():
 OUT.mkdir(parents=True,exist_ok=True)
 report={'test':'Unmodified deployed NotepadXP and TwinForge with proposed Aster host','hostResourcesFromCheckout':True,'applicationRequestsMocked':False,'checks':[],'errors':[],'applicationSources':{}}
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':1440,'height':1000},service_workers='allow');page=ctx.new_page();page.set_default_timeout(45000)
  def serve(route):
   relative=unquote(urlsplit(route.request.url).path[len('/Aster/'):]) or 'index.html';path=(ROOT/relative).resolve()
   if ROOT not in path.parents or not path.is_file() or relative.startswith('.'):return route.fulfill(status=404,body='Not a runtime resource')
   mime=mimetypes.guess_type(str(path))[0] or 'application/octet-stream';return route.fulfill(status=200,body=path.read_bytes(),content_type=mime)
  ctx.route(HOST+'**',serve);page.on('pageerror',lambda e:report['errors'].append(str(e)))
  def response(r):
   if ('/NotepadXP/src/' in r.url and r.url.endswith('.mjs')) or r.url.rstrip('/').endswith('/TwinForge'):
    try:report['applicationSources'][r.url]=hashlib.sha256(r.body()).hexdigest()
    except Exception:pass
  page.on('response',response)
  def js(s):return page.evaluate('async()=>{const OS=Aster;'+s+'}')
  try:
   page.goto(HOST);page.wait_for_function('Aster.booted && Aster.webIO');page.locator('#boot').wait_for(state='detached');js("await OS.ready;OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();for(const w of [...OS.windows.values()])await w.close(true);await OS.fs.write('/Documents/integration-live.txt','Opened from Aster — żółć 日本語','text/plain');window.app=OS.webCatalog.apps.find(a=>a.repo==='NotepadXP');window.live=OS.openApp(app.id);await live.ready;")
   page.wait_for_function('Aster.webIO.sessions.some(s=>s.app===app.id&&s.state==="connected")');frame=page.locator('.web-app-frame').element_handle().content_frame();frame.wait_for_function('window.notepad && window.AsterFiles?.connected');frame.evaluate('notepad.ready')
   frame.locator('#text-input').focus();page.keyboard.press('Control+o');frame.locator('[data-action="browse"]').click();d=page.get_by_role('dialog',name='Open from Aster',exact=True);d.locator('[data-io-path="/Documents/integration-live.txt"]').click();page.screenshot(path=str(OUT/'notepad-aster-picker.png'));d.get_by_role('button',name='Open',exact=True).click();frame.wait_for_function('document.querySelector("#file-name")?.value==="integration-live.txt"');frame.locator('[data-action="confirm"]').click();frame.wait_for_function('document.querySelector("#title").textContent.startsWith("integration-live.txt")');text=frame.evaluate('notepad.execute("document_read",{})');assert text['text']=='Opened from Aster — żółć 日本語',text
   report['checks'].append({'name':'Unchanged deployed app opened actual Aster Unicode file through its Browse command','status':'PASS','text':text['text']})
   frame.locator('#text-input').focus();page.keyboard.press('Control+a');page.keyboard.insert_text('Written by the deployed app — Ω 日本語');page.keyboard.press('Control+s');d=page.get_by_role('dialog',name='Allow this app to edit?',exact=True);d.get_by_role('button',name='Allow editing',exact=True).click()
   for attempt in range(120):
    result=js("return {text:await OS.fs.text(await OS.fs.read('/Documents/integration-live.txt')),history:(await OS.history.list('/Documents/integration-live.txt')).length};")
    if result['text'].lstrip('\ufeff')=='Written by the deployed app — Ω 日本語':break
    page.wait_for_timeout(100)
   else:raise AssertionError('Deployed application did not save the edited bytes: '+str(result))
   assert result['history']>0,result;report['checks'].append({'name':'Unchanged app wrote through granted handle and retained a prior file version','status':'PASS','result':result})
   assert frame.evaluate('notepad.execute("document_read",{})')['text']=='Written by the deployed app — Ω 日本語';page.screenshot(path=str(OUT/'notepad-written-to-aster.png'))
   report['connection']=js('return OS.webIO.sessions;');report['applicationURL']=frame.url;assert report['applicationSources'],'No real app source responses recorded'
   # Test a second unchanged, genuinely different directory-handle consumer.
   js("await live.close(true);await OS.fs.mkdir('/Documents/TwinForgeBridge');await OS.fs.write('/Documents/TwinForgeBridge/source.txt','Shared project');window.twinApp=OS.webCatalog.apps.find(a=>a.repo==='TwinForge');window.twin=OS.openApp(twinApp.id);await twin.ready;")
   page.wait_for_function('Aster.webIO.sessions.some(s=>s.app===twinApp.id&&s.state==="connected")')
   tf=page.locator('.web-app-frame').element_handle().content_frame();tf.wait_for_function('window.AsterFiles?.connected && document.querySelector("#pane-0 .volume-bar select")?.options.length')
   tf.locator('#pane-0 .mount-folder').click();d=page.get_by_role('dialog',name='Choose Aster folder',exact=True)
   d.get_by_label('Aster folder',exact=True).fill('/Documents/TwinForgeBridge');d.get_by_role('button',name='Go',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent.startsWith("/Documents/TwinForgeBridge")')
   d.get_by_role('button',name='Select folder',exact=True).click();tf.wait_for_function('document.querySelector("#pane-0 .volume-bar select")?.selectedOptions[0]?.textContent==="TwinForgeBridge" && document.querySelector("#pane-0 .a11y-rows")?.textContent.includes("source.txt")')
   tf.locator('.functionbar [data-action="mkdir"]').click();d=tf.get_by_role('dialog',name='New folder',exact=True);d.locator('#prompt-value').fill('FromTwinForge');d.get_by_role('button',name='Create',exact=True).click()
   for _ in range(100):
    created=js("return await OS.fs.stat('/Documents/TwinForgeBridge/FromTwinForge');")
    if created:break
    page.wait_for_timeout(100)
   assert created and created['kind']=='directory',created
   assert js("return await OS.fs.text(await OS.fs.read('/Documents/TwinForgeBridge/source.txt'));")=='Shared project'
   page.screenshot(path=str(OUT/'twinforge-aster-folder.png'));report['checks'].append({'name':'Unchanged TwinForge connected an Aster directory and created a real child using its F7 workflow','status':'PASS','path':created['path']});report['twinforgeURL']=tf.url
   assert not report['errors'],report['errors'];report['status']='PASS'
  except Exception as e:
   report['status']='FAIL';report['error']=str(e);page.screenshot(path=str(OUT/'failure.png'));raise
  finally:
   (OUT/'results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));browser.close()
if __name__=='__main__':main()
