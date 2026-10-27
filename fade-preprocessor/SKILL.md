# Fade Preprocessor

将用户已有的带时间戳字幕和视频信息，整理成 Fade Listening Web App 可导入的内容包。

## 输入

- `--subtitles`：带时间戳字幕，支持 SRT、VTT 或 `[HH:MM:SS] text` 行格式。
- `--video-url`：YouTube URL 或 video ID。
- `--source-language`：目标语言，例如 `es`、`fr`、`th`。
- `--translation-language`：翻译语言，例如 `en`。
- 可选：视频时长、标题、内容简介、课程水平参考。

## 输出

输出一个目录和 ZIP：

```text
manifest.json
subtitles.json
quizzes.json
vocabulary.json
culture.json
review-report.md
```

## 处理原则

1. 重建跨字幕 cue 的完整句子，但保留原 cue ID。
2. 所有词汇、表达和文化说明必须关联字幕 evidence。
3. 字符范围使用 Unicode code point 索引，`end` 为排他值。
4. `review_status` 不是 `approved` 的内容只能进入 review report，不能直接展示。
5. 900 秒以内的视频在结尾生成一个 checkpoint；较长视频每 900 秒一个 checkpoint。
6. Skill 负责分析和生成内容；Web app 不调用 AI，只执行确定性隐藏规则和测验评分。

## 推荐运行方式

```bash
python3 scripts/parse_subtitles.py --input subtitles.txt --output normalized.json
python3 scripts/validate_package.py --package-dir demo-content/fade-spanish-demo
python3 scripts/package_content.py --input-dir demo-content/fade-spanish-demo --output fade-spanish-demo.zip
```

技能生成的内容必须经过人工审核，尤其是翻译、文化说明、字符偏移和测验答案。
