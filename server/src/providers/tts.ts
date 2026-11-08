export type TtsRequest = {
  text: string;
  voiceSampleUrl?: string | null;
  presetVoiceId?: string | null;
  speed?: number;
};

export interface TtsProvider {
  name: string;
  synthesize(input: TtsRequest): Buffer | Promise<Buffer>;
}
