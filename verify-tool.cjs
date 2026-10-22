const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');
const {createHash,randomUUID} = require('node:crypto');
const {chromium} = require(process.env.SKILLS_TOOL_NODE_MODULES?path.join(process.env.SKILLS_TOOL_NODE_MODULES,'playwright'):'playwright');

function fixtureCatalog() {
  const skills=['skill-guide.tsv','plugin-guide.tsv'].flatMap(file=>fs.readFileSync(path.join(__dirname,file),'utf8').split(/\r?\n/)).filter(line=>line&&!line.startsWith('#')).map(line=>{
    const [category,name,title,summary,keywords]=line.split('|');const plugin=name.includes(':')?name.split(':')[0]:'';
    const id=createHash('sha256').update(name).digest('hex').slice(0,12);
    let engine=['Godot','Unity','Unreal','Roblox'].find(value=>name.startsWith(value.toLowerCase()+'-'))||'';
    if(name.startsWith('threejs-'))engine='Three.js';
    return {id,legacyId:id,name,baseName:plugin?name.slice(plugin.length+1):name,title,summary,description:summary,keywords:keywords.split(' '),category,plugin,
      sourceGroup:plugin==='ecc'?'ECC':plugin?'其他 Plugins':name==='hf-cli'?'共用 Skills':'使用者 Skills',
      source:plugin?plugin+' plugin':'使用者安裝',version:plugin?'1.0.0':'',status:plugin?'enabled':'local',engine,body:'# Test fixture\n'+summary,hasGuide:true,isTemplate:name==='template-skill'};
  });
  return {skills,categories:[...new Set(skills.map(s=>s.category))],uniqueNames:skills.length,scannedAt:new Date().toISOString(),config:JSON.parse(fs.readFileSync(path.join(__dirname,'skills-config.json'),'utf8')),diagnostics:[],readErrors:[]};
}

(async()=>{
  const checks=[];
  let fixtureFile=null;
  const browser=await chromium.launch({headless:true,...(process.env.SKILLS_TOOL_BROWSER?{executablePath:process.env.SKILLS_TOOL_BROWSER}:{})});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const network=[];page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
    const realCatalog=process.env.SKILLS_TOOL_REAL_CATALOG==='1';
    const index=realCatalog?JSON.parse(fs.readFileSync(path.join(__dirname,'skills-index.json'),'utf8')):fixtureCatalog();
    let htmlFile=path.join(__dirname,'Skills查詢工具.html');
    if(!realCatalog){
      fixtureFile=path.join(__dirname,'.test-browser-'+randomUUID()+'.html');
      let html=fs.readFileSync(path.join(__dirname,'tool-shell.html'),'utf8');
      html=html.replace('/*__STYLES__*/',()=>fs.readFileSync(path.join(__dirname,'tool.css'),'utf8')).replace('/*__APP__*/',()=>fs.readFileSync(path.join(__dirname,'tool.js'),'utf8')).replace('/*__DATA__*/',()=>JSON.stringify(index).replaceAll('<','\\u003c'));
      fs.writeFileSync(fixtureFile,html);htmlFile=fixtureFile;
    }
    const url=pathToFileURL(htmlFile).href;
    await page.goto(url);await page.waitForFunction(count=>window.SkillsTool?.count===count,index.skills.length);
    assert.equal(await page.evaluate(()=>SkillsTool.guideCoverage),index.skills.length);
    assert.ok(index.skills.every(s=>/[\u3400-\u9fff]/.test(s.title)&&/[\u3400-\u9fff]/.test(s.summary)));
    checks.push({check:'every indexed Skill has a Chinese title and purpose',result:'passed',count:index.skills.length});
    const testCases=[
      ['我想做簡報','guizang-ppt-skill'],['做一份 PowerPoint pptx','pptx'],['畫流程圖','drawio-skill'],
      ['把截圖變網頁','image-to-code'],['製作3D海浪','threejs-spectral-ocean'],['潤飾文章','sepia-refactor'],
      ['生成圖片','imagegen'],['Unity 角色動畫','unity-animation'],['Godot 角色移動','godot-2d-movement'],
      ['製作下雨效果','threejs-precipitation-surfaces'],['檢查程式錯誤','review-agent'],['做一份Excel表格','xlsx'],
      ['安装skills','skill-installer'],['gsap-scrolltrigger','gsap-scrolltrigger'],['查證新聞真假','claim-verification'],
      ['設計REST API','ecc:api-design'],['PostgreSQL查詢優化','ecc:postgres-patterns'],['文獻回顧','ecc:scientific-thinking-literature-review'],
      ['sites:sites','sites:sites'],['pdf:pdf','pdf:pdf'],['spreadsheets:Spreadsheets','spreadsheets:Spreadsheets']
    ];
    for(const [query,expected] of testCases){const names=await page.evaluate(query=>SkillsTool.search(query).slice(0,3).map(x=>x.name),query);assert.equal(names[0],expected,query);checks.push({check:'search: '+query,result:'passed',first:names[0]});}
    assert.equal((await page.evaluate(()=>SkillsTool.search('zzzzunknown999'))).length,0);checks.push({check:'unknown query returns no result',result:'passed'});
    await page.getByRole('button',{name:'畫流程圖',exact:true}).click();
    await page.locator('#task').fill('請畫出會員註冊與登入流程。');
    await page.evaluate(()=>{window.__copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});});
    await page.locator('#copy-prompt').click();
    const copied=await page.evaluate(()=>window.__copied);
    assert.equal(copied,'/drawio-skill\n\n# 任務\n請畫出會員註冊與登入流程。');checks.push({check:'copy starts with slash and exact skill name, followed by Markdown task',result:'passed'});
    assert.equal(await page.locator('#skill-command').textContent(),'/drawio-skill');
    assert.equal(await page.locator('#copy-path').count(),0);
    assert.equal(await page.locator('#detail').textContent().then(text=>text.includes('安裝位置')),false);
    checks.push({check:'visible slash command, no installation path or path-copy control',result:'passed'});
    await page.locator('#task').fill('');await page.locator('#copy-prompt').click();
    assert.equal(await page.evaluate(()=>window.__copied),'/drawio-skill\n\n# 任務\n帶上自己的需求');
    checks.push({check:'empty task copies a clear second-line placeholder',result:'passed'});
    await page.locator('#task').fill('請畫註冊流程。\n加入登入失敗與重試分支。');await page.locator('#copy-prompt').click();
    assert.equal(await page.evaluate(()=>window.__copied),'/drawio-skill\n\n# 任務\n請畫註冊流程。\n加入登入失敗與重試分支。');
    checks.push({check:'multiline custom task is preserved without extra wrapper text',result:'passed'});
    await page.locator('#search').fill('sepia-recreate');await page.waitForTimeout(160);
    await page.locator('#copy-prompt').click();
    assert.equal(await page.evaluate(()=>window.__copied),'/sepia-recreate\n\n# 任務\n請畫註冊流程。\n加入登入失敗與重試分支。');
    checks.push({check:'switching skills updates the exact slash command and preserves custom task',result:'passed'});
    await page.locator('#search').fill('畫流程圖');await page.waitForTimeout(160);
    await page.locator('#results [data-select]').first().click();
    await page.locator('#detail [data-favorite]').click();
    await page.locator('[data-category="favorites"]').click();
    assert.ok((await page.locator('#results').textContent()).includes('drawio-skill'));
    await page.reload();
    await page.locator('[data-category="favorites"]').click();
    assert.ok((await page.locator('#results').textContent()).includes('drawio-skill'));checks.push({check:'favorites persist after reload',result:'passed'});
    await page.locator('[data-category="recent"]').click();
    assert.ok((await page.locator('#results').textContent()).includes('drawio-skill'));checks.push({check:'recently viewed persists',result:'passed'});
    await page.locator('[data-category="all"]').click();
    await page.locator('#search').fill('zzzzunknown999');
    await page.waitForTimeout(160);
    assert.ok((await page.locator('#results').textContent()).includes('目前沒有符合'));
    await page.locator('#results [data-reset]').click();
    await page.locator('#search').fill('<img src=x onerror="window.__xss=1">');
    await page.waitForTimeout(160);
    assert.equal(await page.evaluate(()=>window.__xss),undefined);assert.equal(await page.locator('#active-filter img').count(),0);checks.push({check:'unknown state and HTML escaping',result:'passed'});
    await page.locator('#clear').click();
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#search').evaluate(el=>el===document.activeElement),true);checks.push({check:'Ctrl+K focuses search',result:'passed'});
    await page.locator('#help-open').click();assert.equal(await page.locator('#help').evaluate(el=>el.open),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#help').evaluate(el=>el.open),false);checks.push({check:'help dialog opens and closes with Escape',result:'passed'});
    await page.locator('[data-category="Godot"]').click();
    assert.equal(await page.locator('#results .skill-card').count(),16);checks.push({check:'category filters all 16 Godot skills',result:'passed'});
    await page.locator('[data-category="all"]').click();
    await page.locator('#load-more').click();assert.equal(await page.locator('#results .skill-card').count(),48);checks.push({check:'load more reveals additional skills',result:'passed'});
    await page.locator('#source').selectOption('ECC');
    assert.equal(await page.evaluate(()=>SkillsTool.search('','all','ECC').length),index.skills.filter(s=>s.sourceGroup==='ECC').length);
    await page.locator('#search').fill('ecc:api-design');await page.waitForTimeout(160);
    await page.locator('#task').fill('請設計會員 API。\n保留既有資料契約。');
    await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});});
    await page.locator('#resources > summary').click();
    await page.locator('.resource-manual > summary').click();await page.locator('#resource-intake').fill('"./資料/需求說明.md"\n./assets/介面參考.png');
    await page.locator('#add-resource').click();
    assert.equal(await page.locator('.resource-item').count(),2);
    await page.locator('#copy-prompt').click();
    const withResources='/ecc:api-design\n\n# 任務\n請設計會員 API。\n保留既有資料契約。\n\n# 資源\n1. 檔案：需求說明.md\n   路徑：./資料/需求說明.md\n2. 檔案：介面參考.png\n   路徑：./assets/介面參考.png';
    assert.equal(await page.evaluate(()=>window.__copied),withResources);
    checks.push({check:'ECC source filtering and namespaced Markdown prompt with resource names and paths',result:'passed'});
    await page.locator('[data-resource-selected="1"]').uncheck();await page.locator('#copy-prompt').click();
    assert.ok(!(await page.evaluate(()=>window.__copied)).includes('介面參考.png'));
    await page.locator('[data-resource-selected="1"]').check();
    await page.reload();await page.locator('#resources > summary').click();
    assert.equal(await page.locator('.resource-item').count(),2);checks.push({check:'resource collection and selection survive reload',result:'passed'});
    await page.locator('[data-remove-resource="1"]').click();await page.locator('[data-remove-resource="0"]').click();
    assert.equal(await page.locator('.resource-item').count(),0);checks.push({check:'resource removal updates collection',result:'passed'});
    await page.evaluate(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['test'],'sample.txt'));document.getElementById('resource-dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));});
    await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('桌面版'));
    assert.equal(await page.locator('.resource-item').count(),0);
    checks.push({check:'standalone browser does not fabricate original paths when files are dropped',result:'passed'});
    await page.locator('#source').selectOption('其他 Plugins');
    assert.equal(await page.evaluate(()=>SkillsTool.search('','all','其他 Plugins').length),index.skills.filter(s=>s.sourceGroup==='其他 Plugins').length);
    await page.locator('#search').fill('spreadsheets:Spreadsheets');await page.waitForTimeout(160);
    await page.locator('#task').fill('請分析銷售資料。');
    await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});});
    await page.locator('#copy-prompt').click();assert.equal(await page.evaluate(()=>window.__copied),'/spreadsheets:Spreadsheets\n\n# 任務\n請分析銷售資料。');
    checks.push({check:'other plugin filter and full command preserve namespace and case',result:'passed'});
    await page.locator('#source').selectOption('all');await page.locator('#search').fill('ecc:api-design');await page.waitForTimeout(160);
    await page.locator('#toggle-hidden').click();
    assert.ok(!(await page.evaluate(()=>SkillsTool.search('ecc:api-design'))).some(s=>s.name==='ecc:api-design'));
    await page.reload();assert.ok(!(await page.evaluate(()=>SkillsTool.search('ecc:api-design'))).some(s=>s.name==='ecc:api-design'));
    await page.locator('[data-category="hidden"]').click();assert.ok((await page.locator('#detail').textContent()).includes('ecc:api-design'));
    await page.locator('#toggle-hidden').click();await page.locator('[data-category="all"]').click();
    assert.equal((await page.evaluate(()=>SkillsTool.search('ecc:api-design')))[0].name,'ecc:api-design');checks.push({check:'plugin hide, persisted hidden list, and restore work',result:'passed'});
    await page.locator('#manage-open').click();
    assert.equal(await page.locator('.source-table tbody tr').count(),new Set(index.skills.filter(s=>s.plugin).map(s=>s.plugin)).size);
    const catalogDownloadPromise=page.waitForEvent('download');await page.locator('[data-manage="catalog"]').click();
    const catalogDownload=await catalogDownloadPromise;const catalog=JSON.parse(fs.readFileSync(await catalogDownload.path(),'utf8'));
    assert.equal(catalog.skills.length,index.skills.length);assert.ok(catalog.skills.every(s=>!('path' in s)&&!('body' in s)));checks.push({check:'catalog exports all sources without local paths or original Skill bodies',result:'passed'});
    const profileDownloadPromise=page.waitForEvent('download');await page.locator('[data-manage="export"]').click();
    const profileDownload=await profileDownloadPromise;const profile=JSON.parse(fs.readFileSync(await profileDownload.path(),'utf8'));
    assert.ok(profile.favorites.includes('drawio-skill'));assert.equal(profile.schema,'skills-finder-preferences');
    const imported={schema:'skills-finder-preferences',version:1,favorites:['ecc:api-design'],hidden:['pdf:pdf']};
    await page.locator('#import-preferences').setInputFiles({name:'preferences.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
    await page.waitForFunction(()=>document.getElementById('toast').textContent==='管理設定已匯入。');
    assert.equal((await page.evaluate(()=>SkillsTool.search('','favorites')))[0].name,'ecc:api-design');
    assert.ok(!(await page.evaluate(()=>SkillsTool.search('pdf:pdf'))).some(s=>s.name==='pdf:pdf'));checks.push({check:'management settings export and import work across plugin Skills',result:'passed'});
    await page.locator('#import-preferences').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"favorites":["bad"]}')});
    await page.waitForFunction(()=>document.getElementById('toast').textContent.startsWith('匯入失敗'));
    assert.equal((await page.evaluate(()=>SkillsTool.search('','favorites')))[0].name,'ecc:api-design');checks.push({check:'invalid management import leaves existing preferences intact',result:'passed'});
    await page.locator('.source-settings summary').click();
    const configDownloadPromise=page.waitForEvent('download');await page.locator('[data-manage="config"]').click();
    const configDownload=await configDownloadPromise;const config=JSON.parse(fs.readFileSync(await configDownload.path(),'utf8'));
    assert.ok(config.skillRoots.every(p=>p.startsWith('~')||p.startsWith('.')));assert.ok(config.pluginCaches.every(p=>p.startsWith('~')||p.startsWith('.')));
    checks.push({check:'scan settings export portable home-relative and tool-relative roots',result:'passed'});
    await page.locator('[data-manage="restore"]').click();await page.locator('#manage-close').click();
    assert.ok((await page.evaluate(()=>SkillsTool.search('pdf:pdf'))).some(s=>s.name==='pdf:pdf'));
    await page.locator('#search').fill('sepia-recreate');await page.waitForTimeout(160);await page.locator('#task').fill('');
    await page.locator('#search').fill('畫流程圖');await page.waitForTimeout(160);assert.equal(await page.locator('#task').inputValue(),'');
    checks.push({check:'search query does not overwrite user task',result:'passed'});
    assert.equal(await page.getByText('本地工具，不需要 API key',{exact:true}).count(),0);checks.push({check:'unrequested local-tool/API-key message is absent',result:'passed'});
    await page.locator('#search').fill('ecc:api-design');await page.waitForTimeout(160);await page.locator('#task').fill('請設計會員資料 API，包含分頁與錯誤回應。');
    await page.locator('#resources > summary').click();await page.locator('.resource-manual > summary').click();await page.locator('#resource-intake').fill('./docs/需求.md');await page.locator('#add-resource').click();
    await page.locator('.prompt-details summary').click();
    await page.screenshot({path:path.join(__dirname,'skills-plugin-prompt.png'),fullPage:false});
    await page.getByRole('button',{name:'做簡報',exact:true}).click();
    await page.locator('#search').fill('');await page.waitForTimeout(160);
    await page.evaluate(()=>scrollTo(0,0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(__dirname,'skills-desktop.png')});checks.push({check:'desktop 1440px layout',result:'passed'});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#results [data-select]').first().click();
    assert.equal(await page.locator('.work-area').evaluate(el=>el.classList.contains('mobile-detail')),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(__dirname,'skills-mobile.png')});
    await page.locator('[data-back]').click();assert.equal(await page.locator('.work-area').evaluate(el=>el.classList.contains('mobile-detail')),false);checks.push({check:'mobile 390px detail, return, no horizontal overflow',result:'passed'});
    assert.deepEqual(network,[]);assert.deepEqual(errors,[]);checks.push({check:'no external network requests or JS errors',result:'passed'});
    const report={at:new Date().toISOString(),catalog:realCatalog?'installed':'synthetic',skillCount:index.skills.length,passed:checks.length,checks,errors,network};fs.writeFileSync(path.join(__dirname,realCatalog?'verification-results.json':'verification-fixture-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({catalog:report.catalog,skills:report.skillCount,passed:report.passed,errors,network}));
  } finally {await browser.close();if(fixtureFile&&fs.existsSync(fixtureFile))fs.unlinkSync(fixtureFile);}
})().catch(error=>{console.error(error);process.exitCode=1;});
