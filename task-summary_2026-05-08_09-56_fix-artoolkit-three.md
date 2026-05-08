# Task: 修复 JSARToolKit5 getUserMediaThreeScene 错误

## Objective
修复手机端 AR 启动失败：`getUserMediaThreeScene is not a function`

## Root Cause
JSARToolKit5 的 `getUserMediaThreeScene` 方法不在核心库 `artoolkit.min.js` 中，而是在单独的 Three.js 集成模块 `artoolkit.three.js` 里。之前只注入了 `artoolkit.min.js`，缺少 `artoolkit.three.js`。

## Fix Applied
1. **复制 artoolkit.three.js** (10.7KB) 到 `public/artoolkit/`
2. **修改 HtmlInjectPlugin** — 注入两个 script 标签（而非一个）
3. **重写 viewer/index.tsx**:
   - 新增 `waitForARLibraries()` — 同时等待 `ARController` 和 `getUserMediaThreeScene`
   - 动态 import Three.js 后挂载到 `window.THREE`（artoolkit.three.js 依赖全局 THREE）
   - 使用轮询 + 事件双重检测确保库加载完成

## Files Changed
- `config/index.ts` — HtmlInjectPlugin 注入双 script
- `src/pages/viewer/index.tsx` — 完整重写初始化逻辑
- `public/artoolkit/artoolkit.three.js` — 新增文件

## Deploy
- Commit: `a24c3d9` on gh-pages branch
- URL: https://e476663603.github.io/blackhole-3d-xr/

## Status
✅ 已部署，待用户手机验证
