'use strict';
const {app,BrowserWindow,ipcMain,dialog,clipboard}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {inspectPaths,clipboardResources}=require('./resources.cjs');
const {refreshCatalog}=require('./catalog.cjs');
const {locations}=require('./runtime.cjs');
let EXPECTED;
let mainWindow;

function requireMainFrame(event) {
  if(!mainWindow||event.sender!==mainWindow.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==EXPECTED)throw new Error('不允許的資源請求。');
}
app.setName('SkillShelf');
if(process.env.SKILLS_TOOL_USER_DATA){const folder=path.resolve(process.env.SKILLS_TOOL_USER_DATA);fs.mkdirSync(folder,{recursive:true});app.setPath('userData',folder);}
else{
  // Reuse an existing profile so the product rename preserves localStorage.
  const appData=app.getPath('appData');
  const current=path.join(appData,'SkillShelf');
  const legacy=['Skills Finder Manager','skills-finder-manager'].map(name=>path.join(appData,name));
  app.setPath('userData',fs.existsSync(current)?current:legacy.find(folder=>fs.existsSync(folder))||current);
}
if(!app.requestSingleInstanceLock())app.quit();
else{
app.on('second-instance',()=>{if(mainWindow){mainWindow.webContents.reloadIgnoringCache();mainWindow.show();mainWindow.focus();}});
app.whenReady().then(async()=>{
  const paths=locations();
  if(paths.packaged)await refreshCatalog();
  EXPECTED=pathToFileURL(paths.html).href;
  mainWindow=new BrowserWindow({width:1440,height:1000,minWidth:860,minHeight:680,show:false,
    icon:path.join(__dirname,'..','assets',process.platform==='win32'?'app-icon.ico':'app-icon.png'),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',event=>event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  mainWindow.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/i.test(details.url)}));
  ipcMain.handle('resources:inspect',(event,paths)=>{requireMainFrame(event);return inspectPaths(paths);});
  ipcMain.handle('catalog:refresh',event=>{requireMainFrame(event);return refreshCatalog();});
  ipcMain.handle('resources:choose',async event=>{
    requireMainFrame(event);
    const selected=await dialog.showOpenDialog(mainWindow,{title:'加入資源檔案',properties:['openFile','multiSelections']});
    return selected.canceled?[]:inspectPaths(selected.filePaths);
  });
  ipcMain.handle('resources:paste',async event=>{requireMainFrame(event);return clipboardResources(clipboard);});
  ipcMain.handle('prompt:copy',async(event,text)=>{requireMainFrame(event);if(typeof text!=='string'||text.length>4*1024*1024)throw new Error('複製內容格式不正確。');await clipboard.writeText(text);});
  mainWindow.on('closed',()=>{mainWindow=null;});
  await mainWindow.loadFile(paths.html);
  if(process.env.SKILLS_TOOL_TEST_MODE!=='1')mainWindow.show();
}).catch(error=>{dialog.showErrorBox('SkillShelf',error.message);app.exit(1);});
}
app.on('window-all-closed',()=>app.quit());
