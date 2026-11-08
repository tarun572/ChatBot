import io
import unittest
import wave
from unittest.mock import patch

from tts_core import check_api_key, download_sample, dummy_wav, is_allowed_url


class TtsCoreTests(unittest.TestCase):
    def test_api_key_comparison(self):
        self.assertTrue(check_api_key("right", "right"))
        self.assertFalse(check_api_key("wrong", "right"))
        self.assertFalse(check_api_key("right", ""))

    def test_allowlist_requires_exact_or_subdomain_host(self):
        hosts = ["example.com"]
        self.assertTrue(is_allowed_url("https://media.example.com/a.wav", hosts))
        self.assertTrue(is_allowed_url("https://example.com/a.wav", hosts))
        self.assertFalse(is_allowed_url("https://notexample.com/a.wav", hosts))
        self.assertFalse(is_allowed_url("file:///etc/passwd", hosts))
        self.assertFalse(is_allowed_url("https://example.com/a.wav", []))

    def test_dummy_wav_is_pcm(self):
        with wave.open(io.BytesIO(dummy_wav()), "rb") as audio:
            self.assertEqual(audio.getnchannels(), 1)
            self.assertEqual(audio.getsampwidth(), 2)
            self.assertEqual(audio.getframerate(), 16000)

    def test_download_rejects_disallowed_hosts_before_network(self):
        with self.assertRaises(ValueError):
            download_sample("https://evil.example/a.wav", ["example.com"])

    def test_download_enforces_limit(self):
        class FakeResponse(io.BytesIO):
            headers = {}

            def geturl(self):
                return "https://media.example.com/sample.wav"

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                self.close()

        with patch("urllib.request.urlopen", return_value=FakeResponse(b"12345")):
            with self.assertRaises(ValueError):
                download_sample("https://media.example.com/sample.wav", ["example.com"], max_bytes=4)


if __name__ == "__main__":
    unittest.main()
