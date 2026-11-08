from __future__ import annotations

import os
import threading
from functools import lru_cache

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from engines import DummyEngine, XttsEngine
from tts_core import check_api_key, download_sample, is_allowed_url

app = FastAPI(title="VerseVoice TTS")
_model_lock = threading.Lock()


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    speaker_wav_url: str
    language: str = Field(default="en", min_length=2, max_length=8)
    speed: float = Field(default=1.0, ge=0.7, le=1.3)


@lru_cache(maxsize=1)
def get_engine():
    if os.getenv("TTS_ENGINE", "dummy") == "xtts":
        return XttsEngine()
    return DummyEngine()


def configured_hosts() -> list[str]:
    return [host.strip() for host in os.getenv("ALLOWED_SAMPLE_HOSTS", "").split(",") if host.strip()]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/synthesize")
def synthesize(payload: SynthesizeRequest, x_api_key: str | None = Header(default=None, alias="X-API-KEY")):
    expected_key = os.getenv("API_KEY", "")
    if not check_api_key(x_api_key, expected_key):
        raise HTTPException(status_code=401, detail="Invalid API key")
    hosts = configured_hosts()
    if not hosts or not is_allowed_url(payload.speaker_wav_url, hosts):
        raise HTTPException(status_code=400, detail="Sample URL host is not allowed")
    try:
        sample = download_sample(payload.speaker_wav_url, hosts)
        with _model_lock:
            audio = get_engine().synthesize(payload.text, sample, payload.language, payload.speed)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Synthesis failed") from error
    return Response(content=audio, media_type="audio/wav")
