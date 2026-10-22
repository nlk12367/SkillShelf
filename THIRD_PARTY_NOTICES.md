# 第三方內容

本專案的 MIT 授權適用於這份工具程式及專案自行撰寫的說明。掃描到的 Skills、plugin 資產及 SKILL.md 原文，仍依各自來源的授權條款使用。

開源程式包不包含使用者的已安裝 Skills、plugin 原文、個人路徑或掃描索引；這些內容在使用者的電腦上掃描後建立。中文用途對照由本專案整理，供檢索與辨識功能使用。

Playwright 僅作為開發測試依賴，未隨本工具原始碼包散布其程式或瀏覽器。其授權與 notices 可參照安裝套件本身。

原始碼版透過 npm 安裝 Electron，原始碼包不包含 Electron 執行檔。Windows 安裝檔包含 Electron 45.0.0、Chromium、Node.js 及依賴；其授權見安裝目錄隨附的 `LICENSE.electron.txt`、`LICENSES.chromium.html` 與上游 notices。

Windows 安裝檔另包含 Python 3.14.9 官方 Windows x64 embeddable distribution，供掃描與原生剪貼簿使用；Python 授權及第三方聲明保留於 `resources/python/LICENSE.txt`。建置腳本從 python.org 下載並核對固定 SHA-256，不包含 pip，也不依賴系統安裝的 Python。

安裝程式由 electron-builder 及 NSIS 製作；electron-builder 僅用於建置，不作為 App 執行期的 Node.js 依賴。
