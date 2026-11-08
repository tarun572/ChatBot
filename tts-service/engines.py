from __future__ import annotations

import os
import tempfile

from tts_core import dummy_wav


class DummyEngine:
    def synthesize(self, text: str, speaker_wav: bytes, language: str, speed: float) -> bytes:
        return dummy_wav(max(0.25, min(len(text.split()) * 0.18 / max(speed, 0.5), 2.0)))


class XttsEngine:
    def __init__(self) -> None:
        self._model = None

    def _load(self):
        if self._model is None:
            from TTS.api import TTS

            self._model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        return self._model

    def synthesize(self, text: str, speaker_wav: bytes, language: str, speed: float) -> bytes:
        model = self._load()
        with tempfile.TemporaryDirectory() as directory:
            speaker_path = os.path.join(directory, "speaker.wav")
            output_path = os.path.join(directory, "output.wav")
            with open(speaker_path, "wb") as sample_file:
                sample_file.write(speaker_wav)
            model.tts_to_file(
                text=text,
                speaker_wav=speaker_path,
                language=language,
                speed=speed,
                file_path=output_path,
            )
            with open(output_path, "rb") as output_file:
                return output_file.read()
