# v9 修复 - GitHub Pages 构建失败

## 问题
GitHub 邮件通知 "pages build and deployment workflow run" 失败：
- Build job: ❌ Failed in 18 seconds
- Deploy job: ⏭️ Skipped

## 根因
GitHub Pages 默认使用 **Jekyll** 构建静态网站。我们的项目没有 Jekyll 配置，导致构建失败。

## 解决方案
添加 `.nojekyll` 空文件到仓库根目录，告诉 GitHub：**直接 serve 静态文件，不要尝试构建**。

## 操作记录
1. 创建 `public/.nojekyll`（确保下次构建时复制到 dist）
2. 创建 `deploy/.nojekyll`（立即修复当前部署）
3. commit: c7dfd35 "Add .nojekyll to disable Jekyll build"
4. push: ef3ffd7..c7dfd35 gh-pages -> gh-pages ✅

## 验证
等待几分钟让 GitHub Pages 重新部署，然后刷新页面看版本号。

## 参考
GitHub 文档：https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#static-site-generators