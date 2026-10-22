# SkillShelf

[English](README.md) | **繁體中文**

![SkillShelf 圖示](assets/app-icon-128.png)

> 把 Skills 收好，讓需求找到工具。

SkillShelf 讓你依照要做的事情，搜尋與管理已安裝的 Agent Skills，再把 Skill 指令、需求與檔案參考組成 Markdown prompt。清單整合本地、共用、專案與 plugin 來源。

首次啟動可選擇繁體中文或 English，並決定是否使用 AI 中文翻譯。選擇會保存，之後不再詢問；可從更新按鈕上方的「語言與翻譯設定」調整。

## 目錄

- [為什麼需要 SkillShelf](#why-skillshelf)
- [可以做什麼](#what-you-can-do)
- [安裝與啟動](#install-and-launch)
- [使用 Skill](#use-a-skill)
- [更多說明](#more-information)
- [授權](#license)

<a id="why-skillshelf"></a>

## 為什麼需要 SkillShelf

我目前裝了約 500 個 Skills。想快速開發時，光是找一個適合的 Skill 就要花不少時間：大多數名稱與說明都是英文，有些描述我也看不懂，所以很難馬上判斷該用哪一個。

下載 Skill 很快，後續管理卻麻煩得多。我做 SkillShelf，是希望能依照開發中的任務找到需要的 Skill、整理常用項目，再把指令、設計需求與檔案參考組成 prompt，讓 AI 收到更完整、精確的需求。

<a id="what-you-can-do"></a>

## 可以做什麼

- 搜尋本地、共用、專案與 plugin Skills，包含 ECC。
- 查看中文用途說明與 Skill 原文。
- 收藏、隱藏與整理 Skills。
- 在桌面版拖曳或貼上檔案，自動取得檔名與完整路徑，再勾選要使用的資源。
- 將 Skill 指令、任務與勾選資源複製成 Markdown prompt。
- 桌面版按「更新 Skills 清單」即可重新掃描，不必重啟，並保留任務與資源勾選。
- 可選用自己的 OpenAI 相容 API，補上缺少的中文用途。首次啟動會詢問是否設定，選「不需要」後不再詢問；之後仍可從更新按鈕上方的「語言與翻譯設定」調整。

在 SkillShelf 隱藏項目，不會停用 Agent 裡的 Skill。

AI 翻譯預設關閉。啟用時設定 API 網址、模型名稱與金鑰；只傳送 Skill 名稱與用途摘要，沒有摘要時使用少量標題，不傳送任務、資源檔案或完整 Skill 原文。服務商可能收取費用。金鑰透過作業系統安全儲存機制加密，翻譯結果會保留供下次使用；此功能在桌面版提供。

<a id="install-and-launch"></a>

## 安裝與啟動

**Windows 64 位元：**到 [GitHub Releases](https://github.com/nlk12367/SkillShelf/releases/latest) 下載 `SkillShelf-Setup-<版本>-x64.exe`，執行安裝後，從桌面或開始功能表開啟 SkillShelf。已內含 Electron（包含 Node.js）與 Python，不需另外安裝執行環境；下載完成後可離線安裝。

此版本尚未簽署程式碼憑證，Windows 可能顯示發行者或 SmartScreen 提示。請從本專案的 Releases 頁下載。

**從原始碼執行：**先安裝 **Python 3.10 以上**與 **Node.js 22.12 以上**。下載或 clone 本專案，在專案資料夾開啟終端機：

```sh
npm install
npm run desktop
```

若缺少 Electron 執行檔，首次啟動時會自動下載。Windows 後續可雙擊 `開啟 SkillShelf.cmd`。

Windows 的檔案路徑與剪貼簿整合已驗證；macOS／Linux 的原生貼上尚未在實機驗證。

<a id="use-a-skill"></a>

## 使用 Skill

1. 搜尋想做的事情或 Skill 名稱。
2. 選取 Skill，在「任務」填入自己的需求。
3. 展開「資源收納」，拖曳或貼上檔案，勾選要使用的資源。
4. 按「複製使用指令」，貼到 Agent。

輸出範例：

```markdown
/ecc:api-design

# 任務
請設計會員資料 API，包含分頁與一致的錯誤回應。

# 資源
1. 檔案：requirements.md
   路徑：C:\Projects\skillshelf\docs\requirements.md
2. 檔案：schema.json
   路徑：C:\Projects\skillshelf\schemas\schema.json
```

資源以路徑帶入，不會上傳檔案，接收 prompt 的 Agent 必須能存取這些位置。沒有勾選資源時，省略資源段落。

<a id="more-information"></a>

## 更多說明

- [使用說明](使用說明.md)
- [技術導讀](Read.md)：網頁版、掃描設定、架構、開發、測試與原始碼打包。
- [掃描設定檔](skills-config.json)

<a id="license"></a>

## 授權

SkillShelf 程式與專案文件採 [MIT](LICENSE) 授權。掃描到的 Skills 維持原來源授權，詳見[第三方內容](THIRD_PARTY_NOTICES.md)。
