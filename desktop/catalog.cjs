'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {locations,runPython}=require('./runtime.cjs');
let pending;

function refreshCatalog() {
  if(pending)return pending;
  pending=(async()=>{
    try{
      await runPython('build-tool.py');
      return JSON.parse(await fs.readFile(path.join(locations().data,'skills-index.json'),'utf8'));
    }catch(error){
      const detail=error.stderr?.trim()||error.message;
      throw new Error('Skills 掃描失敗：'+detail);
    }
  })().finally(()=>{pending=null;});
  return pending;
}

module.exports={refreshCatalog};
