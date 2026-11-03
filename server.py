#!/usr/bin/env python3
"""Local static server + secure TTS proxy for the ContextLoop demo.

The browser never receives a Qwen or Doubao API key. Configure one provider
with environment variables before starting this server.
"""
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.request
from http.cookies import SimpleCookie
from urllib.error import HTTPError, URLError
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit


ROOT = os.path.dirname(os.path.abspath(__file__))
AGENT_API_ORIGIN = os.getenv("FADE_AGENT_API_ORIGIN", "http://127.0.0.1:8080").rstrip("/")
INVITE_COOKIE = "fade_access"
SESSION_SECONDS = 60 * 60 * 24 * 7


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

    def hidden_path(self):
        path = unquote(urlsplit(self.path).path)
        return any(part.startswith(".") for part in path.split("/") if part)

    def list_directory(self, path):
        self.send_error(403)
        return None

    def proxy_agent_request(self):
        if not self.has_valid_invite():
            self.send_json(401, {"error": "Enter a valid invite code to use Fade Agent."})
            return
        parsed = urlsplit(self.path)
        agent_path = parsed.path[len("/api/agent") :] or "/"
        target = f"{AGENT_API_ORIGIN}{agent_path}"
        if parsed.query:
            target = f"{target}?{parsed.query}"
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length and self.command not in {"GET", "HEAD"} else None
        headers = {}
        if self.headers.get("Content-Type"):
            headers["Content-Type"] = self.headers["Content-Type"]
        request = urllib.request.Request(target, data=body, headers=headers, method=self.command)
        try:
            upstream = urllib.request.urlopen(request, timeout=60)
        except HTTPError as error:
            upstream = error
        except URLError as error:
            payload = json.dumps({"error": f"Agent API proxy failed: {error.reason}"}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        with upstream:
            payload = upstream.read()
            self.send_response(upstream.status)
            self.send_header("Content-Type", upstream.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)

    def do_GET(self):
        path = urlsplit(self.path).path
        if self.hidden_path():
            self.send_error(404)
            return
        if path == "/api/access":
            authorized = self.has_valid_invite()
            self.send_json(200 if authorized else 401, {"authorized": authorized})
            return
        if path == "/api/agent" or path.startswith("/api/agent/"):
            self.proxy_agent_request()
            return
        super().do_GET()

    def do_HEAD(self):
        if self.hidden_path():
            self.send_error(404)
            return
        super().do_HEAD()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/api/access":
            self.create_invite_session()
            return
        if path == "/api/agent" or path.startswith("/api/agent/"):
            self.proxy_agent_request()
            return
        if self.path != "/api/tts":
            self.send_error(404)
            return
        if not self.has_valid_invite():
            self.send_json(401, {"error": "Enter a valid invite code to use text-to-speech."})
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

    def do_DELETE(self):
        if urlsplit(self.path).path != "/api/access":
            self.send_error(404)
            return
        self.send_response(204)
        self.send_header("Set-Cookie", f"{INVITE_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def send_json(self, status, value, headers=None):
        payload = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        for name, content in (headers or {}).items():
            self.send_header(name, content)
        self.end_headers()
        self.wfile.write(payload)

    def has_valid_invite(self):
        secret = os.getenv("FADE_INVITE_CODE", "")
        if not secret:
            return False
        cookies = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookies.get(INVITE_COOKIE)
        if not morsel:
            return False
        try:
            expires_text, supplied = morsel.value.split(".", 1)
            expires_at = int(expires_text)
        except (ValueError, TypeError):
            return False
        if expires_at <= int(time.time()):
            return False
        expected = hmac.new(secret.encode(), f"fade-access-v1:{expires_at}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(supplied, expected)

    def create_invite_session(self):
        secret = os.getenv("FADE_INVITE_CODE", "")
        if not secret:
            self.send_json(503, {"error": "Invite access is not configured on the server."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            supplied = str(payload.get("invite_code", ""))
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_json(400, {"error": "Invalid invite request."})
            return
        if not hmac.compare_digest(supplied, secret):
            self.send_json(401, {"error": "That invite code is not valid."})
            return
        expires_at = int(time.time()) + SESSION_SECONDS
        signature = hmac.new(secret.encode(), f"fade-access-v1:{expires_at}".encode(), hashlib.sha256).hexdigest()
        cookie = f"{INVITE_COOKIE}={expires_at}.{signature}; HttpOnly; Path=/; SameSite=Strict; Max-Age={SESSION_SECONDS}"
        self.send_json(200, {"authorized": True}, {"Set-Cookie": cookie})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "4173"))
    print(f"ContextLoop demo running at http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
