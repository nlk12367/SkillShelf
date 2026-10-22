'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {_electron}=require('playwright');

(async()=>{
  const checks=[];
  const directory=path.join(__dirname,'.test-desktop-'+randomUUID());
  fs.mkdirSync(directory);
  const first=path.join(directory,'研究 原稿.md');const second=path.join(directory,'參考資料.txt');
  fs.writeFileSync(first,'Synthetic source file.');fs.writeFileSync(second,'Synthetic reference file.');
  const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const before=[digest(first),digest(second)];
  let desktop,backedUp=false;
  try{
    const environment={...process.env,SKILLS_TOOL_USER_DATA:path.join(directory,'profile'),SKILLS_TOOL_TEST_MODE:'1'};delete environment.ELECTRON_RUN_AS_NODE;
    desktop=await _electron.launch({args:[path.join(__dirname,'desktop/main.cjs')],env:environment,timeout:30000});
    const page=await desktop.firstWindow();
    await page.waitForFunction(()=>window.skillsDesktop&&window.SkillsTool);
    if(await page.evaluate(async()=>typeof window.skillsDesktop.translationSettings==='function'&&!(await window.skillsDesktop.translationSettings()).onboarded)){await page.locator('#translation-onboarding').waitFor({state:'visible'});await page.locator('#translation-skip').click();await page.locator('#translation-onboarding').waitFor({state:'hidden'});}
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.waitForFunction(()=>window.SkillsTool&&window.skillsDesktop);
    // Materialize the current clipboard before any test writes, and restore it
    // in finally. Original clipboard content is never logged or exported.
    await desktop.evaluate(async({clipboard,ClipboardItem})=>{
      const entries=[];
      for(const item of await clipboard.read()){
        const payload={};for(const type of item.types)payload[type]=await item.getType(type);
        entries.push(new ClipboardItem(payload));
      }
      globalThis.__skillsClipboardBackup=entries;
    });backedUp=true;
    assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
    assert.equal(await page.evaluate(()=>typeof window.skillsDesktop.chooseResources),'function');
    checks.push({check:'isolated sandbox renderer exposes only the native resource bridge',result:'passed'});
    await page.locator('#search').fill('sepia-recreate');await page.waitForTimeout(180);
    await page.locator('#task').fill('請依原稿改寫，並參考第二份資料。');
    await page.locator('#resources > summary').click();
    await desktop.evaluate(({dialog},paths)=>{globalThis.__skillsDialogOriginal=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:paths});},[first,second]);
    await page.locator('#choose-resource-files').click();await page.waitForFunction(()=>document.querySelectorAll('.resource-item').length===2);
    assert.equal(await page.locator('#resource-0').inputValue(),first);assert.equal(await page.locator('#resource-1').inputValue(),second);
    checks.push({check:'native file dialog returns original absolute paths with Chinese names and spaces',result:'passed'});
    await page.locator('[data-remove-resource="1"]').click();await page.locator('[data-remove-resource="0"]').click();
    await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.id='native-test-files';document.body.append(input);});
    await page.locator('#native-test-files').setInputFiles([first,second]);
    const drop=()=>page.evaluate(()=>{const transfer=new DataTransfer();for(const file of document.getElementById('native-test-files').files)transfer.items.add(file);document.getElementById('resource-dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));});
    await drop();await page.waitForFunction(()=>document.querySelectorAll('.resource-item').length===2);
    assert.equal(await page.locator('#resource-0').inputValue(),first);assert.equal(await page.locator('#resource-1').inputValue(),second);
    await drop();await page.waitForTimeout(150);assert.equal(await page.locator('.resource-item').count(),2);
    checks.push({check:'disk-backed File drop resolves real paths through webUtils and deduplicates repeated drops',result:'passed'});
    await page.locator('[data-resource-selected="1"]').uncheck();await page.locator('#copy-prompt').click();
    const markdown=await desktop.evaluate(async({clipboard})=>clipboard.readText());
    assert.equal(markdown,`/sepia-recreate\n\n# 任務\n請依原稿改寫，並參考第二份資料。\n\n# 資源\n1. 檔案：研究 原稿.md\n   路徑：${first}`);
    checks.push({check:'native Markdown copy includes only checked resources with exact original path',result:'passed'});
    await page.reload();await page.locator('#resources > summary').click();assert.equal(await page.locator('.resource-item').count(),2);
    assert.equal(await page.locator('[data-resource-selected="1"]').isChecked(),false);
    checks.push({check:'native resource paths and selections persist after reload',result:'passed'});
    await page.locator('[data-remove-resource="1"]').click();await page.locator('[data-remove-resource="0"]').click();
    if(process.platform==='win32'){
      execFileSync(process.env.SKILLS_TOOL_PYTHON||'python',['-X','utf8',path.join(__dirname,'desktop/test-file-clipboard.py')],{input:JSON.stringify([first,second]),encoding:'utf8',windowsHide:true});
      await page.locator('#paste-resource-files').click();await page.waitForFunction(()=>document.querySelectorAll('.resource-item').length===2);
      assert.equal(await page.locator('#resource-0').inputValue(),first);assert.equal(await page.locator('#resource-1').inputValue(),second);
      checks.push({check:'Windows CF_HDROP paste button reads original full paths from the real file clipboard',result:'passed'});
      await page.locator('[data-remove-resource="1"]').click();await page.locator('[data-remove-resource="0"]').click();
      await page.locator('#resource-dropzone').focus();
      await page.locator('#resource-dropzone').press('Control+v');
      await page.waitForFunction(()=>document.querySelectorAll('.resource-item').length===2);
      assert.equal(await page.locator('#resource-0').inputValue(),first);
      checks.push({check:'Ctrl+V in the resource drop zone imports native copied files',result:'passed'});
    }
    assert.deepEqual([digest(first),digest(second)],before);checks.push({check:'source files were neither moved nor modified',result:'passed'});
    const {inspectPaths}=require('./desktop/resources.cjs');assert.throws(()=>inspectPaths(['relative.md']));assert.throws(()=>inspectPaths([path.join(directory,'missing.md')]));
    checks.push({check:'native inspection rejects missing files and fabricated relative paths',result:'passed'});
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(__dirname,'skills-desktop-native.png')});
    const report={at:new Date().toISOString(),platform:process.platform,electron:await desktop.evaluate(({app})=>process.versions.electron),passed:checks.length,checks,errors};
    fs.writeFileSync(path.join(__dirname,'desktop-verification-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{
    if(desktop){
      if(backedUp)await desktop.evaluate(async({clipboard})=>{const previous=globalThis.__skillsClipboardBackup;if(previous.length)await clipboard.write(previous);else await clipboard.clear();delete globalThis.__skillsClipboardBackup;});
      await desktop.close();
    }
    if(path.dirname(directory)!==__dirname||!path.basename(directory).startsWith('.test-desktop-'))throw new Error('Unsafe test cleanup path.');
    fs.rmSync(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
