import { useEffect, useMemo, useState } from 'react';
import { demoApi, getSessionToken, setSessionToken, studioApi, type Job, type Voice } from './api';
import Recorder from './Recorder';

const samplePoem = `The night is full of small bells.
[Pause 1s]
Even the quietest windows glow.`;

export default function App() {
  const [view, setView] = useState<'demo' | 'studio'>('demo');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerMode, setRegisterMode] = useState(false);
  const [studioVoices, setStudioVoices] = useState<Voice[]>([]);
  const [history, setHistory] = useState<Job[]>([]);
  const [voiceName, setVoiceName] = useState('My voice');
  const [sample, setSample] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [text, setText] = useState(samplePoem);
  const [lineGap, setLineGap] = useState(350);
  const [status, setStatus] = useState<'ready' | 'processing' | 'done' | 'failed'>('ready');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');

  const refreshStudio = async () => {
    const [userInfo, voiceList, jobs] = await Promise.all([studioApi.me(), studioApi.voices(), studioApi.jobs()]);
    setUser(userInfo);
    setStudioVoices(voiceList);
    setHistory(jobs);
  };

  const charCount = useMemo(() => text.length, [text]);

  useEffect(() => {
    let active = true;
    void demoApi.voices().then((result) => {
      if (!active) return;
      setVoices(result);
      setVoiceId(result[0]?.id ?? '');
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load preset voices'));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!getSessionToken()) return;
    void refreshStudio().catch(() => {
      setSessionToken(null);
      setUser(null);
    });
  }, []);

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'failed') return;
    let active = true;
    const timer = window.setTimeout(() => {
      const fetchJob = view === 'studio' && user ? studioApi.job(job.id) : demoApi.job(job.id);
      void fetchJob.then((updated) => {
        if (active) {
          setJob(updated);
          if (view === 'studio') setHistory((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
          setStatus(updated.status === 'done' ? 'done' : updated.status === 'failed' ? 'failed' : 'processing');
        }
      }).catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Unable to check job status');
          setStatus('failed');
        }
      });
    }, 1500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [job, user, view]);

  const insertPause = () => {
    setText((current) => `${current.trim()}\n[Pause 1s]`);
  };

  const handleGenerate = async () => {
    setError('');
    setJob(null);
    setStatus('processing');
    try {
      const created = await demoApi.generate({ voiceId, text, lineGapMs: lineGap });
      setJob(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to generate audio');
      setStatus('failed');
    }
  };

  const handleAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      const result = await (registerMode ? studioApi.register({ email, password }) : studioApi.login({ email, password }));
      setSessionToken(result.token);
      await refreshStudio();
      setPassword('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authentication failed');
    }
  };

  const handleVoiceUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sample || !consent) return;
    const form = new FormData();
    form.set('sample', sample);
    form.set('name', voiceName);
    form.set('consent', 'true');
    try {
      await studioApi.uploadVoice(form);
      setSample(null);
      setConsent(false);
      await refreshStudio();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Voice upload failed');
    }
  };

  const handleStudioGenerate = async () => {
    const selectedVoice = studioVoices.find((voice) => voice.id === voiceId) ?? studioVoices.find((voice) => !voice.isPreset) ?? studioVoices[0];
    if (!selectedVoice) {
      setError('Upload a voice sample before generating in Studio.');
      return;
    }
    try {
      const created = await studioApi.generate({ voiceId: selectedVoice.id, text, lineGapMs: lineGap });
      setJob(created);
      setHistory((current) => [created, ...current]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to generate audio');
    }
  };

  const logout = () => {
    setSessionToken(null);
    setUser(null);
    setStudioVoices([]);
    setHistory([]);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">VerseVoice demo</p>
          <h1>Poetry to voice</h1>
        </div>
        <nav aria-label="Main navigation">
          <button type="button" aria-pressed={view === 'demo'} onClick={() => setView('demo')}>Public demo</button>
          <button type="button" aria-pressed={view === 'studio'} onClick={() => setView('studio')}>Studio</button>
          {user && <button type="button" onClick={logout}>Sign out</button>}
        </nav>
      </header>

      {view === 'studio' && !user && (
        <section className="panel">
          <h2>{registerMode ? 'Create account' : 'Sign in'}</h2>
          <form onSubmit={(event) => void handleAuth(event)} className="form-stack">
            <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input type="password" autoComplete={registerMode ? 'new-password' : 'current-password'} minLength={registerMode ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <button className="primary" type="submit">{registerMode ? 'Create account' : 'Sign in'}</button>
          </form>
          <button type="button" onClick={() => setRegisterMode((current) => !current)}>{registerMode ? 'Have an account? Sign in' : 'Create an account'}</button>
          {error && <p role="alert">{error}</p>}
        </section>
      )}

      {view === 'studio' && user && (
        <>
          <section className="panel">
            <div className="panel-header"><h2>My voices</h2><span>{user.email}</span></div>
            <form onSubmit={(event) => void handleVoiceUpload(event)} className="form-stack">
              <label>Voice name<input required maxLength={60} value={voiceName} onChange={(event) => setVoiceName(event.target.value)} /></label>
              <Recorder onRecorded={setSample} />
              <label>Voice sample<input type="file" accept="audio/*" required onChange={(event) => setSample(event.target.files?.[0] ?? null)} /></label>
              <label className="check-label"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> This is my own voice and I consent to its use.</label>
              <button type="submit" disabled={!sample || !consent}>Save voice</button>
            </form>
            <ul className="voice-list">
              {studioVoices.map((voice) => <li key={voice.id}><span>{voice.name}{voice.isPreset ? ' (preset)' : ''}</span>{!voice.isPreset && <button type="button" onClick={() => void studioApi.removeVoice(voice.id).then(refreshStudio).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to delete voice'))}>Delete</button>}</li>)}
            </ul>
          </section>
          <section className="panel">
            <h2>New voice-over</h2>
            <div className="panel-header"><label htmlFor="studio-poem">Poem</label><span>{charCount} chars</span></div>
            <textarea id="studio-poem" rows={8} value={text} onChange={(event) => setText(event.target.value)} />
            <div className="actions"><button className="primary" type="button" disabled={!studioVoices.length} onClick={() => void handleStudioGenerate()}>Generate in Studio</button></div>
          </section>
          <section className="panel"><h2>History</h2>{history.map((entry) => <p key={entry.id}>{entry.status}{entry.audioUrl && <audio controls src={entry.audioUrl} />}</p>)}</section>
        </>
      )}

      {view === 'demo' && <section className="panel">
        <div className="panel-header">
          <label htmlFor="poem">Poem</label>
          <span>{charCount} chars</span>
        </div>

        <textarea
          id="poem"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={12}
        />

        <div className="toolbar">
          <button type="button" onClick={insertPause}>Insert pause</button>
          <label>
            Voice
            <select value={voiceId} onChange={(event) => setVoiceId(event.target.value)} disabled={!voices.length}>
              {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
            </select>
          </label>
          <label>
            Line gap
            <input
              type="range"
              min={0}
              max={1000}
              step={50}
              value={lineGap}
              onChange={(event) => setLineGap(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="actions">
          <button type="button" className="primary" onClick={() => void handleGenerate()} disabled={!voiceId || !text.trim() || status === 'processing'}>
            {status === 'processing' ? 'Generating…' : 'Generate audio'}
          </button>
        </div>
      </section>}

      {view === 'demo' && <section className="panel result-panel">
        <h2>Output</h2>
        <p>Status: {job?.status ?? status}</p>
        <p>Selected line gap: {lineGap}ms</p>
        {error && <p role="alert">{error}</p>}
        {job?.error && <p role="alert">{job.error}</p>}
        {job?.audioUrl && <audio controls src={job.audioUrl} />}
      </section>}
    </main>
  );
}
