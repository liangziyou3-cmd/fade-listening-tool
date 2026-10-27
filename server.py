#!/usr/bin/env python3
"""Local static server + secure TTS proxy for the ContextLoop demo.

The browser never receives a Qwen or Doubao API key. Configure one provider
with environment variables before starting this server.
"""
import base64
import json
import os
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


ROOT = os.path.dirname(os.path.abspath(__file__))


class ConfigError(Exception):
    pass


def http_json(url, payload, headers):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.headers.get_content_type(), response.read()


def download_audio(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.headers.get_content_type(), response.read()


def qwen_tts(text, voice):
    key = os.getenv("DASHSCOPE_API_KEY")
    if not key:
        raise ConfigError("DASHSCOPE_API_KEY is not configured")
    endpoint = os.getenv(
        "QWEN_TTS_ENDPOINT",
        "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/generation",
    )
    payload = {
        "model": os.getenv("QWEN_TTS_MODEL", "qwen-audio-3.1-tts-flash"),
        "input": {"text": text},
        "parameters": {"voice": voice or os.getenv("QWEN_TTS_VOICE", "Cherry")},
    }
    content_type, raw = http_json(endpoint, payload, {"Authorization": f"Bearer {key}"})
    if content_type.startswith("audio/"):
        return content_type, raw
    data = json.loads(raw.decode("utf-8"))
    output = data.get("output", {})
    audio = output.get("audio", {}) if isinstance(output, dict) else {}
    audio_url = audio.get("url") or output.get("audio_url")
    if audio_url:
        return download_audio(audio_url)
    encoded = audio.get("data") or output.get("audio_data")
    if encoded:
        return "audio/mpeg", base64.b64decode(encoded)
    raise RuntimeError(f"Qwen response did not contain audio: {data}")


def doubao_tts(text, voice):
    app_id = os.getenv("DOUBAO_APP_ID")
    token = os.getenv("DOUBAO_ACCESS_TOKEN")
    if not app_id or not token:
        raise ConfigError("DOUBAO_APP_ID and DOUBAO_ACCESS_TOKEN are required")
    endpoint = os.getenv("DOUBAO_TTS_ENDPOINT", "https://openspeech.bytedance.com/api/v1/tts")
    payload = {
        "app": {
            "appid": app_id,
            "token": token,
            "cluster": os.getenv("DOUBAO_CLUSTER", "volcano_tts"),
        },
        "user": {"uid": os.getenv("DOUBAO_UID", "contextloop-demo")},
        "audio": {
            "voice_type": voice or os.getenv("DOUBAO_VOICE", "zh_female_qingxin"),
            "encoding": "mp3",
            "speed_ratio": 0.85,
            "rate": 24000,
        },
        "request": {"reqid": "contextloop-demo", "text": text, "operation": "query"},
    }
    content_type, raw = http_json(endpoint, payload, {"Authorization": f"Bearer;{token}"})
    if content_type.startswith("audio/"):
        return content_type, raw
    data = json.loads(raw.decode("utf-8"))
    encoded = data.get("data") or data.get("audio_data")
    if encoded:
        return "audio/mpeg", base64.b64decode(encoded)
    raise RuntimeError(f"Doubao response did not contain audio: {data}")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if self.path != "/api/tts":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            provider = (payload.get("provider") or os.getenv("TTS_PROVIDER", "qwen")).lower()
            text = payload.get("text", "").strip()
            if not text:
                raise ValueError("text is required")
            if provider == "qwen":
                content_type, audio = qwen_tts(text, payload.get("voice", ""))
            elif provider == "doubao":
                content_type, audio = doubao_tts(text, payload.get("voice", ""))
            else:
                raise ValueError("provider must be qwen or doubao")
            self.send_response(200)
            self.send_header("Content-Type", content_type or "audio/mpeg")
            self.send_header("Content-Length", str(len(audio)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(audio)
        except ConfigError as exc:
            self.send_error(503, str(exc))
        except Exception as exc:  # keep the demo server alive and return a useful status
            self.send_error(502, str(exc))


if __name__ == "__main__":
    port = int(os.getenv("PORT", "4173"))
    print(f"ContextLoop demo running at http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
