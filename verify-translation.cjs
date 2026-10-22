'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {_electron}=require('playwright');

(async()=>{
  const directory=path.join(__dirname,'dist','translation-ui-'+randomUUID());const profile=path.join(directory,'profile');
  const packaged=process.env.SKILLS_TOOL_PACKAGED_EXE;
  const tool=packaged?path.join(profile,'catalog'):path.join(directory,'tool');fs.mkdirSync(tool,{recursive:true});
  if(!packaged){
    for(const file of ['build-tool.py','scan-skills.py','tool-shell.html','tool.js','ui-language.js','tool.css','skill-guide.tsv','plugin-guide.tsv'])fs.copyFileSync(path.join(__dirname,file),path.join(tool,file));
    fs.cpSync(path.join(__dirname,'desktop'),path.join(tool,'desktop'),{recursive:true,filter:file=>!file.includes('__pycache__')});fs.cpSync(path.join(__dirname,'assets'),path.join(tool,'assets'),{recursive:true});
  }
  fs.writeFileSync(path.join(tool,'skills-config.json'),JSON.stringify({skillRoots:['./skills'],pluginCaches:[],includeAuxiliary:false}));
  const skillFile=path.join(tool,'skills/fixture-market/SKILL.md');fs.mkdirSync(path.dirname(skillFile),{recursive:true});
  fs.writeFileSync(skillFile,'---\nname: fixture-market\ndescription: Create marketing copy.\n---\n# Copy\nPRIVATE FULL BODY\n');
  const python=process.env.SKILLS_TOOL_PYTHON||'python';if(!packaged)execFileSync(python,['-X','utf8',path.join(tool,'build-tool.py')],{windowsHide:true});
  let desktop;const checks=[];const errors=[];
  async function launch(selectedProfile=profile){
    const env={...process.env,SKILLS_TOOL_TEST_MODE:'1',SKILLS_TOOL_USER_DATA:selectedProfile,CODEX_HOME:path.join(directory,'empty-codex')};delete env.ELECTRON_RUN_AS_NODE;
    if(packaged&&selectedProfile!==profile){const data=path.join(selectedProfile,'catalog');fs.mkdirSync(data,{recursive:true});fs.writeFileSync(path.join(data,'skills-config.json'),JSON.stringify({skillRoots:[],pluginCaches:[],includeAuxiliary:false}));}
    desktop=await _electron.launch({...(packaged?{executablePath:path.resolve(packaged)}:{args:[path.join(tool,'desktop/main.cjs')]}),env});
    const page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.waitForFunction(()=>window.SkillsTool&&window.skillsDesktop?.translationSettings);return page;
  }
  try{
    let page=await launch();await page.locator('#translation-onboarding').waitFor({state:'visible'});
    // Hidden packaged windows can stall native capture on Windows. Capture
    // artifacts in the source run; keep packaged assertions independent of it.
    if(!packaged)await page.screenshot({path:path.join(__dirname,'dist','setup-zh-TW.png')});
    await page.locator('#onboarding-language').selectOption('en');
    await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.getElementById('translation-setup').textContent==='Set up API');
    if(!packaged)await page.screenshot({path:path.join(__dirname,'dist','setup-en.png')});
    assert.equal((await page.evaluate(()=>window.skillsDesktop.translationSettings())).enabled,false);
    await page.locator('#translation-skip').click();await page.locator('#translation-onboarding').waitFor({state:'hidden'});
    assert.equal((await page.evaluate(()=>window.skillsDesktop.translationSettings())).onboarded,true);
    checks.push('fresh profile asks once; declining records disabled translation');
    await desktop.close();desktop=null;page=await launch();await page.waitForTimeout(250);
    assert.equal(await page.locator('#translation-onboarding').isVisible(),false);
    await page.waitForFunction(()=>document.documentElement.lang==='en');
    assert.equal((await page.evaluate(()=>window.skillsDesktop.translationSettings())).uiLanguage,'en');
    assert.equal((await page.locator('#refresh').textContent()).trim(),'Update skills');
    checks.push('English choice survives restart without repeating initialization');
    const positions=await page.evaluate(()=>({settings:document.getElementById('translation-open').getBoundingClientRect().top,update:document.getElementById('refresh').getBoundingClientRect().top}));assert(positions.settings<positions.update);
    checks.push('decline survives app restart and settings remain above Update in the sidebar');
    await page.locator('#translation-open').click();await page.locator('#translation-settings').waitFor({state:'visible'});
    await page.locator('#settings-language').selectOption('zh-TW');
    await page.locator('#translation-enabled').check();await page.locator('#translation-base').fill('https://api.example.com/v1');await page.locator('#translation-model').fill('synthetic-model');await page.locator('#translation-key').fill('synthetic-ui-key');await page.locator('#translation-save').click();
    await page.locator('#translation-settings').waitFor({state:'hidden'});
    const publicSettings=await page.evaluate(()=>window.skillsDesktop.translationSettings());assert.equal(publicSettings.hasKey,true);assert.equal(publicSettings.enabled,true);assert(!JSON.stringify(publicSettings).includes('synthetic-ui-key'));
    assert(!fs.readFileSync(path.join(profile,'ai-translation-settings.json'),'utf8').includes('synthetic-ui-key'));
    assert.equal(await page.locator('#translation-key').inputValue(),'');assert(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('synthetic-ui-key'));
    checks.push('API form stores an OS-encrypted key and returns only key presence to the renderer');
    await desktop.evaluate(()=>{
      globalThis.__translationCalls=[];globalThis.__translationFailure=false;
      globalThis.fetch=async(url,options)=>{
        const body=JSON.parse(options.body);globalThis.__translationCalls.push(body);
        if(globalThis.__translationFailure)return new Response('do not expose provider error',{status:401});
        const source=JSON.parse(body.messages[1].content);
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({translations:source.skills.map(item=>({id:item.id,title:'撰寫行銷文案',summary:'依需求撰寫網站與產品行銷文案。',category:'商務與營運',keywords:['文案','行銷']}))})}}]}),{status:200});
      };
    });
    await page.locator('#task').fill('PRIVATE USER TASK');
    let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});const pid=await desktop.evaluate(()=>process.pid);
    const update=async()=>{await page.locator('#refresh').click();await page.waitForFunction(()=>!document.getElementById('refresh').disabled,{},{timeout:30000});};
    await update();assert.equal(await page.evaluate(()=>window.SkillsTool.guideCoverage),1);assert.equal(await page.locator('.card-title').first().textContent(),'撰寫行銷文案');
    assert.equal((await page.evaluate(()=>window.SkillsTool.search('行銷文案')))[0].name,'fixture-market');
    assert.match(await page.locator('#prompt-preview').textContent(),/^\/fixture-market/);
    assert.equal(await page.locator('#task').inputValue(),'PRIVATE USER TASK');assert.equal(navigations,0);assert.equal(await desktop.evaluate(()=>process.pid),pid);
    const requests=await desktop.evaluate(()=>globalThis.__translationCalls);assert.equal(requests.length,1);assert(!JSON.stringify(requests).includes('PRIVATE'));assert(!JSON.stringify(requests).includes(directory));
    checks.push('Update translates missing descriptions into Chinese search/display without changing commands or task state');
    await page.locator('#resources > summary').click();await page.locator('.resource-manual > summary').click();
    await page.locator('#resource-intake').fill(skillFile);await page.locator('#add-resource').click();
    await page.locator('#translation-open').click();await page.locator('#settings-language').selectOption('en');
    await page.locator('#translation-save').click();await page.locator('#translation-settings').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.documentElement.lang==='en');
    assert.match(await page.locator('#prompt-preview').textContent(),/^\/fixture-market\n\n# Task\nPRIVATE USER TASK/);
    assert((await page.locator('#prompt-preview').textContent()).includes('# Resources'));
    assert((await page.locator('#prompt-preview').textContent()).includes(skillFile));
    assert.equal(await page.locator('#task').inputValue(),'PRIVATE USER TASK');
    assert.match(await page.locator('.card-summary').first().textContent(),/Create marketing copy/);
    await page.locator('#translation-open').click();await page.locator('#settings-language').selectOption('zh-TW');
    await page.locator('#translation-save').click();await page.locator('#translation-settings').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.documentElement.lang==='zh-Hant-TW');
    assert((await page.locator('#prompt-preview').textContent()).includes('# 任務'));
    assert((await page.locator('#prompt-preview').textContent()).includes(skillFile));
    checks.push('switching UI languages preserves slash commands, tasks and exact resource paths in Markdown');
    await update();assert.equal(await desktop.evaluate(()=>globalThis.__translationCalls.length),1);
    checks.push('repeated updates reuse cached translations without another AI request');
    fs.appendFileSync(skillFile,'Changed source.');await desktop.evaluate(()=>{globalThis.__translationFailure=true;});await update();
    assert.equal(await page.evaluate(()=>window.SkillsTool.count),1);assert.match(await page.locator('#translation-status').textContent(),/API Key/);assert.equal(await page.locator('#task').inputValue(),'PRIVATE USER TASK');
    assert(!(await page.locator('#translation-status').textContent()).includes('do not expose'));
    checks.push('source changes invalidate cached text; provider errors preserve the refreshed catalog and editable task');
    await page.locator('#translation-open').click();assert.equal(await page.locator('#translation-key').inputValue(),'');await page.locator('#translation-remove-key').click();await page.locator('#translation-settings').waitFor({state:'hidden'});
    assert.equal((await page.evaluate(()=>window.skillsDesktop.translationSettings())).hasKey,false);const before=await desktop.evaluate(()=>globalThis.__translationCalls.length);await update();assert.equal(await desktop.evaluate(()=>globalThis.__translationCalls.length),before);
    checks.push('removing a key disables future requests and never displays the old key');
    await desktop.close();desktop=null;page=await launch(path.join(directory,'yes-profile'));
    await page.locator('#translation-onboarding').waitFor({state:'visible'});await page.locator('#translation-setup').click();await page.locator('#translation-settings').waitFor({state:'visible'});
    assert.equal(await page.locator('#translation-enabled').isChecked(),true);await page.locator('#translation-close').click();assert.equal((await page.evaluate(()=>window.skillsDesktop.translationSettings())).onboarded,true);
    checks.push('choosing translation opens API setup; closing setup still records the one-time choice');
    assert.deepEqual(errors,[]);console.log(JSON.stringify({variant:packaged?'packaged':'source',screenshots:packaged?'not captured: hidden packaged window':'captured from source window',passed:checks.length,checks,errors,realProviderRequests:0},null,2));
  }finally{if(desktop)await desktop.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
