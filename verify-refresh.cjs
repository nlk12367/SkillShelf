'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {_electron}=require('playwright');

(async()=>{
  const directory=path.join(__dirname,'.test-desktop-'+randomUUID());
  const tool=path.join(directory,'tool');fs.mkdirSync(tool,{recursive:true});
  let desktop;
  const checks=[];
  try{
    for(const file of ['build-tool.py','scan-skills.py','tool.js','tool.css','tool-shell.html','skill-guide.tsv','plugin-guide.tsv'])fs.copyFileSync(path.join(__dirname,file),path.join(tool,file));
    fs.cpSync(path.join(__dirname,'desktop'),path.join(tool,'desktop'),{recursive:true,filter:file=>!file.includes('__pycache__')});
    fs.cpSync(path.join(__dirname,'assets'),path.join(tool,'assets'),{recursive:true});
    const config={schemaVersion:1,skillRoots:['./skills'],pluginCaches:['./plugins'],includeAuxiliary:false};
    const configFile=path.join(tool,'skills-config.json');fs.writeFileSync(configFile,JSON.stringify(config));
    function skill(relative,name,body){const file=path.join(tool,relative,'SKILL.md');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`---\nname: ${name}\ndescription: Synthetic skill.\n---\n# Test\n${body}\n`);return file;}
    const original=skill('skills/sepia-recreate','sepia-recreate','Original marker');
    const pluginRoot=path.join(tool,'plugins/example/ecc/1.0.0');fs.mkdirSync(path.join(pluginRoot,'.codex-plugin'),{recursive:true});fs.writeFileSync(path.join(pluginRoot,'.codex-plugin/plugin.json'),JSON.stringify({name:'ecc',skills:'./skills'}));
    skill('plugins/example/ecc/1.0.0/skills/api-design','api-design','Original plugin');
    const python=process.env.SKILLS_TOOL_PYTHON||'python';
    execFileSync(python,['-X','utf8',path.join(tool,'build-tool.py')],{cwd:tool,windowsHide:true});
    const environment={...process.env,SKILLS_TOOL_TEST_MODE:'1',SKILLS_TOOL_USER_DATA:path.join(directory,'profile'),CODEX_HOME:path.join(directory,'empty-codex')};delete environment.ELECTRON_RUN_AS_NODE;
    desktop=await _electron.launch({args:[path.join(tool,'desktop/main.cjs')],env:environment,timeout:30000});
    const page=await desktop.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.waitForFunction(()=>window.SkillsTool?.count===2&&typeof window.skillsDesktop?.refreshCatalog==='function');
    let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
    const pid=await desktop.evaluate(()=>process.pid);
    await page.evaluate(()=>{window.__refreshWindowMarker='unchanged';});
    await page.locator('#search').fill('sepia-recreate');await page.waitForTimeout(180);
    await page.locator('#task').fill('請保留這段正在編輯的任務。');
    await page.locator('#detail .favorite-button').click();
    await page.locator('#resources > summary').click();await page.locator('.resource-manual > summary').click();
    await page.locator('#resource-intake').fill(original+'\n'+configFile);await page.locator('#add-resource').click();
    await page.locator('[data-resource-selected="1"]').uncheck();
    await page.locator('#resource-intake').fill('尚未收納的路徑草稿');
    skill('skills/refresh-probe','refresh-probe','New skill marker');
    skill('skills/sepia-recreate','sepia-recreate','Updated body marker');
    const plugin2=path.join(tool,'plugins/example/ecc/2.0.0');fs.mkdirSync(path.join(plugin2,'.codex-plugin'),{recursive:true});fs.writeFileSync(path.join(plugin2,'.codex-plugin/plugin.json'),JSON.stringify({name:'ecc',skills:'./skills'}));
    skill('plugins/example/ecc/2.0.0/skills/api-design','api-design','Updated plugin marker');
    skill('plugins/example/ecc/2.0.0/skills/python-patterns','python-patterns','New plugin marker');
    async function update(){await page.locator('#refresh').click();await page.waitForFunction(()=>!document.getElementById('refresh').disabled,{},{timeout:30000});}
    await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('refresh').disabled);
    assert.equal(await page.locator('#refresh').getAttribute('aria-busy'),'true');
    // A second request while the first scan is pending joins the same build.
    await page.evaluate(()=>window.skillsDesktop.refreshCatalog());
    await page.waitForFunction(()=>window.SkillsTool.count===4&&!document.getElementById('refresh').disabled,{},{timeout:30000});
    checks.push({check:'refresh button performs a real asynchronous scan and adopts added local and latest-version plugin Skills',result:'passed'});
    assert.equal(navigations,0);assert.equal(await desktop.evaluate(()=>process.pid),pid);assert.equal(await page.evaluate(()=>window.__refreshWindowMarker),'unchanged');
    checks.push({check:'catalog updates without a page reload or app restart',result:'passed'});
    assert.equal(await page.locator('#search').inputValue(),'sepia-recreate');assert.equal(await page.locator('#task').inputValue(),'請保留這段正在編輯的任務。');assert.equal(await page.locator('.resource-item').count(),2);
    assert.equal(await page.locator('[data-resource-selected="0"]').isChecked(),true);assert.equal(await page.locator('[data-resource-selected="1"]').isChecked(),false);
    assert.equal(await page.locator('#resource-intake').inputValue(),'尚未收納的路徑草稿');assert.equal(await page.locator('#detail .favorite-button').getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('#prompt-preview').textContent(),/請保留這段正在編輯的任務/);
    checks.push({check:'refresh retains query, task, favorites, collected resources, checkbox selection, and unsubmitted path draft',result:'passed'});
    assert.match(await page.locator('pre.original-text').textContent(),/Updated body marker/);
    assert.ok((await page.evaluate(()=>window.SkillsTool.search('refresh-probe'))).some(item=>item.name==='refresh-probe'));
    assert.ok((await page.evaluate(()=>window.SkillsTool.search('ecc:python-patterns'))).some(item=>item.name==='ecc:python-patterns'));
    await page.locator('#manage-open').click();assert.match(await page.locator('#manager-body').textContent(),/2\.0\.0/);await page.locator('#manage-close').click();
    checks.push({check:'search index, Skill content, source counts, and plugin version reflect the new catalog',result:'passed'});
    fs.unlinkSync(path.join(tool,'skills/refresh-probe/SKILL.md'));fs.unlinkSync(path.join(plugin2,'skills/python-patterns/SKILL.md'));await update();
    assert.equal(await page.evaluate(()=>window.SkillsTool.count),2);assert.equal((await page.evaluate(()=>window.SkillsTool.search('refresh-probe'))).length,0);
    checks.push({check:'removed local and plugin Skills disappear on the next button update',result:'passed'});
    const indexStamp=await page.locator('#index-stamp').textContent();const scanDate=await page.locator('#scan-date').textContent();
    fs.writeFileSync(configFile,'invalid JSON');await update();
    assert.match(await page.locator('#toast').textContent(),/更新失敗/);assert.equal(await page.locator('#index-stamp').textContent(),indexStamp);assert.equal(await page.locator('#scan-date').textContent(),scanDate);assert.equal(await page.locator('#task').inputValue(),'請保留這段正在編輯的任務。');
    checks.push({check:'scan errors preserve the previous catalog and task and return an enabled retry button',result:'passed'});
    fs.writeFileSync(configFile,JSON.stringify(config));await update();assert.match(await page.locator('#toast').textContent(),/清單已更新/);
    const [one,two]=await page.evaluate(()=>Promise.all([window.skillsDesktop.refreshCatalog(),window.skillsDesktop.refreshCatalog()]));assert.equal(one.scannedAt,two.scannedAt);
    checks.push({check:'retry succeeds after fixing the source and concurrent refresh requests share one scan',result:'passed'});
    await page.locator('#task').fill('移除選取項目後也要保留。');
    fs.unlinkSync(original);await update();
    assert.equal(await page.evaluate(()=>window.SkillsTool.count),1);assert.equal(await page.locator('#copy-prompt').count(),0);assert.equal(await page.locator('#search').inputValue(),'sepia-recreate');
    checks.push({check:'removing the selected Skill with no matching results clears the stale command',result:'passed'});
    skill('skills/sepia-recreate','sepia-recreate','Restored marker');await update();
    assert.equal(await page.locator('#task').inputValue(),'移除選取項目後也要保留。');assert.equal(await page.locator('#detail .favorite-button').getAttribute('aria-pressed'),'true');
    await page.locator('#resources > summary').click();assert.equal(await page.locator('.resource-item').count(),2);assert.equal(await page.locator('[data-resource-selected="1"]').isChecked(),false);
    checks.push({check:'restored Skills retain the draft, saved favorite, and resources after an empty search result',result:'passed'});
    assert.equal(navigations,0);assert.deepEqual(errors,[]);
    const report={at:new Date().toISOString(),passed:checks.length,checks,errors};fs.writeFileSync(path.join(__dirname,'refresh-verification-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{
    if(desktop)await desktop.close();
    if(path.dirname(directory)!==__dirname||!path.basename(directory).startsWith('.test-desktop-'))throw new Error('Unsafe test cleanup path.');
    fs.rmSync(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
