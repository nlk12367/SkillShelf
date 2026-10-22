'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
const BASE=path.resolve(__dirname,'..');
let pending;

function refreshCatalog() {
  if(pending)return pending;
  pending=(async()=>{
    const python=process.env.SKILLS_TOOL_PYTHON||(process.platform==='win32'?'python':'python3');
    try{
      await execute(python,['-X','utf8',path.join(BASE,'build-tool.py')],{cwd:BASE,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
      return JSON.parse(await fs.readFile(path.join(BASE,'skills-index.json'),'utf8'));
    }catch(error){
      const detail=error.stderr?.trim()||error.message;
      throw new Error('Skills 掃描失敗：'+detail);
    }
  })().finally(()=>{pending=null;});
  return pending;
}

module.exports={refreshCatalog};
