export type StudioUser = {
  id: string;
  email: string;
};

export type StudioVoice = {
  id: string;
  name: string;
  isPreset: boolean;
};

export type StudioSession = {
  user: StudioUser;
  voices: StudioVoice[];
};

export type StudioState = StudioSession;

export function createStudioState({ user, voices }: { user: StudioUser; voices: StudioVoice[] }): StudioState {
  return {
    user,
    voices,
  };
}

export function renderStudioSummary(state: StudioState): string {
  return `${state.voices.length} voices`;
}
