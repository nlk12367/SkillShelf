'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
const BASE=path.resolve(__dirname,'..');

function locations(){
  const app=process.versions.electron?require('electron').app:null;
  const packaged=Boolean(app?.isPackaged);
  const source=packaged?path.join(process.resourcesPath,'tool'):BASE;
  const data=packaged?path.join(app.getPath('userData'),'catalog'):path.resolve(process.env.SKILLS_TOOL_DATA_DIR||BASE);
  return {packaged,source,data,html:path.join(data,'Skills查詢工具.html'),
    python:packaged?path.join(process.resourcesPath,'python','python.exe'):
      process.env.SKILLS_TOOL_PYTHON||(process.platform==='win32'?'python':'python3')};
}

async function runPython(script,options={}){
  const paths=locations();
  fs.mkdirSync(paths.data,{recursive:true});
  const config=path.join(paths.data,'skills-config.json');
  if(paths.packaged&&!fs.existsSync(config))fs.copyFileSync(path.join(paths.source,'skills-config.json'),config,fs.constants.COPYFILE_EXCL);
  const args=[...(paths.packaged?['-I']:[]),'-B','-X','utf8',path.join(paths.source,script)];
  return execute(paths.python,args,{cwd:paths.data,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:1024*1024,
    ...options,env:{...process.env,SKILLS_TOOL_DATA_DIR:paths.data}});
}

module.exports={locations,runPython};
