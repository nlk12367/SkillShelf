'use strict';
const {spawnSync,spawn}=require('node:child_process');
const path=require('node:path');
const BASE=path.resolve(__dirname,'..');
const python=process.env.SKILLS_TOOL_PYTHON||(process.platform==='win32'?'python':'python3');
const build=spawnSync(python,['-X','utf8',path.join(BASE,'build-tool.py')],{cwd:BASE,stdio:'inherit',windowsHide:true});
if(build.error)throw build.error;
if(build.status!==0)process.exit(build.status||1);
const executable=require('electron');
const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
// Electron owns the visible app window; hide only background build helpers.
const child=spawn(executable,[path.join(__dirname,'main.cjs')],{cwd:BASE,env:environment,stdio:'inherit',windowsHide:false});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
