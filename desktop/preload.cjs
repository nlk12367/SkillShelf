'use strict';
const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('skillsDesktop',{
  refreshCatalog:()=>ipcRenderer.invoke('catalog:refresh'),
  translationSettings:()=>ipcRenderer.invoke('translation:settings'),
  saveTranslationSettings:input=>ipcRenderer.invoke('translation:save',input),
  skipTranslationOnboarding:language=>ipcRenderer.invoke('translation:skip',language),
  filesToResources:files=>{
    const paths=Array.from(files,file=>webUtils.getPathForFile(file));
    if(paths.some(value=>!value))return Promise.reject(new Error('這個檔案沒有實際儲存位置，請先儲存後再加入。'));
    return ipcRenderer.invoke('resources:inspect',paths);
  },
  chooseResources:()=>ipcRenderer.invoke('resources:choose'),
  pasteResources:()=>ipcRenderer.invoke('resources:paste'),
  writeText:text=>ipcRenderer.invoke('prompt:copy',text),
});
