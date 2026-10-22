'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {createTranslationService,fingerprint}=require('./desktop/translation.cjs');
const makeSkill=(name='fixture-market',sha256='a'.repeat(64))=>({name,sha256,hasGuide:false,originalDescription:'Create useful marketing copy.',headings:['Copywriting'],body:'PRIVATE FULL INSTRUCTIONS',path:'PRIVATE LOCAL PATH',resources:['PRIVATE RESOURCE'],task:'PRIVATE TASK'});
const translated=id=>({id,title:'撰寫行銷文案',summary:'依照需求撰寫清楚的行銷文案。',category:'商務與營運',keywords:['文案','行銷']});
const answer=items=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({translations:items})}}]}),{status:200});
async function fixture(t,fetchImpl=async()=>answer([translated(0)]),storage={available:async()=>true,encrypt:async value=>Buffer.from(value).reverse(),decrypt:async value=>Buffer.from(value).reverse().toString()}){
  const directory=path.join(__dirname,'dist','translation-unit-'+randomUUID());await fs.mkdir(directory,{recursive:true});
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const settingsFile=path.join(directory,'settings.json'),cacheFile=path.join(directory,'ai-translations.json');
  const service=createTranslationService({settingsFile,cacheFile,secretStorage:storage,fetchImpl});
  const enable=(options={})=>service.saveSettings({enabled:true,baseUrl:'https://api.example.com/v1',model:'test-model',maxPerRefresh:50,apiKey:'synthetic-key-for-test',...options});
  return {directory,settingsFile,cacheFile,service,enable};
}
test('first-run decline persists and never makes a request',async t=>{
  const {service,settingsFile}=await fixture(t,()=>assert.fail('unexpected request'));
  assert.equal((await service.publicSettings()).onboarded,false);
  await service.skipOnboarding();const saved=await service.publicSettings();assert.equal(saved.onboarded,true);assert.equal(saved.enabled,false);assert.equal(saved.hasKey,false);
  assert.equal((await service.translateMissing({skills:[makeSkill()]})).enabled,false);
  assert.equal(JSON.parse(await fs.readFile(settingsFile,'utf8')).onboarded,true);
});
test('settings expose key presence only and encrypted bytes survive reopening',async t=>{
  const {service,settingsFile,enable}=await fixture(t);const publicValue=await enable();
  assert.equal(publicValue.hasKey,true);assert(!JSON.stringify(publicValue).includes('synthetic-key'));
  assert(!(await fs.readFile(settingsFile,'utf8')).includes('synthetic-key'));
  await service.saveSettings({...publicValue,apiKey:''});assert.equal((await service.publicSettings()).hasKey,true);
});
test('rejects unsafe endpoints and changing endpoint with a retained key',async t=>{
  const {service,enable}=await fixture(t);
  for(const baseUrl of ['http://api.example.com','https://key@api.example.com','https://api.example.com?key=x','file:///tmp'])await assert.rejects(enable({baseUrl}),/HTTPS/);
  await enable();await assert.rejects(enable({baseUrl:'https://other.example.com',apiKey:''}),/重新輸入/);
  assert.equal((await service.publicSettings()).baseUrl,'https://api.example.com/v1');
});
test('removing the key disables translation and unavailable secure storage refuses plaintext',async t=>{
  const one=await fixture(t);await one.enable();await one.service.saveSettings({...await one.service.publicSettings(),removeKey:true});
  assert.equal((await one.service.publicSettings()).hasKey,false);assert.equal((await one.service.publicSettings()).enabled,false);
  const two=await fixture(t,undefined,{available:async()=>false});await assert.rejects(two.enable(),/安全金鑰儲存/);
});
test('only description metadata crosses the boundary; full body, paths, task and resources are excluded',async t=>{
  let request;const {service,enable}=await fixture(t,async(url,options)=>{request={url,options};return answer([translated(0)]);});
  await enable();const report=await service.translateMissing({skills:[makeSkill()]});assert.equal(report.translated,1);
  const body=JSON.parse(request.options.body);assert.equal(request.url,'https://api.example.com/v1/chat/completions');assert.equal(request.options.redirect,'error');
  const user=JSON.parse(body.messages[1].content);assert.deepEqual(Object.keys(user.skills[0]).sort(),['description','headings','id','name']);
  assert(!request.options.body.includes('PRIVATE'));assert.equal(body.model,'test-model');assert.equal(request.options.headers.Authorization,'Bearer synthetic-key-for-test');
});
test('cached translations avoid repeated calls and changed hashes are retranslated',async t=>{
  let calls=0;const {service,enable}=await fixture(t,async()=>{calls++;return answer([translated(0)]);});await enable();
  await service.translateMissing({skills:[makeSkill(),makeSkill()]});assert.equal(calls,1);
  await service.translateMissing({skills:[makeSkill()]});assert.equal(calls,1);
  await service.translateMissing({skills:[makeSkill('fixture-market','b'.repeat(64))]});assert.equal(calls,2);
});
test('curated items are not sent and per-refresh limits retain remaining work',async t=>{
  const {service,enable}=await fixture(t);await enable({maxPerRefresh:1});
  const report=await service.translateMissing({skills:[{...makeSkill('curated'),hasGuide:true},makeSkill('first'),makeSkill('second')]});assert.equal(report.translated,1);assert.equal(report.remaining,1);
});
test('authentication, quota and thrown provider errors never expose key or response bodies',async t=>{
  for(const status of [401,429,500]){
    const {service,enable}=await fixture(t,async()=>new Response('synthetic-key-for-test',{status}));await enable();const report=await service.translateMissing({skills:[makeSkill()]});
    assert(report.error);assert(!JSON.stringify(report).includes('synthetic-key'));assert.equal(report.translated,0);
  }
  const {service,enable}=await fixture(t,async()=>{throw new Error('synthetic-key-for-test');});await enable();assert(!(await service.translateMissing({skills:[makeSkill()]})).error.includes('synthetic-key'));
});
test('rejects non-Chinese output and unknown ids without poisoning the cache',async t=>{
  for(const item of [{...translated(0),title:'English title'},{...translated(0),id:99}]){
    const {service,enable,cacheFile}=await fixture(t,async()=>answer([item]));await enable();const report=await service.translateMissing({skills:[makeSkill()]});
    assert.equal(report.translated,0);let cache;try{cache=JSON.parse(await fs.readFile(cacheFile,'utf8'));}catch{}assert(!cache||Object.keys(cache.entries).length===0);
  }
});
test('completed batches survive a later failed request',async t=>{
  let calls=0;const {service,enable,cacheFile}=await fixture(t,async()=>++calls===1?answer(Array.from({length:5},(_,i)=>translated(i))):new Response('',{status:429}));await enable();
  const report=await service.translateMissing({skills:Array.from({length:6},(_,i)=>makeSkill('skill-'+i))});
  assert.equal(report.translated,5);assert.equal(report.remaining,1);assert.equal(Object.keys(JSON.parse(await fs.readFile(cacheFile,'utf8')).entries).length,5);
});
test('builder applies cache, preserves original command, and invalidates it when source changes',async t=>{
  const {directory,cacheFile}=await fixture(t);const skillFile=path.join(directory,'skills/fixture-market/SKILL.md');await fs.mkdir(path.dirname(skillFile),{recursive:true});
  await fs.writeFile(skillFile,'---\nname: fixture-market\ndescription: Create marketing copy.\n---\n# Copy\n');
  await fs.writeFile(path.join(directory,'skills-config.json'),JSON.stringify({skillRoots:['./skills'],pluginCaches:[],includeAuxiliary:false}));
  const build=()=>{execFileSync(process.env.SKILLS_TOOL_PYTHON||'python',['-X','utf8',path.join(__dirname,'build-tool.py')],{env:{...process.env,SKILLS_TOOL_DATA_DIR:directory,CODEX_HOME:path.join(directory,'empty')},windowsHide:true});return fs.readFile(path.join(directory,'skills-index.json'),'utf8').then(JSON.parse);};
  const original=(await build()).skills[0];assert.equal(original.originalDescription,'Create marketing copy.');
  await fs.writeFile(cacheFile,JSON.stringify({entries:{[fingerprint(original)]:{...translated(0),name:original.name,sourceHash:original.sha256}}}));
  const cached=(await build()).skills[0];assert.equal(cached.hasGuide,true);assert.equal(cached.guideSource,'ai');assert.equal(cached.name,'fixture-market');assert.equal(cached.title,'撰寫行銷文案');
  await fs.appendFile(skillFile,'Changed source.');assert.equal((await build()).skills[0].hasGuide,false);
});
