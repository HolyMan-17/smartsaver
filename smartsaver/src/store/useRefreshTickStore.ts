import { create } from 'zustand';

interface RefreshTickState {
  tickCount: number;
  tick: () => void;
}

export const useRefreshTickStore = create<RefreshTickState>((set) => ({
  tickCount: 0,
  tick: () => set((s) => ({ tickCount: s.tickCount + 1 })),
}));
