'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const VERSION='3.14.9';
const HASH='3c01d7cfc666f746a6f064f60fb2156ab0ec464d3d738ab796371a46a9bb24a2';
const URL=`https://www.python.org/ftp/python/${VERSION}/python-${VERSION}-embed-amd64.zip`;
const FILES=['build-tool.py','scan-skills.py','tool-shell.html','tool.js','ui-language.js','tool.css','skill-guide.tsv','plugin-guide.tsv','skills-config.json','desktop/read-file-clipboard.py','assets/app-icon-32.png','assets/app-icon-128.png'];

(async()=>{
  if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Build on Windows x64.');
  const target=path.join(ROOT,'dist','package-runtime');
  await fs.mkdir(target,{recursive:true});
  const zip=path.join(target,`python-${VERSION}-embed-amd64.zip`);
  let bytes;
  try{bytes=await fs.readFile(zip);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!bytes){const result=await fetch(URL);if(!result.ok)throw new Error(`Python download failed: ${result.status}`);bytes=Buffer.from(await result.arrayBuffer());}
  if(createHash('sha256').update(bytes).digest('hex')!==HASH)throw new Error('Python SHA-256 mismatch.');
  await fs.writeFile(zip,bytes);
  // Recreate only this fixed staging directory: never copy live generated catalogs.
  for(const name of ['python','tool']){
    const folder=path.join(target,name);
    if(path.dirname(folder)!==target)throw new Error('Unsafe staging path.');
    await fs.rm(folder,{recursive:true,force:true});
    await fs.mkdir(folder,{recursive:true});
  }
  const python=path.join(target,'python');
  const quote=value=>"'"+value.replaceAll("'","''")+"'";
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(python)}`],{stdio:'inherit',windowsHide:true});
  for(const file of FILES){const output=path.join(target,'tool',file);await fs.mkdir(path.dirname(output),{recursive:true});await fs.copyFile(path.join(ROOT,file),output);}
  execFileSync(path.join(python,'python.exe'),['-I','-B','-X','utf8','-c','import ctypes, hashlib, pathlib, json, importlib.util; print("Embedded Python ready")'],{stdio:'inherit',windowsHide:true});
  await fs.writeFile(path.join(target,'python-runtime.json'),JSON.stringify({version:VERSION,url:URL,sha256:HASH},null,2)+'\n');
  console.log(`Prepared Python ${VERSION} and ${FILES.length} approved tool files.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
