"use client";

import { create } from "zustand";

type SessionState = {
  staffToken: string | null;
  adminToken: string | null;
  setStaffToken: (token: string | null) => void;
  setAdminToken: (token: string | null) => void;
  hydrate: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  staffToken: null,
  adminToken: null,
  setStaffToken: (token) => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("rbn_staff_token");
    }
    set({ staffToken: token });
  },
  setAdminToken: (token) => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("rbn_admin_token");
    }
    set({ adminToken: token });
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    set({
      staffToken: null,
      adminToken: null
    });
  }
}));
