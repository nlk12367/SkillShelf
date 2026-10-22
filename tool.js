'use strict';
(() => {
  const data = JSON.parse(document.getElementById('skill-data').textContent);
  const $ = id => document.getElementById(id);
  const language=window.SkillShelfLanguage;
  function displayTitle(skill){return language?.locale==='en'?(skill.baseName||skill.name).replace(/[-_]+/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase()):skill.title;}
  function displaySummary(skill){if(language?.locale!=='en')return skill.summary;const description=skill.originalDescription||skill.description||'';return description?description.slice(0,240)+(description.length>240?'…':''):'Open the original instructions for details.';}
  function changeLanguage(value){language?.setLanguage(value);applyCatalog({...data});$('onboarding-language').value=value;$('settings-language').value=value;}
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function stored(key, fallback) { try { const value=JSON.parse(localStorage.getItem(key)); return Array.isArray(value)?value:fallback; } catch { return fallback; } }
  let favorites = new Set(stored('skills-tool:favorites:v1', []));
  let recent = stored('skills-tool:recent:v1', []);
  let hidden = new Set(stored('skills-tool:hidden:v1', []));
  const currentIds = new Map(data.skills.flatMap(s=>[[s.id,s.id],[s.legacyId,s.id]]));
  favorites = new Set([...favorites].map(id=>currentIds.get(id)||id));
  hidden = new Set([...hidden].map(id=>currentIds.get(id)||id));
  recent = [...new Set(recent.map(id=>currentIds.get(id)||id))];
  const savedResources=stored('skills-tool:resources:v1',[]).filter(item=>item&&typeof item.path==='string'&&typeof item.name==='string').slice(0,100);
  const state = {query:'', category:'all', source:'all', sort:'recommended', selected:null, limit:24, task:'', resources:savedResources};
  let noticeTimer;
  const preferred = ['guizang-ppt-skill','drawio-skill','frontend-design','imagegen','xlsx','prototype','webapp-testing','sepia-refactor','generate-low-poly-model','gsap-scrolltrigger','threejs-water-optics','skill-installer'];
  const icons = {'簡報與文件':['▤','#eef2ff','#596cd1'],'網頁與介面':['⌘','#eaf5f5','#40877e'],'圖片與設計':['◇','#f5eef9','#9863ac'],'3D 與場景':['⬡','#edf2fc','#6482ba'],'動畫與互動':['↝','#fff3e8','#c48e54'],'遊戲開發':['⊞','#eef4ea','#7a9761'],'Godot':['G','#eaf4fc','#5b98be'],'Unity':['U','#edf0f5','#77849a'],'Unreal':['U','#f0eefb','#8975bc'],'Roblox':['R','#eef3fc','#6b8fc2'],'研究與寫作':['≡','#f8f0ea','#af8561'],'工具與程式':['{ }','#eef1f5','#6e809c']};
  const convert = {'简':'簡','报':'報','图':'圖','网':'網','页':'頁','画':'畫','辑':'輯','编':'編','动':'動','戏':'戲','术':'術','为':'為','验':'驗','证':'證','测':'測','试':'試','错':'錯','误':'誤','数':'數','据':'據','档':'檔','体':'體','云':'雲','声':'聲','乐':'樂','词':'詞','润':'潤','饰':'飾','线':'線','优':'優','质':'質','场':'場','景':'景','陆':'陸','转':'轉','换':'換','读':'讀','写':'寫','设':'設','计':'計','阶':'階','层':'層','间':'間','阴':'陰','阳':'陽','键':'鍵','盘':'盤','开':'開','发':'發','台':'台','认':'認','输':'輸','储':'儲','单':'單','贴':'貼','库':'庫','览':'覽','删':'刪','关':'關','闭':'閉','对':'對','话':'話','帮':'幫','个':'個','么':'麼','装':'裝'};
  function normalize(value) { return String(value).toLowerCase().replace(/[\u3400-\u9fff]/g,c=>convert[c]||c).replace(/three\.js/g,'threejs').replace(/draw\.io/g,'drawio').replace(/[\s，。、！？!?：:；;「」『』“”"'’‘_–—-]+/g,' ').trim(); }
  const skillById = new Map(data.skills.map(s=>[s.id,s]));
  const vocabulary = new Set(data.skills.flatMap(s=>s.keywords).map(normalize).filter(word=>word.length>=2));
  const intents = [
    {match:/api.*設計|設計.*api|rest.*api/,names:['ecc:api-design'],weights:[210],label:'REST API 設計'},
    {match:/postgres|postgresql/,names:['ecc:postgres-patterns'],weights:[150],label:'PostgreSQL 資料庫'},
    {match:/文獻回顧|literature review/,names:['ecc:scientific-thinking-literature-review'],weights:[190],label:'文獻回顧'},
    {match:/自動.*測試|端到端|e2e/,names:['ecc:e2e-testing','webapp-testing'],weights:[170,60],label:'端到端測試'},
    {match:/簡報|投影片|ppt|powerpoint|slide/, names:['guizang-ppt-skill','pptx','theme-factory'], weights:[200,125,15], label:'簡報與投影片'},
    {match:/流程圖|架構圖|泳道|drawio|diagrams|uml|erd/, names:['drawio-skill','prototype'],weights:[210,25],label:'流程與架構圖'},
    {match:/user flow|使用者流程|用戶流程|用户流程/, names:['prototype','drawio-skill'],weights:[180,150],label:'使用者流程'},
    {match:/截圖.*(網頁|程式|介面)|圖片.*(網頁|程式|介面)|image to code|參考圖|還原.*介面/, names:['image-to-code','frontend-design'],weights:[220,50],label:'由參考圖製作介面'},
    {match:/excel|xlsx|試算表|csv|表格.*公式/,names:['xlsx'],weights:[220],label:'Excel 與試算表'},
    {match:/海浪|海洋|大海|沙灘|海岸/,names:['threejs-spectral-ocean','threejs-water-optics'],weights:[200,95],label:'海洋與海浪'},
    {match:/波紋|泳池|水面|水波|水的折射/,names:['threejs-water-optics','threejs-spectral-ocean'],weights:[200,65],label:'水面與波紋'},
    {match:/潤飾|潤稿|小幅.*文字|保留.*原文/,names:['sepia-refactor','sepia'],weights:[200,80],label:'文字潤飾'},
    {match:/重寫|改寫/,names:['sepia-recreate','sepia','sepia-refactor'],weights:[140,60,25],label:'文章改寫'},
    {match:/去背|生成圖片|生圖|改圖|修圖/,names:['imagegen','threejs-image-generator'],weights:[200,20],label:'生成與編輯圖片'},
    {match:/檢查.*(錯誤|程式)|程式.*(錯誤|審查)|code review/,names:['review-agent','webapp-testing'],weights:[160,60],label:'程式與網頁檢查'},
    {match:/查證|查核|真假|fact check/,names:['claim-verification'],weights:[200],label:'資訊查核'},
    {match:/捲動|滾動|scrolltrigger|視差/,names:['gsap-scrolltrigger'],weights:[180],label:'捲動動畫'},
    {match:/黑畫面|3d.*(除錯|錯誤|卡頓)/,names:['threejs-debug-profiler'],weights:[180],label:'3D 除錯'},
    {match:/技能.*安裝|安裝.*skill|新增.*skill|skill.*安裝/,names:['skill-installer'],weights:[200],label:'Skill 安裝'},
  ];
  function indexSkills(skills) {
    for (const skill of skills) {
      skill.index = {name:normalize(skill.name),title:normalize(skill.title),summary:normalize(skill.summary),description:normalize(skill.description),keywords:skill.keywords.map(normalize),body:normalize(skill.body)};
    }
  }
  indexSkills(data.skills);
  function renderCatalogMetadata() {
    const groups=[...new Set(data.skills.map(s=>s.sourceGroup))];
    if(state.source!=='all'&&!groups.includes(state.source))state.source='all';
    $('source').innerHTML='<option value="all">全部來源</option>'+groups.map(group=>`<option value="${escape(group)}">${escape(group)}（${data.skills.filter(s=>s.sourceGroup===group).length}）</option>`).join('');
    $('source').value=state.source;
    const date=new Date(data.scannedAt);
    $('scan-date').textContent='清單更新：'+date.toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Taipei'});
    $('index-stamp').textContent=`${data.skills.length} 份 Skills 已收錄`;
    $('source-count').textContent=`${data.skills.length} 份本地檔案，${data.uniqueNames} 個名稱`;
  }
  function applyCatalog(next) {
    if(!next||!Array.isArray(next.skills)||!Array.isArray(next.categories)||!Number.isFinite(Date.parse(next.scannedAt))||next.skills.some(skill=>!skill||typeof skill.id!=='string'||typeof skill.name!=='string'||!Array.isArray(skill.keywords)))throw new Error('掃描結果格式不正確，已保留原清單。');
    indexSkills(next.skills);
    const previousById=new Map(data.skills.map(skill=>[skill.id,skill]));
    const nextById=new Map(next.skills.map(skill=>[skill.id,skill]));
    const nextByName=new Map(next.skills.map(skill=>[skill.name,skill]));
    const remap=id=>nextById.has(id)?id:nextByName.get(previousById.get(id)?.name)?.id||id;
    const selected=state.selected?remap(state.selected):null;
    const resourcesOpen=$('resources')?.open;
    const previewOpen=document.querySelector('.prompt-details')?.open;
    const manualOpen=document.querySelector('.resource-manual')?.open;
    const intake=$('resource-intake')?.value||'';
    favorites=new Set([...favorites].map(remap));hidden=new Set([...hidden].map(remap));recent=[...new Set(recent.map(remap))];
    Object.assign(data,next);
    skillById.clear();for(const skill of data.skills)skillById.set(skill.id,skill);
    vocabulary.clear();for(const skill of data.skills)for(const word of skill.keywords){const normalized=normalize(word);if(normalized.length>=2)vocabulary.add(normalized);}
    state.selected=skillById.has(selected)?selected:null;
    if(!['all','favorites','recent','hidden',...data.categories].includes(state.category))state.category='all';
    save('skills-tool:favorites:v1',[...favorites]);save('skills-tool:hidden:v1',[...hidden]);save('skills-tool:recent:v1',recent);
    renderCatalogMetadata();renderNavigation();renderResults();renderDetail();
    if($('resources'))$('resources').open=Boolean(resourcesOpen);
    if(document.querySelector('.prompt-details'))document.querySelector('.prompt-details').open=Boolean(previewOpen);
    if(document.querySelector('.resource-manual'))document.querySelector('.resource-manual').open=Boolean(manualOpen);
    if($('resource-intake'))$('resource-intake').value=intake;
    if($('manager').open)renderManager();
  }
  let refreshing=false;
  async function refreshSkills() {
    if(refreshing)return;
    if(!window.skillsDesktop){toast('請在桌面版使用此按鈕，即可直接掃描更新清單。');return;}
    if(typeof window.skillsDesktop.refreshCatalog!=='function'){toast('新版更新功能已備妥，請先重新開啟桌面版一次以套用。之後可直接按此按鈕更新。');return;}
    refreshing=true;
    const button=$('refresh');button.disabled=true;button.textContent='正在更新 Skills…';button.setAttribute('aria-busy','true');
    try{
      const next=await window.skillsDesktop.refreshCatalog();
      applyCatalog(next);
      const translation=next.translation;
      const status=$('translation-status');
      const translationMessage=translation?.error||next.translationWarning|| (translation?.enabled?`本次翻譯 ${translation.translated} 項${translation.remaining?`，${translation.remaining} 項待補中文，可再次更新。`:'。'}`:'');
      status.textContent=translationMessage;status.hidden=!translationMessage;
      toast(`清單已更新：${data.skills.length} 份 Skills${data.readErrors?.length||(data.diagnostics||[]).some(d=>d.kind==='warning')?'，部分項目未完成，請至管理與來源查看。':'。'}`);
    }catch(error){toast('更新失敗，已保留目前清單。'+error.message);}
    finally{refreshing=false;button.disabled=false;button.textContent='更新 Skills 清單';button.removeAttribute('aria-busy');}
  }
  function searchSkills(query, category='all', sort='recommended', source='all') {
    const q=normalize(query);
    const terms=[...new Set([...vocabulary].filter(w=>q.includes(w)).concat(q.match(/[a-z0-9+#.]{2,}/g)||[]))];
    const activeIntents=intents.filter(intent=>intent.match.test(q));
    const engine = ['godot','unity','unreal','roblox','threejs','babylon'].find(name=>q.includes(name));
    const rows=[];
    for (const skill of data.skills) {
      if(source!=='all'&&skill.sourceGroup!==source)continue;
      if(category==='hidden'?!hidden.has(skill.id):hidden.has(skill.id))continue;
      if(category==='favorites'&&!favorites.has(skill.id)) continue;
      if(category==='recent'&&!recent.includes(skill.id)) continue;
      if(!['all','favorites','recent','hidden'].includes(category)&&skill.category!==category) continue;
      let score=0; const reasons=[];
      const idx=skill.index;
      if(q) {
        if(idx.name===q) {score+=900;reasons.push('名稱完全符合');}
        else if(idx.name.includes(q)) {score+=220;reasons.push('符合英文名稱');}
        if(idx.title.includes(q)) score+=130;
        if(idx.summary.includes(q)) score+=80;
        for(const intent of activeIntents) {const i=intent.names.indexOf(skill.name);if(i>=0){score+=intent.weights[i]||30;reasons.push(intent.label);}}
        for(const word of terms) {
          const specific = word.length>=4?1.2:1;
          if(idx.title.includes(word)) score+=23*specific;
          if(idx.keywords.includes(word)) {score+=21*specific;if(reasons.length<2)reasons.push(word);}
          if(idx.summary.includes(word)) score+=9*specific;
          if(idx.name.includes(word)) score+=17*specific;
          if(idx.description.includes(word)) score+=3;
        }
        if(engine) {const matches=normalize(skill.engine).includes(engine);score+=matches?65:-30;}
        if(/pptx|powerpoint/.test(q)&&skill.name==='pptx')score+=180;
        if(!score&&q.length>=3&&idx.description.includes(q))score=15;
        if(!score&&q.length>=3&&idx.body.includes(q)) {score=9;reasons.push('原文含此關鍵字');}
        if(skill.isTemplate&&!q.includes('template')&&!q.includes('範本'))score=0;
        if(score<8)continue;
      } else {
        const position=preferred.indexOf(skill.name);
        score=position>=0?100-position:0;
        if(favorites.has(skill.id))score+=10;
        if(category==='recent')score=1000-recent.indexOf(skill.id);
        if(skill.isTemplate)score-=100;
      }
      rows.push({skill,score,reasons:[...new Set(reasons)].slice(0,2)});
    }
    rows.sort(sort==='name'?(a,b)=>a.skill.name.localeCompare(b.skill.name):(a,b)=>b.score-a.score||a.skill.name.localeCompare(b.skill.name));
    return rows;
  }
  function toast(message) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('toast').hidden=true,3500); }
  function save(key,value) {try{localStorage.setItem(key,JSON.stringify(value));}catch{toast('瀏覽器未允許儲存，這次操作仍可使用。');}}
  function renderNavigation() {
    const sourceSkills=data.skills.filter(s=>state.source==='all'||s.sourceGroup===state.source);
    const visible=sourceSkills.filter(s=>!hidden.has(s.id));
    const navs=[['all','全部 Skills','⊞',visible.length],['favorites','我的收藏','☆',visible.filter(s=>favorites.has(s.id)).length],['recent','最近查看','◷',visible.filter(s=>recent.includes(s.id)).length],['hidden','已隱藏','⊘',sourceSkills.filter(s=>hidden.has(s.id)).length]];
    let html=navs.map(([id,label,icon,count])=>navButton(id,label,icon,count)).join('')+'<div class="nav-section">依用途瀏覽</div>';
    html+=data.categories.map(category=>navButton(category,category,icons[category]?.[0]||'◇',visible.filter(s=>s.category===category).length)).join('');
    $('categories').innerHTML=html;
  }
  function navButton(id,label,icon,count) {return `<button type="button" class="nav-button${state.category===id?' active':''}" data-category="${escape(id)}"${state.category===id?' aria-current="page"':''}><span class="nav-mark" aria-hidden="true">${escape(icon)}</span><span>${escape(label)}</span><span class="nav-count">${count}</span></button>`;}
  function favoriteButton(skill) {const saved=favorites.has(skill.id);return `<button type="button" class="favorite-button${saved?' saved':''}" data-favorite="${skill.id}" aria-label="${saved?'取消收藏':'收藏'}：${escape(displayTitle(skill))}" aria-pressed="${saved}">${saved?'★':'☆'}</button>`;}
  function renderResults() {
    const rows=searchSkills(state.query,state.category,state.sort,state.source);
    const visible=rows.slice(0,state.limit);
    $('clear').hidden=!state.query;
    $('results-title').textContent=state.query?'與需求相關的 Skills':state.category==='favorites'?'我的收藏':state.category==='recent'?'最近查看':state.category==='hidden'?'已隱藏的 Skills':state.category==='all'?'從常用需求開始':state.category;
    $('result-count').textContent=`${rows.length} 個結果`;
    $('active-filter').innerHTML=state.query?`<p class="filter-note">搜尋「<strong>${escape(state.query)}</strong>」${state.category==='all'?'':`，分類：${escape(state.category==='favorites'?'我的收藏':state.category==='recent'?'最近查看':state.category)}`}</p>`:'';
    if(!rows.length) {
      const message=state.category==='favorites'&&!state.query?'按結果旁的星號，把常用工具留在這裡。':state.category==='recent'&&!state.query?'查看過的 Skill 會出現在這裡。':'換一個具體詞試試，例如「簡報」「網頁」「海浪」，或輸入英文名稱。';
      $('results').innerHTML=`<div class="empty"><h3>${state.category==='favorites'&&!state.query?'還沒有收藏':state.category==='recent'&&!state.query?'還沒有查看記錄':'目前沒有符合的 Skill'}</h3><p>${message}</p><button type="button" data-reset="true">瀏覽全部 Skills</button></div>`;
    } else {
      $('results').innerHTML=visible.map(({skill,reasons})=>{
        const [icon,bg,ink]=icons[skill.category]||icons['工具與程式'];
        return `<article class="skill-card${state.selected===skill.id?' selected':''}" data-card="${skill.id}"><button type="button" class="skill-select" data-select="${skill.id}" aria-label="查看 ${escape(displayTitle(skill))}" aria-pressed="${state.selected===skill.id}"><span class="skill-icon" aria-hidden="true" style="--tile-bg:${bg};--tile-ink:${ink}">${escape(icon)}</span><span class="card-main"><span class="card-title" data-skill-content>${escape(displayTitle(skill))}</span><span class="card-name">${escape(skill.name)}</span><span class="card-summary" data-skill-content>${escape(displaySummary(skill))}</span><span class="card-tags"><span class="tag">${escape(skill.category)}</span>${skill.plugin?`<span class="tag">${escape(skill.plugin)}</span>`:''}${skill.engine?`<span class="tag">${escape(skill.engine)}</span>`:''}${skill.guideSource==='ai'?'<span class="tag">AI 翻譯</span>':''}${state.query&&reasons.length?`<span class="tag match">符合：${escape(reasons[0])}</span>`:''}</span></span></button>${favoriteButton(skill)}</article>`;
      }).join('');
    }
    $('load-more').hidden=rows.length<=state.limit;
    $('load-more').textContent=`顯示更多（還有 ${Math.max(0,rows.length-state.limit)} 個）`;
    const currentVisible=rows.some(row=>row.skill.id===state.selected);
    if(!currentVisible) {
      state.selected=rows[0]?.skill.id||null;
      renderDetail();
      document.querySelectorAll('.skill-card').forEach(card=>{const active=card.dataset.card===state.selected;card.classList.toggle('selected',active);card.querySelector('.skill-select').setAttribute('aria-pressed',String(active));});
    }
    if(!state.selected)renderDetail();
  }
  function statusLabel(skill) {return ({enabled:'Plugin 設定已啟用',disabled:'Plugin 設定已停用',unknown:'已收錄，啟用設定待確認',local:'已收錄'})[skill.status]||'已收錄';}
  function prompt(skill) {
    const resources=state.resources.filter(item=>item.selected!==false&&item.path.trim());
    if(language?.locale==='en')return `/${skill.name}\n\n# Task\n${state.task.trim()||'Describe your task'}${resources.length?'\n\n# Resources\n'+resources.map((item,index)=>`${index+1}. File: ${item.name||resourceName(item.path)}\n   Path: ${item.path}`).join('\n'):''}`;
    return `/${skill.name}\n\n# 任務\n${state.task.trim()||'帶上自己的需求'}${resources.length?'\n\n# 資源\n'+resources.map((item,index)=>`${index+1}. 檔案：${item.name||resourceName(item.path)}\n   路徑：${item.path}`).join('\n'):''}`;
  }
  function resourceName(path) {return path.replace(/[\\/]+$/,'').split(/[\\/]/).filter(Boolean).pop()||path;}
  function resourceChanged() {save('skills-tool:resources:v1',state.resources);const skill=skillById.get(state.selected);if(skill)$('prompt-preview').textContent=prompt(skill);}
  function collectResources(resources) {
    const unique=resources.filter((item,index)=>item&&typeof item.path==='string'&&item.path&&resources.findIndex(other=>other.path===item.path)===index&&!state.resources.some(other=>other.path===item.path));
    if(state.resources.length+unique.length>100)throw new Error('最多可收納 100 筆資源。');
    state.resources.push(...unique.map(item=>({name:item.name||resourceName(item.path),path:item.path,selected:true})));
    renderResources();resourceChanged();toast(unique.length?`已收納 ${unique.length} 筆資源。`:'這些資源已在清單中。');
  }
  function desktopRequired() {throw new Error('請以「開啟 SkillShelf.cmd」開啟桌面版，才能取得拖曳或貼上檔案的完整路徑。');}
  async function collectFileObjects(files) {
    if(!window.skillsDesktop)desktopRequired();
    collectResources(await window.skillsDesktop.filesToResources(Array.from(files)));
  }
  async function pasteResourceFiles() {
    if(!window.skillsDesktop)desktopRequired();
    const resources=await window.skillsDesktop.pasteResources();
    if(!resources.length)throw new Error('請先在檔案總管複製檔案，再回到這裡貼上。');
    collectResources(resources);
  }
  function renderResources() {
    const target=$('resource-list');if(!target)return;
    target.innerHTML=state.resources.map((item,index)=>`<div class="resource-item"><div class="resource-item-heading"><label><input type="checkbox" data-resource-selected="${index}" ${item.selected!==false?'checked':''}><span>${escape(item.name||resourceName(item.path))}</span></label><button type="button" data-remove-resource="${index}" aria-label="移除資源 ${index+1}">×</button></div><label class="sr-only" for="resource-${index}">資源路徑 ${index+1}</label><input class="resource-path" id="resource-${index}" type="text" data-resource="${index}" value="${escape(item.path)}"></div>`).join('');
  }
  function renderDetail() {
    const skill=skillById.get(state.selected);
    if(!skill){$('detail').innerHTML='<div class="detail-content"><h2>找到工具後，在這裡查看</h2><p class="detail-desc">搜尋需求或瀏覽分類，再選擇一個 Skill。</p></div>';return;}
    $('detail').innerHTML=`<div class="detail-top"><button type="button" class="mobile-back" data-back="true">‹ 返回搜尋結果</button><div class="detail-topline"><span><span class="tag">${escape(skill.category)}</span>${skill.plugin?`<span class="tag">${escape(skill.plugin)}</span>`:''}</span>${favoriteButton(skill)}</div><h2 class="detail-title" data-skill-content>${escape(displayTitle(skill))}</h2><p class="detail-name">${escape(skill.name)}</p><p class="detail-desc" data-skill-content>${escape(displaySummary(skill))}</p>${skill.isTemplate?'<p class="inline-note">這是空白範本，請先定義內容後再作為工作 Skill 使用。</p>':''}</div><div class="detail-content"><code class="skill-command" id="skill-command">/${escape(skill.name)}</code><label class="field-label" for="task">任務</label><textarea id="task" placeholder="在這裡寫下你要做的事情…">${escape(state.task)}</textarea><details id="resources" class="resources-section"><summary>資源收納<small>選填，勾選後帶入 prompt</small></summary><div id="resource-dropzone" class="resource-dropzone" tabindex="0" role="group" aria-label="拖曳或貼上資源檔案"><strong>將檔案拖曳到這裡</strong><span>或在這裡按 Ctrl+V 貼上檔案</span><div class="resource-file-actions"><button type="button" id="choose-resource-files">選擇檔案</button><button type="button" id="paste-resource-files">貼上檔案</button></div></div><details class="resource-manual"><summary>手動加入路徑</summary><label class="sr-only" for="resource-intake">貼上資源路徑，可一次多行</label><textarea id="resource-intake" class="resource-intake" placeholder="貼上檔案或資料夾路徑，可一次多行"></textarea><button type="button" id="add-resource" class="resource-add">收納資源</button></details><div id="resource-list"></div></details><button type="button" class="copy-button" id="copy-prompt"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg>複製使用指令</button><p class="copy-help">複製後，貼到 Codex 對話即可使用</p><details class="prompt-details"><summary>預覽將複製的指令</summary><pre class="prompt-block" id="prompt-preview"></pre></details><div class="meta-divider"></div><div class="skill-status"><span>${escape(statusLabel(skill))}</span><button type="button" class="plain-button" id="toggle-hidden">${hidden.has(skill.id)?'還原到搜尋結果':'在搜尋結果隱藏'}</button></div><details><summary>查看原始用途說明</summary><p class="original-description" data-skill-content>${escape(skill.originalDescription||skill.description||language?.text('此檔案沒有 description 欄位；中文用途依內文整理。')||'此檔案沒有 description 欄位；中文用途依內文整理。')}</p></details><details><summary>查看完整 SKILL.md</summary><pre class="original-text">${escape(skill.body)}</pre></details></div>`;
    $('prompt-preview').textContent=prompt(skill);
    $('task').addEventListener('input',event=>{state.task=event.target.value;$('prompt-preview').textContent=prompt(skill);});
    renderResources();
    const dropzone=$('resource-dropzone');
    dropzone.addEventListener('dragover',event=>{event.preventDefault();event.stopPropagation();dropzone.classList.add('drag-active');if(event.dataTransfer)event.dataTransfer.dropEffect='copy';});
    dropzone.addEventListener('dragleave',event=>{if(!dropzone.contains(event.relatedTarget))dropzone.classList.remove('drag-active');});
    dropzone.addEventListener('drop',async event=>{event.preventDefault();event.stopPropagation();dropzone.classList.remove('drag-active');try{if(event.dataTransfer.files.length)await collectFileObjects(event.dataTransfer.files);}catch(error){toast(error.message);}});
    dropzone.addEventListener('paste',async event=>{
      if(event.target.matches('#resource-intake,.resource-path'))return;
      event.preventDefault();event.stopPropagation();
      try{if(!window.skillsDesktop)desktopRequired();const resources=await window.skillsDesktop.pasteResources();if(resources.length)collectResources(resources);else if(event.clipboardData?.files.length)await collectFileObjects(event.clipboardData.files);else throw new Error('請先在檔案總管複製檔案，再回到這裡貼上。');}catch(error){toast(error.message);}
    });
    $('choose-resource-files').addEventListener('click',async()=>{try{if(!window.skillsDesktop)desktopRequired();const resources=await window.skillsDesktop.chooseResources();if(resources.length)collectResources(resources);}catch(error){toast(error.message);}});
    $('paste-resource-files').addEventListener('click',async()=>{try{await pasteResourceFiles();}catch(error){toast(error.message);}});
    $('add-resource').addEventListener('click',()=>{
      const paths=$('resource-intake').value.split(/\r?\n/).map(path=>path.trim().replace(/^"(.*)"$/,'$1')).filter(Boolean);
      if(!paths.length){toast('請先貼上檔案或資料夾路徑。');return;}
      try{collectResources(paths.map(path=>({name:resourceName(path),path})));$('resource-intake').value='';}catch(error){toast(error.message);}
    });
    $('toggle-hidden').addEventListener('click',()=>{const restoring=hidden.has(skill.id);if(restoring)hidden.delete(skill.id);else hidden.add(skill.id);save('skills-tool:hidden:v1',[...hidden]);renderNavigation();renderResults();renderDetail();toast(restoring?'已還原到搜尋結果。':'已從搜尋結果隱藏，可在「已隱藏」還原。');});
    $('copy-prompt').addEventListener('click',()=>copy(prompt(skill),'使用指令已複製，可以貼到 Codex 了。'));
  }
  async function copy(text,message) {
    if(window.skillsDesktop){try{await window.skillsDesktop.writeText(text);toast(message);}catch(error){toast('複製失敗：'+error.message);}return;}
    try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);toast(message);return;}}catch{}
    const temp=document.createElement('textarea');temp.value=text;temp.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(temp);temp.select();let copied=false;
    try{copied=document.execCommand('copy');}catch{}temp.remove();
    if(copied){toast(message);return;}
    const dialog=document.createElement('dialog');const title=document.createElement('h2');title.textContent='請手動複製這段指令';const paragraph=document.createElement('p');paragraph.textContent='已選取文字，按 Ctrl+C 複製。';const field=document.createElement('textarea');field.className='copy-fallback';field.value=text;field.readOnly=true;const close=document.createElement('button');close.className='plain-button';close.textContent='關閉';close.onclick=()=>dialog.close();dialog.append(title,paragraph,field,close);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();field.focus();field.select();
  }
  function selectSkill(id,showMobile=true) {
    if(!skillById.has(id))return;
    state.selected=id;recent=[id,...recent.filter(other=>other!==id)].slice(0,30);save('skills-tool:recent:v1',recent);
    renderNavigation();renderResults();renderDetail();
    if(showMobile&&matchMedia('(max-width:790px)').matches){document.querySelector('.work-area').classList.add('mobile-detail');$('detail-panel').scrollIntoView({block:'start'});$('detail').querySelector('.mobile-back').focus({preventScroll:true});}
  }
  function toggleFavorite(id) {
    if(favorites.has(id))favorites.delete(id);else favorites.add(id);
    save('skills-tool:favorites:v1',[...favorites]);renderNavigation();renderResults();renderDetail();
  }
  function updateQuery(value) {state.query=value;$('search').value=value;state.limit=24;state.selected=null;document.querySelector('.work-area').classList.remove('mobile-detail');renderResults();renderDetail();}
  function downloadJSON(filename,payload) {
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportPreferences() {return {schema:'skills-finder-preferences',version:1,favorites:[...new Set(data.skills.filter(s=>favorites.has(s.id)).map(s=>s.name))],hidden:[...new Set(data.skills.filter(s=>hidden.has(s.id)).map(s=>s.name))]};}
  function importPreferences(payload) {
    if(!payload||payload.schema!=='skills-finder-preferences'||payload.version!==1||!Array.isArray(payload.favorites)||!Array.isArray(payload.hidden)||[...payload.favorites,...payload.hidden].some(name=>typeof name!=='string'||name.length>300))throw new Error('請選擇由本工具匯出的管理設定 JSON。');
    favorites=new Set(data.skills.filter(s=>payload.favorites.includes(s.name)).map(s=>s.id));
    hidden=new Set(data.skills.filter(s=>payload.hidden.includes(s.name)).map(s=>s.id));
    save('skills-tool:favorites:v1',[...favorites]);save('skills-tool:hidden:v1',[...hidden]);renderNavigation();renderResults();renderDetail();
  }
  function renderManager() {
    const groups=[...new Set(data.skills.map(s=>s.sourceGroup))];
    const plugins=[...new Set(data.skills.filter(s=>s.plugin).map(s=>s.plugin))];
    const rows=plugins.map(plugin=>{const skills=data.skills.filter(s=>s.plugin===plugin);return `<tr><td>${escape(plugin)}</td><td>${skills.length}</td><td>${escape(skills[0].version)}</td><td>${escape(statusLabel(skills[0]))}</td></tr>`;}).join('');
    $('manager-body').innerHTML=`<p class="manager-lead">${data.skills.length} 份 Skills 已收錄，${data.skills.filter(s=>s.hasGuide).length} 份有中文用途。收藏與隱藏會套用到所有來源。</p><div class="manager-stats">${groups.map(group=>`<span>${escape(group)} <strong>${data.skills.filter(s=>s.sourceGroup===group).length}</strong></span>`).join('')}</div><div class="manager-actions"><button type="button" data-manage="catalog">匯出 Skills 清單</button><button type="button" data-manage="export">匯出管理設定</button><button type="button" data-manage="import">匯入管理設定</button><button type="button" data-manage="restore">還原全部隱藏項目</button></div><p class="manager-note">「隱藏」只調整本工具的搜尋結果；Plugin 啟用狀態以 Agent 設定為準。目前對話是否已載入，由 Agent 本身管理。</p><h3>Plugins</h3><div class="table-scroll"><table class="source-table"><thead><tr><th>來源</th><th>Skills</th><th>版本</th><th>設定狀態</th></tr></thead><tbody>${rows||'<tr><td colspan="4">尚未找到 plugin Skills。</td></tr>'}</tbody></table></div><details class="source-settings"><summary>設定掃描來源</summary><p class="manager-note">支援 ~/ 家目錄與相對於掃描設定檔所在資料夾的路徑。下載後取代目前使用的 skills-config.json，再按桌面版的「更新 Skills 清單」。安裝版設定位置見技術說明。</p><label class="sr-only" for="source-config">掃描來源 JSON</label><textarea id="source-config" spellcheck="false">${escape(JSON.stringify(data.config,null,2))}</textarea><button type="button" data-manage="config">下載掃描設定</button><ul class="source-diagnostics">${(data.diagnostics||[]).map(root=>`<li>${root.kind==='warning'?'掃描警告':root.exists?'已找到':'未找到'}：<code>${escape(root.label)}</code>${root.code?` <code>${escape(root.code)}</code>`:''}${root.error?` <span data-skill-content>${escape(root.error)}</span>`:''}</li>`).join('')}</ul></details>${data.readErrors?.length?`<p class="inline-note">有 ${data.readErrors.length} 個檔案讀取失敗，請查看 skills-raw.json 的 readErrors。</p>`:''}`;
  }
  document.addEventListener('input',event=>{if(event.target.matches('[data-resource]')){const item=state.resources[Number(event.target.dataset.resource)];item.path=event.target.value;item.name=resourceName(item.path);const label=event.target.closest('.resource-item').querySelector('.resource-item-heading span');label.textContent=item.name;resourceChanged();}});
  document.addEventListener('change',event=>{if(event.target.matches('[data-resource-selected]')){state.resources[Number(event.target.dataset.resourceSelected)].selected=event.target.checked;resourceChanged();}});
  document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
  document.addEventListener('drop',event=>{if(event.dataTransfer?.files.length)event.preventDefault();});
  document.addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove-resource]');if(remove){state.resources.splice(Number(remove.dataset.removeResource),1);renderResources();resourceChanged();$('add-resource').focus();return;}
    const management=event.target.closest('[data-manage]');if(management){
      const action=management.dataset.manage;
      if(action==='catalog')downloadJSON('skills-catalog.json',{schema:'skills-finder-catalog',version:1,skills:data.skills.map(s=>({name:s.name,title:s.title,summary:s.summary,category:s.category,source:s.source,plugin:s.plugin,status:s.status,command:`/${s.name}`}))});
      if(action==='export')downloadJSON('skills-preferences.json',exportPreferences());
      if(action==='import')$('import-preferences').click();
      if(action==='restore'){hidden.clear();save('skills-tool:hidden:v1',[]);renderNavigation();renderResults();renderDetail();renderManager();toast('所有 Skills 已還原到搜尋結果。');}
      if(action==='config'){try{const config=JSON.parse($('source-config').value);if(!Array.isArray(config.skillRoots)||!Array.isArray(config.pluginCaches)||[...config.skillRoots,...config.pluginCaches].some(v=>typeof v!=='string'||!v.trim())||typeof config.includeAuxiliary!=='boolean')throw new Error('請確認路徑陣列與 includeAuxiliary 設定。');downloadJSON('skills-config.json',config);}catch(error){toast('設定格式不正確：'+error.message);}}
      return;
    }
    const favorite=event.target.closest('[data-favorite]');if(favorite){toggleFavorite(favorite.dataset.favorite);return;}
    const card=event.target.closest('[data-select]');if(card){selectSkill(card.dataset.select);return;}
    const category=event.target.closest('[data-category]');if(category){state.category=category.dataset.category;state.limit=24;document.querySelector('.work-area').classList.remove('mobile-detail');renderNavigation();renderResults();return;}
    const suggestion=event.target.closest('[data-query]');if(suggestion){state.category='all';renderNavigation();updateQuery(suggestion.dataset.query);$('search').focus();return;}
    if(event.target.closest('[data-reset]')){state.category='all';state.source='all';$('source').value='all';state.limit=24;renderNavigation();updateQuery('');$('search').focus();return;}
    if(event.target.closest('[data-back]')){document.querySelector('.work-area').classList.remove('mobile-detail');document.querySelector(`[data-select="${state.selected}"]`)?.focus();}
    if(event.target.closest('.brand')){event.preventDefault();state.category='all';renderNavigation();updateQuery('');$('search').focus();}
  });
  let debounce;
  $('search').addEventListener('input',event=>{clearTimeout(debounce);const value=event.target.value;debounce=setTimeout(()=>updateQuery(value),90);});
  $('clear').addEventListener('click',()=>{clearTimeout(debounce);updateQuery('');$('search').focus();});
  $('sort').addEventListener('change',event=>{state.sort=event.target.value;state.limit=24;renderResults();});
  renderCatalogMetadata();
  $('source').addEventListener('change',event=>{state.source=event.target.value;state.limit=24;state.selected=null;renderNavigation();renderResults();});
  $('manage-open').addEventListener('click',()=>{renderManager();$('manager').showModal();});
  $('manage-close').addEventListener('click',()=>$('manager').close());
  $('import-preferences').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>1000000)throw new Error('檔案超過 1 MB，請確認選擇的是管理設定。');importPreferences(JSON.parse(await file.text()));renderManager();toast('管理設定已匯入。');}catch(error){toast('匯入失敗：'+error.message);}finally{event.target.value='';}});
  $('load-more').addEventListener('click',()=>{state.limit+=24;renderResults();});
  $('help-open').addEventListener('click',()=>$('help').showModal());
  $('help-close').addEventListener('click',()=>$('help').close());
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('search').focus();$('search').select();}if(event.key==='Escape'&&document.activeElement===$('search'))updateQuery('');});
  $('refresh').addEventListener('click',refreshSkills);
  let translationPreferences=null;
  async function openTranslationSettings(enable=false){
    if(!window.skillsDesktop?.translationSettings){toast('請在新版桌面 App 設定 AI 翻譯。');return;}
    try{
      translationPreferences=await window.skillsDesktop.translationSettings();
      const saved=translationPreferences;
      $('settings-language').value=saved.uiLanguage||language?.locale||'zh-TW';
      $('translation-enabled').checked=enable||saved.enabled;
      $('translation-base').value=saved.baseUrl;$('translation-model').value=saved.model;$('translation-limit').value=saved.maxPerRefresh;
      $('translation-key').value='';$('translation-key').placeholder=saved.hasKey?'已儲存金鑰；留白表示沿用':'貼上你的 API Key';
      $('translation-key-state').textContent=saved.secureStorageAvailable?(saved.hasKey?'已儲存加密金鑰。':'尚未儲存金鑰。'):'系統安全金鑰儲存目前不可用。';
      const provider=$('translation-provider');provider.value=[...provider.options].some(v=>v.value===saved.baseUrl)?saved.baseUrl:'custom';
      $('translation-message').textContent='';$('translation-settings').showModal();
    }catch(error){toast('無法讀取翻譯設定：'+error.message);}
  }
  async function completeTranslationChoice(needed){
    const no=$('translation-skip'),yes=$('translation-setup');no.disabled=true;yes.disabled=true;
    try{translationPreferences=await window.skillsDesktop.skipTranslationOnboarding($('onboarding-language').value);$('translation-onboarding').close();if(needed)await openTranslationSettings(true);}
    catch(error){$('onboarding-error').textContent='無法記住選擇：'+error.message;}
    finally{no.disabled=false;yes.disabled=false;}
  }
  $('translation-open').addEventListener('click',()=>openTranslationSettings());
  $('translation-close').addEventListener('click',()=>$('translation-settings').close());
  $('translation-settings').addEventListener('close',()=>{$('translation-key').value='';if(translationPreferences?.uiLanguage)changeLanguage(translationPreferences.uiLanguage);});
  $('onboarding-language').addEventListener('change',event=>changeLanguage(event.target.value));
  $('settings-language').addEventListener('change',event=>changeLanguage(event.target.value));
  $('translation-provider').addEventListener('change',()=>{if($('translation-provider').value!=='custom')$('translation-base').value=$('translation-provider').value;});
  $('translation-skip').addEventListener('click',()=>completeTranslationChoice(false));
  $('translation-setup').addEventListener('click',()=>completeTranslationChoice(true));
  $('translation-onboarding').addEventListener('cancel',event=>{event.preventDefault();completeTranslationChoice(false);});
  async function persistTranslationSettings(removeKey=false){
    const saveButton=$('translation-save'),removeButton=$('translation-remove-key');saveButton.disabled=true;removeButton.disabled=true;
    try{
      const input=removeKey?{...translationPreferences,removeKey:true}:{uiLanguage:$('settings-language').value,enabled:$('translation-enabled').checked,baseUrl:$('translation-base').value,model:$('translation-model').value,maxPerRefresh:Number($('translation-limit').value),apiKey:$('translation-key').value,removeKey};
      translationPreferences=await window.skillsDesktop.saveTranslationSettings(input);
      $('translation-key').value='';$('translation-settings').close();
      $('translation-status').hidden=false;$('translation-status').textContent=translationPreferences.enabled?'AI 翻譯已啟用，下次更新時套用。':'AI 翻譯未啟用。';
      toast(removeKey?'已移除 API Key 並關閉翻譯。':'翻譯設定已儲存。');
    }catch(error){$('translation-message').textContent=error.message;}
    finally{saveButton.disabled=false;removeButton.disabled=false;}
  }
  $('translation-form').addEventListener('submit',event=>{event.preventDefault();persistTranslationSettings();});
  $('translation-remove-key').addEventListener('click',()=>persistTranslationSettings(true));
  renderNavigation();renderResults();renderDetail();
  // Exposes deterministic search to local regression checks; contains no filesystem capability.
  window.SkillsTool={search:(query,category='all',source='all')=>searchSkills(query,category,'recommended',source).map(({skill,score})=>({name:skill.name,title:skill.title,score})),get count(){return data.skills.length;},get guideCoverage(){return data.skills.filter(s=>s.hasGuide).length;}};
  if(window.skillsDesktop?.translationSettings){
    window.skillsDesktop.translationSettings().then(saved=>{
      translationPreferences=saved;
      if(saved.uiLanguage)changeLanguage(saved.uiLanguage);
      if(!saved.onboarded)$('translation-onboarding').showModal();
    }).catch(()=>toast('翻譯設定暫時無法讀取；搜尋與管理仍可使用。'));
  }
})();
