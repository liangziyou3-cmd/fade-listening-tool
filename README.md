# Fade Listening MVP

这是一个语言无关的 Fade Listening 原型：

- `fade-preprocessor/`：在 ChatGPT/Codex 中运行的字幕分析 Skill 骨架
- `index.html` + `app.js`：不调用 AI 的 Web app，负责导入内容包、播放、字幕淡出、checkpoint quiz 和本地学习状态
- `content-adapter.js` + `engine.js`：将 Agent schema 2.0 适配为前端 cue，并执行确定性的 Level 0–4 字幕规则
- `course-store.js` + `course-workflow.js` + `course-editor.js`：以 IndexedDB 保存本机课程、教师修订和学习进度
- `Spanish-demo.zip`：预处理好的西语短剧 Agent schema 2.0 示例内容包

## 快速体验

```bash
set -a; source .env; set +a; python3 server.py
```

先在被 Git 忽略的 `.env` 中配置 `FADE_INVITE_CODE`，然后打开 `http://127.0.0.1:4173/`。可以点击 `Try our Spanish demo` 体验教师/学生模式，或输入 YouTube 链接进行分析。

## Vercel 上线

把前端目录作为 Vercel 项目根目录发布。邀请码验证和 Agent 代理使用 Vercel Functions，因此仅部署静态文件或直接打开 `index.html` 无法完成登录。

当前目录包含 `vercel.json`，可直接作为 Vercel 静态站配置使用。部署前请确认视频允许嵌入，并不要把 `.env` 或任何 API key 上传。

登录需要在 Vercel 项目环境变量中设置 `FADE_INVITE_CODE`，并在设置或更改后重新部署。邀请码由服务端验证，并写入 7 天有效的 HttpOnly Cookie；Agent 代理拒绝没有有效会话的请求。不要把实际邀请码提交到 Git。邮箱和密码仍是演示字段，注册按钮仍不会创建账户。

线上分析需要另外运行 `fade-subtitle-agent` 的 HTTP API。前端默认请求同域的
`/api/agent`，Vercel 的 `api/agent/[...path].js` 会将请求转发到
`FADE_AGENT_API_ORIGIN` 指定的 Agent API 服务，并从服务端环境变量
`FADE_AGENT_API_KEY` 添加 Bearer 密钥；浏览器不会接触该密钥。Agent 主机和
受邀请码保护的 Vercel 项目必须设置相同的 `FADE_AGENT_API_KEY`，并在该前端项目设置
`FADE_AGENT_API_ORIGIN`。不要在无邀请码限制的前端项目或 Preview 环境中配置 API 密钥。
Agent 的 `/health` 探活路径公开，分析、轮询和结果接口需要密钥。
长时间分析由 Agent 服务后台执行，前端只轮询任务状态，运行中进度最多显示 95%。

首页的 `Try our Spanish demo` 会读取 `Spanish-demo.zip` 并提供教师/学生模式选择。
课程、教师修订和观看进度保存在当前浏览器的 IndexedDB 中；预设教师和学生身份仍只是本机演示，暂不提供真实账户或跨设备同步。
注意：Agent API 会拒绝没有有效服务端密钥的直接请求。邀请码用于限制受保护前端的用户访问；服务端 API 密钥用于限制前端代理调用 Agent。静态资源（包括演示内容包）仍可由知道文件地址的人直接获取。

## 生成内容包

```bash
python3 fade-preprocessor/scripts/parse_subtitles.py \
  --input demo-input/spanish-timestamps.txt \
  --output normalized.json

python3 fade-preprocessor/scripts/validate_package.py \
  --package-dir /path/to/unzipped-Spanish-demo

python3 fade-preprocessor/scripts/package_content.py \
  --input-dir /path/to/unzipped-Spanish-demo \
  --output Spanish-demo.zip
```

## 设计原则

Skill 可以由用户自己运行 AI 完成语言分析；Web app 不接运行时 AI API。网页只读取已经审核过的 JSON，按照确定性规则决定哪些字幕片段隐藏。首个示例使用西语，但字段设计支持 `es`、`fr`、`th` 等任何语言。
