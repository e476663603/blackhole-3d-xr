# 任务记录 - v8 重建与部署

## 问题诊断

### 根本原因：部署断链
deploy/ 仓库的 v7 提交（34023f2，12:55）与 blackhole-3d-xr/ 最新源码提交（f5793a1）严重脱节。**源码经历多次重构，但从未被构建并同步到 deploy/**。用户手机上看到的 v7/v8 实际是旧代码。

### 关键发现
```
deploy/ HEAD: 34023f2 (v7: WebXR + WebRTC fallback with JSARToolKit5)
source/ HEAD: f5793a1 (refactor: remove AR.js dependency, use pure Three.js + getUserMedia)
```
两个仓库版本历史不同步，deploy/ 部署的不是最新版源码构建产物。

## 解决方案

从源码重新构建并部署：
1. `cd blackhole-3d-xr` → `npm run build:h5`（10.2秒完成，0 warnings/errors）
2. `Copy-Item dist/\* deploy/` → 同步新构建产物
3. `git commit -m "v8 rebuild"` → `git push origin gh-pages` → **成功**

## v8 结果

- **commit**: 5abb609
- **构建 hash**: app.f312b447.js, 467.f312b447.js（vs 旧版 c6391a64）
- **上线地址**: https://e476663603.github.io/blackhole-3d-xr/
- **版本标识**: 应在标题栏显示动态 VERSION（格式 2026.05.08.HHMM）

## 教训

每次修改源码后必须执行完整流程：
`源码变更` → `npm run build:h5` → `复制到 deploy` → `git commit` → `git push`

deploy/ 仓库与 blackhole-3d-xr/ 是独立的，不要假设 deploy 能自动跟随源码。