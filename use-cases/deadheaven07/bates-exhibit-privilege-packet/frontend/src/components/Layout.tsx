import { Outlet, Link, useLocation } from "react-router-dom";
import { Search, Settings, ShieldCheck, Sparkles, Layers } from "lucide-react";
import { clsx } from "clsx";

export function Layout() {
  const location = useLocation();

  const navItems = [
    { path: "/", label: "Exhibit Packets", icon: Layers, badge: "Core" },
    { path: "/search", label: "Packet Search", icon: Search },
    { path: "/settings", label: "System Diagnostics", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900/90 border-r border-slate-800/80 flex flex-col backdrop-blur-xl shrink-0">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-950/40">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-glow-sm group-hover:scale-105 transition-transform duration-200">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-display font-bold text-base tracking-tight text-white group-hover:text-sky-400 transition-colors">
                SuperDocs
              </span>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-sky-400 font-semibold">
                Bates & Privilege
              </span>
            </div>
          </Link>
          <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Deterministic Engine Active</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  "flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group",
                  isActive
                    ? "bg-gradient-to-r from-sky-600/20 to-indigo-600/20 text-sky-400 border border-sky-500/30 shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={clsx("h-4 w-4 transition-colors", isActive ? "text-sky-400" : "text-slate-400 group-hover:text-slate-200")} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={clsx(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded",
                    isActive ? "bg-sky-500/20 text-sky-300" : "bg-slate-800 text-slate-400"
                  )}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* System Capabilities Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span>SuperDocs HITL</span>
            </span>
            <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20">
              v1.0
            </span>
          </div>
          <div className="text-[11px] text-slate-400 text-center font-mono">
            SHA-256 Verified Packet Core
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="flex-1 overflow-auto bg-slate-950 text-slate-100">
        <Outlet />
      </main>
    </div>
  );
}