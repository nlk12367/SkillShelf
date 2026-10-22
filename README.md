# SkillShelf

**English** | [繁體中文](README.zh-TW.md)

![SkillShelf icon](assets/app-icon-128.png)

> Discover, organize, and use your agent skills.

Find installed Agent Skills by what you need to build, organize the ones you use, and turn the skill command, requirements, and file references into a Markdown prompt. SkillShelf brings local, shared, project, and plugin sources into one catalog.

Choose English or Traditional Chinese during first-launch setup. Your language and optional translation choice are remembered. You can change them later in **Language & translation** above the Update button.

## Table of contents

- [Why SkillShelf](#why-skillshelf)
- [What you can do](#what-you-can-do)
- [Install and launch](#install-and-launch)
- [Use a skill](#use-a-skill)
- [More information](#more-information)
- [License](#license)

## Why SkillShelf

I have around 500 skills installed. When I want to develop something quickly, finding a suitable skill already takes time. Most names and descriptions are in English, and I don't understand some of them well enough to decide which one to use.

Downloading a skill is quick; managing the collection takes more work. I built SkillShelf so I can search by the task I'm working on, organize my skills, and put the command, design requirements, and file references into one prompt. The goal is to give the AI more complete and precise requirements.

## What you can do

- Search local, shared, project, and plugin skills, including ECC.
- Read Chinese purpose descriptions and the original skill instructions.
- Favorite, hide, and organize skills.
- On desktop, drop or paste files to collect their names and full paths, then choose which references to include.
- Copy the skill command, task, and selected resources as a Markdown prompt.
- Click **Update skills** in the desktop app to rescan without restarting, keeping your task and resource selections.
- Optionally use your own OpenAI-compatible API to add missing Chinese purpose descriptions. On first launch, choose whether to set it up; declining is remembered. **Language & translation** above the Update button lets you change this later.

Hiding a skill in SkillShelf doesn't disable it in your agent.

AI translation is off by default. Configure the API URL, model and key to enable it. Only names and purpose summaries (or a few headings when no summary exists) are sent to your provider; tasks, resource files and full Skill instructions are excluded. Provider charges may apply. Keys are encrypted through OS secure storage; completed translations are cached. This feature is available in the desktop app.

## Install and launch

**Windows x64:** download `SkillShelf-Setup-<version>-x64.exe` from [GitHub Releases](https://github.com/nlk12367/SkillShelf/releases/latest), run the installer, then open SkillShelf from the desktop or Start menu. Electron (including Node.js) and Python are bundled; no separate runtime installation is needed. The installer works offline after download.

This release is unsigned, so Windows may show a publisher or SmartScreen prompt. Download only from this repository's Releases page.

**Run from source:** install **Python 3.10+** and **Node.js 22.12+**, download or clone this repository, open a terminal in its folder, and run:

```sh
npm install
npm run desktop
```

On first launch, Electron is downloaded if needed. On Windows, later launches can use `開啟 SkillShelf.cmd`.

Windows file paths and clipboard integration have been verified. macOS and Linux native paste have not been tested on physical machines.

## Use a skill

1. Search for a task or skill name.
2. Select a skill and enter your request in **Task**.
3. Open **Resources**, drop or paste files, and check the references you want to include.
4. Click **Copy prompt**, then paste the prompt into your agent.

Example output:

```markdown
/ecc:api-design

# Task
Design a member API with pagination and consistent error responses.

# Resources
1. File: requirements.md
   Path: C:\Projects\skillshelf\docs\requirements.md
2. File: schema.json
   Path: C:\Projects\skillshelf\schemas\schema.json
```

Markdown section labels follow the selected interface language; skill commands and your text stay unchanged. Files are referenced by path, not uploaded; the receiving agent must be able to access them. With no resources selected, the resource section is omitted.

## More information

- [Usage notes (繁體中文)](使用說明.md)
- [Technical guide (繁體中文)](Read.md): browser version, scan settings, architecture, development, testing, and source packaging.
- [Scan configuration](skills-config.json)

## License

[MIT](LICENSE) for SkillShelf code and project documentation. Discovered skills retain their original licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
