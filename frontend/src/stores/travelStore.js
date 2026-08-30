import { create } from 'zustand';

export const travelStore = create((set) => ({
  recentTravels: [],
  unpaidCount: 0,
  addTravel: (travel) =>
    set((state) => ({
      recentTravels: [travel, ...state.recentTravels].slice(0, 50),
      unpaidCount: travel.isUnpaid ? state.unpaidCount + 1 : state.unpaidCount,
    })),
  setRecentTravels: (travels) =>
    set({
      recentTravels: travels,
      unpaidCount: travels.filter((t) => t.isUnpaid).length,
    }),
}));