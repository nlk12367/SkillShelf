'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {fileURLToPath}=require('node:url');
const {runPython}=require('./runtime.cjs');

function inspectPaths(paths) {
  if(!Array.isArray(paths)||paths.length>100||paths.some(value=>typeof value!=='string'||value.length>32768||value.includes('\0')))throw new Error('檔案清單格式不正確，最多可加入 100 個檔案。');
  const unique=[...new Set(paths.map(value=>value.trim()).filter(Boolean))];
  return unique.map(value=>{
    if(!path.isAbsolute(value))throw new Error('無法取得檔案的完整路徑，請重新拖曳或選擇檔案。');
    const absolute=path.normalize(value);
    let info;try{info=fs.statSync(absolute);}catch{throw new Error('有檔案已移動或無法存取，請重新加入。');}
    if(!info.isFile()&&!info.isDirectory())throw new Error('只支援檔案或資料夾。');
    return {name:path.basename(absolute),path:absolute,kind:info.isDirectory()?'directory':'file'};
  });
}

async function clipboardResources(clipboard) {
  if(process.platform==='win32') {
    const result=await runPython('desktop/read-file-clipboard.py',{timeout:10000});
    const paths=JSON.parse(result.stdout);
    if(paths.length)return inspectPaths(paths);
  }
  // On other desktops file managers commonly provide file:// URIs. Only those
  // formats are inspected, never HTML, images, or unrelated clipboard payloads.
  for(const item of await clipboard.read()) {
    for(const type of item.types) {
      if(!['text/uri-list','text/plain','electron application/osclipboard;format="public.file-url"','electron application/osclipboard;format="x-special/gnome-copied-files"'].includes(type))continue;
      const payload=await item.getType(type);if(!payload||typeof payload.text!=='function')continue;
      const text=await payload.text();
      const paths=text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith('file:')).map(line=>fileURLToPath(line));
      if(paths.length)return inspectPaths(paths);
    }
  }
  return [];
}

module.exports={inspectPaths,clipboardResources};
