'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {locations,runPython}=require('./runtime.cjs');
const {translationService}=require('./translation.cjs');
let pending;

function refreshCatalog({translate=false}={}) {
  if(pending)return pending;
  pending=(async()=>{
    try{
      await runPython('build-tool.py');
      let catalog=JSON.parse(await fs.readFile(path.join(locations().data,'skills-index.json'),'utf8'));
      if(translate){
        let report;
        try{
          report=await translationService().translateMissing(catalog);
          if(report.translated){await runPython('build-tool.py');catalog=JSON.parse(await fs.readFile(path.join(locations().data,'skills-index.json'),'utf8'));}
        }catch{report={error:'AI 翻譯未完成，請檢查翻譯設定與快取；Skills 掃描已完成。',translated:0};}
        catalog.translation=report;
      }
      return catalog;
    }catch(error){
      const detail=error.stderr?.trim()||error.message;
      throw new Error('Skills 掃描失敗：'+detail);
    }
  })().finally(()=>{pending=null;});
  return pending;
}

module.exports={refreshCatalog};
