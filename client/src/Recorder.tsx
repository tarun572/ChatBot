import { useEffect, useRef, useState } from 'react';

type RecorderProps = { onRecorded: (file: File) => void };

async function toMonoWav(blob: Blob): Promise<File> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const rate = 22050;
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    write(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, index) => {
      const value = Math.max(-1, Math.min(1, sample));
      view.setInt16(44 + index * 2, value < 0 ? value * 32768 : value * 32767, true);
    });
    return new File([buffer], 'voice-sample.wav', { type: 'audio/wav' });
  } finally {
    await context.close();
  }
}

export default function Recorder({ onRecorded }: RecorderProps) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  useEffect(() => () => {
    recorder.current?.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((value) => {
      if (value >= 59) recorder.current?.stop();
      return Math.min(value + 1, 60);
    }), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const start = async () => {
    setError('');
    setSeconds(0);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const instance = new MediaRecorder(media);
      recorder.current = instance;
      chunks.current = [];
      instance.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      instance.onstop = () => {
        setRecording(false);
        media.getTracks().forEach((track) => track.stop());
        void toMonoWav(new Blob(chunks.current)).then((file) => {
          onRecorded(file);
          setPreview((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return URL.createObjectURL(file);
          });
        }).catch(() => setError('Could not process this recording. Try another browser or upload an audio file.'));
      };
      instance.start();
      setRecording(true);
    } catch {
      setError('Microphone access was denied or is unavailable. You can upload an audio file instead.');
    }
  };

  return (
    <div className="recorder-control">
      <button type="button" onClick={() => recording ? recorder.current?.stop() : void start()}>
        {recording ? `Stop recording (${seconds}s / 60s)` : 'Record voice sample'}
      </button>
      {preview && <audio controls src={preview} aria-label="Recorded voice sample preview" />}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
