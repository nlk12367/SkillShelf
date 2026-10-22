'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {_electron}=require('playwright');

(async()=>{
  const executable=path.resolve(process.env.SKILLS_TOOL_PACKAGED_EXE||'dist/windows/win-unpacked/SkillShelf.exe');
  const directory=path.join(__dirname,'dist','packaged-test-'+randomUUID());
  const profile=path.join(directory,'profile');const catalog=path.join(profile,'catalog');
  fs.mkdirSync(catalog,{recursive:true});
  const configuration={schemaVersion:1,skillRoots:['./skills'],pluginCaches:['./plugins'],includeAuxiliary:false};
  const configFile=path.join(catalog,'skills-config.json');fs.writeFileSync(configFile,JSON.stringify(configuration));
  function skill(relative,name,body='Synthetic skill.'){
    const file=path.join(catalog,relative,'SKILL.md');fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,`---\nname: ${name}\ndescription: ${body}\n---\n# Synthetic\n${body}\n`);return file;
  }
  skill('skills/sepia-recreate','sepia-recreate');
  const plugin=path.join(catalog,'plugins/example/ecc/1.0.0/.codex-plugin');fs.mkdirSync(plugin,{recursive:true});
  fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({name:'ecc',skills:'./skills'}));
  skill('plugins/example/ecc/1.0.0/skills/api-design','api-design');
  const resource=path.join(directory,'需求 文件.md');fs.writeFileSync(resource,'Synthetic requirement.');
  const digest=()=>createHash('sha256').update(fs.readFileSync(resource)).digest('hex');const before=digest();
  let desktop,backedUp=false;const checks=[];
  try{
    const environment={...process.env,PATH:path.join(process.env.SystemRoot,'System32'),
      SKILLS_TOOL_PYTHON:path.join(directory,'no-system-python.exe'),SKILLS_TOOL_USER_DATA:profile,
      CODEX_HOME:path.join(directory,'empty-codex'),SKILLS_TOOL_TEST_MODE:'1'};
    delete environment.ELECTRON_RUN_AS_NODE;delete environment.NODE_PATH;delete environment.PYTHONPATH;
    desktop=await _electron.launch({executablePath:executable,env:environment,timeout:60000});
    const page=await desktop.firstWindow();
    await page.waitForFunction(()=>window.skillsDesktop&&window.SkillsTool);
    if(await page.evaluate(async()=>typeof window.skillsDesktop.translationSettings==='function'&&!(await window.skillsDesktop.translationSettings()).onboarded)){await page.locator('#translation-onboarding').waitFor({state:'visible'});await page.locator('#translation-skip').click();await page.locator('#translation-onboarding').waitFor({state:'hidden'});}
    await page.waitForFunction(()=>window.SkillsTool?.count===2);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    assert.equal(await desktop.evaluate(({app})=>app.isPackaged),true);
    assert.equal(await desktop.evaluate(({app})=>app.getName()),'SkillShelf');
    const resources=await desktop.evaluate(()=>process.resourcesPath);
    const paths={data:path.join(await desktop.evaluate(({app})=>app.getPath('userData')),'catalog'),source:path.join(resources,'tool'),python:path.join(resources,'python','python.exe')};
    assert.equal(paths.data,catalog);assert.equal(paths.python,path.join(path.dirname(executable),'resources/python/python.exe'));
    assert.match(execFileSync(paths.python,['-I','-c','import sys; print(sys.version)'],{env:environment,encoding:'utf8',windowsHide:true}),/^3\.14\.9/);
    checks.push('installed App scans local and namespaced plugin Skills with bundled Python and no Node/Python on PATH');
    assert.ok(fs.existsSync(path.join(catalog,'Skills查詢工具.html')));
    for(const file of ['Skills查詢工具.html','skills-index.json','skills-raw.json'])assert.equal(fs.existsSync(path.join(paths.source,file)),false);
    checks.push('generated catalog and settings stay in user data, outside installed resources');
    await desktop.evaluate(async({clipboard,ClipboardItem})=>{
      const entries=[];for(const item of await clipboard.read()){const payload={};for(const type of item.types)payload[type]=await item.getType(type);entries.push(new ClipboardItem(payload));}
      globalThis.__packagedClipboardBackup=entries;
    });backedUp=true;
    await page.locator('#search').fill('sepia-recreate');await page.waitForTimeout(200);
    await page.locator('#task').fill('請根據資源改寫文章。');await page.locator('#detail .favorite-button').click();
    await page.locator('#resources > summary').click();
    await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='packaged-test-file';document.body.append(input);});
    await page.locator('#packaged-test-file').setInputFiles(resource);
    await page.evaluate(()=>{const transfer=new DataTransfer();transfer.items.add(document.getElementById('packaged-test-file').files[0]);document.getElementById('resource-dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));});
    await page.waitForFunction(()=>document.querySelectorAll('.resource-item').length===1);
    assert.equal(await page.locator('#resource-0').inputValue(),resource);
    checks.push('installed renderer resolves dropped files to original full paths');
    await page.locator('[data-remove-resource="0"]').click();
    execFileSync(process.env.SKILLS_TOOL_PYTHON||'python',['-X','utf8',path.join(__dirname,'desktop/test-file-clipboard.py')],{input:JSON.stringify([resource]),encoding:'utf8',windowsHide:true});
    await page.locator('#paste-resource-files').click();await page.waitForFunction(()=>document.querySelectorAll('.resource-item').length===1);
    assert.equal(await page.locator('#resource-0').inputValue(),resource);
    checks.push('Windows copied files paste through bundled ctypes without a system Python');
    await page.locator('#copy-prompt').click();
    assert.equal(await desktop.evaluate(async({clipboard})=>clipboard.readText()),`/sepia-recreate\n\n# 任務\n請根據資源改寫文章。\n\n# 資源\n1. 檔案：需求 文件.md\n   路徑：${resource}`);
    checks.push('Markdown copy retains exact slash command, task, filename and full path');
    const pid=await desktop.evaluate(()=>process.pid);let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
    skill('skills/new-test-skill','new-test-skill');
    const update=async()=>{await page.locator('#refresh').click();await page.waitForFunction(()=>!document.getElementById('refresh').disabled,{},{timeout:30000});};
    await update();assert.equal(await page.evaluate(()=>window.SkillsTool.count),3);
    assert.equal(await desktop.evaluate(()=>process.pid),pid);assert.equal(navigations,0);
    assert.equal(await page.locator('#task').inputValue(),'請根據資源改寫文章。');assert.equal(await page.locator('.resource-item').count(),1);
    assert.equal(await page.locator('#detail .favorite-button').getAttribute('aria-pressed'),'true');
    checks.push('refresh adds Skills without restart and preserves task, resources and favorite');
    fs.writeFileSync(configFile,'{broken');await update();assert.equal(await page.evaluate(()=>window.SkillsTool.count),3);
    fs.writeFileSync(configFile,JSON.stringify(configuration));fs.rmSync(path.join(catalog,'skills/new-test-skill'),{recursive:true});
    await update();assert.equal(await page.evaluate(()=>window.SkillsTool.count),2);
    checks.push('failed scans retain the previous catalog and retry adopts removed Skills');
    await page.reload();await page.locator('#search').fill('sepia-recreate');await page.waitForTimeout(200);
    await page.locator('#resources > summary').click();assert.equal(await page.locator('.resource-item').count(),1);
    assert.equal(await page.locator('#detail .favorite-button').getAttribute('aria-pressed'),'true');
    checks.push('saved resources and favorites survive a page reload');
    assert.equal(digest(),before);assert.deepEqual(errors,[]);
    checks.push('no renderer errors and original resource file is unchanged');
    const report={at:new Date().toISOString(),executable,passed:checks.length,checks,errors};
    fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{
    if(desktop){
      if(backedUp)await desktop.evaluate(async({clipboard})=>{const previous=globalThis.__packagedClipboardBackup;if(previous.length)await clipboard.write(previous);else await clipboard.clear();});
      await desktop.close();
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
