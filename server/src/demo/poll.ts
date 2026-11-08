export type DemoJobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'idle';

export type DemoJobShape = {
  status?: DemoJobStatus;
  text?: string;
  audioUrl?: string | null;
};

export function buildDemoPageState(job: DemoJobShape): { status: DemoJobStatus; text: string; audioUrl: string | null } {
  return {
    status: job.status ?? 'idle',
    text: job.text ?? '',
    audioUrl: job.audioUrl ?? null,
  };
}

export function extractPrompt(raw: string): string {
  return raw
    .replace(/\[pause\s+\d+(?:\.\d+)?\s*(?:ms|s)?\]/gi, ' pause ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function usePollJob({
  jobId,
  fetchJob,
}: {
  jobId: string;
  fetchJob: () => Promise<DemoJobShape>;
}): { jobId: string; status: DemoJobStatus } {
  void jobId;
  void fetchJob;
  return { jobId, status: 'idle' };
}
