# Fade Listening MVP

## 产品决定

首版不绑定泰语。用西语短剧 **Lola y Ana** 做第一条验证内容，数据结构和 Skill 设计支持任何语言。产品拆成两个部分：

1. **Fade Preprocessor Skill**：用户提供已有的带时间戳字幕、视频 URL、源语言和翻译语言；Skill 分析语言元素并导出审核后的 ZIP 内容包。
2. **Fade Listening Web App**：用户上传 ZIP，在网页播放视频、显示外置字幕、按规则淡出字幕、完成 checkpoint quiz，并记录本地学习状态。

网页端不调用 AI API。分析可以由用户在 ChatGPT/Codex 中运行 Skill 完成；Web app 只读取 JSON 并执行确定性规则。

## 为什么这个版本可行

- 不需要自己做字幕抓取、视频下载或语音识别。
- 不需要在网页中维护 AI key、模型调用和实时延迟。
- Skill 输出可以人工审核，避免把翻译、文化信息或词汇难度直接当成事实。
- 网页端可以在一天内完成可展示闭环：导入 → 播放 → 隐藏 → Reveal → 测验 → 下一段策略。

## 内容包 v1.0

```text
manifest.json
subtitles.json
quizzes.json
vocabulary.json
culture.json
review-report.md
```

`manifest.json` 记录视频 ID、语言、时长、checkpoint 间隔和文件路径。`subtitles.json` 记录句级时间范围、双语字幕和可隐藏标记。字符范围用 Unicode code point，避免前端索引错位。`quizzes.json` 的每道题必须引用字幕或 annotation evidence。文化注释没有可靠依据时输出空数组。

## Web app 主流程

1. 上传 ZIP 或加载示例包。
2. 验证 schema、content_id、时间戳、字符范围和跨文件引用。
3. 进入学习播放器，嵌入 YouTube 视频；字幕显示在播放器外部下方。
4. 根据 More support、Balanced、Challenge 隐藏不同数量的已审核片段。
5. 用户可以 Reveal 当前句、切换翻译或查看文化注释。
6. 到达 checkpoint 后暂停，选择开始小测或跳过。
7. 测验结果和 Reveal 记录更新下一段字幕的支持策略。
8. 学习报告显示正确率、Reveal 次数和下一次优先保留的内容。

## 隐藏规则 v1

- 只隐藏 `hide_eligible=true` 且 `review_status=approved` 的片段。
- `More support` 保留更多字幕，`Challenge` 隐藏更多字幕。
- 错题或 Reveal 过的 concept 在后续内容中更倾向保留。
- 跳过测验不改变掌握度估计。
- 同一输入和同一状态必须得到相同的隐藏结果，方便测试与解释。

## 明天下午前的交付顺序

### P0

- 西语示例内容包
- ZIP 导入和验证界面
- YouTube 播放器
- 句级字幕同步和隐藏
- Reveal、支持强度切换
- 一个 checkpoint quiz 和学习报告

### P1

- 真正的浏览器端 ZIP 解压与 schema 验证
- 更多题型和文化注释弹层
- IndexedDB 保存内容包
- 更完整的 Skill 自动化输出

## 明确不做

- 网页内 AI API
- 自动抓取任意 YouTube 字幕
- 下载或去除商业视频硬字幕
- 账号、云端内容库、教师后台
- 实时语音评分

## 当前示例

- YouTube video ID：`cICqwDkewYo`
- 源语言：`es`
- 翻译语言：`en`
- 示例短剧：`Lola y Ana`
- 真实内容包：`fade-spanish-demo.zip`
