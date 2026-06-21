"use client";

import React from "react";
import { Settings } from "lucide-react";
import { UserSession } from "@/lib/api";

interface DashboardHeaderProps {
  sidebarOpen: boolean;
  user: UserSession;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export const DashboardHeader = React.memo(function DashboardHeader({
  sidebarOpen,
  user,
  onOpenSettings,
  onLogout,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#15161A]/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className={`flex items-center gap-3 transition-all duration-300 ${sidebarOpen ? "opacity-0 pointer-events-none w-0 overflow-hidden" : "pl-12 opacity-100"}`}>
          <span className="font-serif text-xl font-bold tracking-[0.25em] text-[#F5F5F0]">
            PRIVAULT
          </span>
          <span className="h-2 w-2 rounded-full bg-[#E41613] animate-pulse"></span>
        </div>

        <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wider text-white/30">
              Seal Status:
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"></span>
              E2EE ACTIVE
            </span>
          </div>

          <div className="hidden h-4 w-px bg-white/10 sm:block"></div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <button
              onClick={onOpenSettings}
              className="break-all text-xs font-semibold uppercase tracking-widest text-[#F5F5F0]/70 bg-white/5 border border-white/10 hover:border-white/30 hover:bg-white/10 px-3 py-1.5 cursor-pointer transition-all rounded-sm flex items-center gap-1.5"
            >
              <Settings size={12} className="text-white/40" />
              <span>Vault: {user.username}</span>
            </button>
            <button
              onClick={onLogout}
              className="text-xs font-bold uppercase tracking-widest text-[#E41613] hover:text-white border border-[#E41613]/30 hover:border-[#E41613] px-3.5 py-1.5 transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
});
