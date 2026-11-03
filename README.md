# Fade Listening MVP

这是一个语言无关的 Fade Listening 原型：

- `fade-preprocessor/`：在 ChatGPT/Codex 中运行的字幕分析 Skill 骨架
- `index.html` + `app.js`：不调用 AI 的 Web app，负责导入内容包、播放、字幕淡出、checkpoint quiz 和本地学习状态
- `content-adapter.js` + `engine.js`：将 Agent schema 2.0 适配为前端 cue，并执行确定性的 Level 0–4 字幕规则
- `course-store.js` + `course-workflow.js` + `course-editor.js`：以 IndexedDB 保存本机课程、教师修订和学习进度
- `Spanish-demo.zip`：预处理好的西语短剧 Agent schema 2.0 示例内容包

## 快速体验

```bash
python3 server.py
```

然后打开 `http://127.0.0.1:4173/`，可以点击 `Try our Spanish demo` 体验教师/学生模式，或输入 YouTube 链接进行分析。

## 静态上线

项目不需要运行时后端即可部署。把整个目录作为静态项目发布到 Vercel、Netlify 或 GitHub Pages，并将根目录设置为项目根目录。不要直接双击 `index.html`，因为示例包和 YouTube 播放器需要 HTTP 环境。

当前目录包含 `vercel.json`，可直接作为 Vercel 静态站配置使用。部署前请确认视频允许嵌入，并不要把 `.env` 或任何 API key 上传。

线上分析需要另外运行 `fade-subtitle-agent` 的 HTTP API。前端默认请求同域的
`/api/agent`，Vercel 的 `api/agent/[...path].js` 会将请求转发到
`FADE_AGENT_API_ORIGIN` 指定的 Agent API 服务；不需要把 API key 放到浏览器。
长时间分析由 Agent 服务后台执行，前端只轮询任务状态，运行中进度最多显示 95%。

首页的 `Try our Spanish demo` 会读取 `Spanish-demo.zip` 并提供教师/学生模式选择。
课程、教师修订和观看进度保存在当前浏览器的 IndexedDB 中；MVP 暂不提供账号登录或跨设备同步。

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
