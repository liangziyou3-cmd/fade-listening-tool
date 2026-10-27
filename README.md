# Fade Listening MVP

这是一个语言无关的 Fade Listening 原型：

- `fade-preprocessor/`：在 ChatGPT/Codex 中运行的字幕分析 Skill 骨架
- `index.html` + `app.js`：不调用 AI 的 Web app，负责导入内容包、播放、字幕淡出、checkpoint quiz 和本地学习状态
- `demo-content/fade-spanish-demo/`：西语短剧示例内容包
- `fade-spanish-demo.zip`：可直接上传到 Web app 的示例 ZIP

## 快速体验

```bash
python3 server.py
```

然后打开 `http://127.0.0.1:4173/`，点击「加载示例包」。

## 静态上线

项目不需要运行时后端即可部署。把整个目录作为静态项目发布到 Vercel、Netlify 或 GitHub Pages，并将根目录设置为项目根目录。不要直接双击 `index.html`，因为示例包和 YouTube 播放器需要 HTTP 环境。

当前目录包含 `vercel.json`，可直接作为 Vercel 静态站配置使用。部署前请确认视频允许嵌入，并不要把 `.env` 或任何 API key 上传。

也可以选择 `fade-spanish-demo.zip`，体验 ZIP 导入流程。

## 生成内容包

```bash
python3 fade-preprocessor/scripts/parse_subtitles.py \
  --input demo-input/spanish-timestamps.txt \
  --output normalized.json

python3 fade-preprocessor/scripts/validate_package.py \
  --package-dir demo-content/fade-spanish-demo

python3 fade-preprocessor/scripts/package_content.py \
  --input-dir demo-content/fade-spanish-demo \
  --output fade-spanish-demo.zip
```

## 设计原则

Skill 可以由用户自己运行 AI 完成语言分析；Web app 不接运行时 AI API。网页只读取已经审核过的 JSON，按照确定性规则决定哪些字幕片段隐藏。首个示例使用西语，但字段设计支持 `es`、`fr`、`th` 等任何语言。
