from __future__ import annotations

import hmac
import io
import os
import urllib.parse
import urllib.request
import wave
from typing import Iterable


def check_api_key(provided: str | None, expected: str) -> bool:
    return bool(provided and expected) and hmac.compare_digest(provided.encode(), expected.encode())


def is_allowed_url(url: str, allowed_hosts: Iterable[str]) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        host = (parsed.hostname or "").lower().rstrip(".")
        allowed = [entry.lower().strip().rstrip(".") for entry in allowed_hosts if entry.strip()]
        return parsed.scheme in ("http", "https") and bool(host) and any(
            host == domain or host.endswith("." + domain) for domain in allowed
        )
    except (ValueError, AttributeError):
        return False


def dummy_wav(duration_seconds: float = 0.25, sample_rate: int = 16000) -> bytes:
    frames = int(max(0.05, min(duration_seconds, 2.0)) * sample_rate)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"\x00\x00" * frames)
    return output.getvalue()


def download_sample(url: str, allowed_hosts: Iterable[str], max_bytes: int = 5 * 1024 * 1024, timeout: float = 10) -> bytes:
    if not is_allowed_url(url, allowed_hosts):
        raise ValueError("Sample URL host is not allowed")
    request = urllib.request.Request(url, headers={"User-Agent": "VerseVoice-TTS/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        final_url = response.geturl()
        if not is_allowed_url(final_url, allowed_hosts):
            raise ValueError("Sample redirected to a disallowed host")
        content_length = response.headers.get("Content-Length")
        if content_length and int(content_length) > max_bytes:
            raise ValueError("Sample exceeds size limit")
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("Sample exceeds size limit")
    return data
