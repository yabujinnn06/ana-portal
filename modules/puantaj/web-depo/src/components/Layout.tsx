import { LogOut, Settings, Boxes, FileText, ClipboardCheck } from "lucide-react";
import Filigran from "./Filigran";
import { motion } from "framer-motion";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="fixed top-0 inset-x-0 z-50 h-14 surface-deep text-white border-b border-flame/25 shadow-lift">
        <div className="max-w-6xl mx-auto px-2.5 sm:px-4 h-14 flex items-center gap-1.5 sm:gap-4">
          <Link to="/" className="flex items-baseline gap-1 shrink-0 select-none">
            <span className="font-display text-lg font-semibold tracking-tight leading-none">Rainwater</span>
            <span className="text-flame font-display text-lg leading-none">/</span>
            <span className="hidden sm:inline font-mono text-[11px] uppercase tracking-[0.22em] text-white/60 leading-none">sayım</span>
          </Link>
          <nav className="flex-1 flex items-center justify-center sm:justify-start gap-0.5 sm:gap-1 text-sm sm:ml-3 min-w-0">
            <NavItem to="/" icon={<Boxes size={16} />} label="Oturumlar" />
            <NavItem to="/zimmet" icon={<ClipboardCheck size={16} />} label="Zimmet" />
            <NavItem to="/zimmet-senedi" icon={<FileText size={16} />} label="Zimmet Senedi" />
            {user?.rol === "admin" && (
              <NavItem to="/admin" icon={<Settings size={16} />} label="Admin" />
            )}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium leading-tight">{user?.ad}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">{user?.rol}</div>
            </div>
            <button
              onClick={() => { logout(); nav("/login"); }}
              className="p-2 rounded-lg hover:bg-white/10 transition shrink-0"
              title="Çıkış"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14">
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 min-w-0"
        >
          <Outlet />
        </motion.div>
      </main>
      <Filigran />
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end
      title={label}
      className={({ isActive }) => cn(
        "px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0 transition",
        isActive ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10",
      )}
    >
      {icon}<span className="hidden sm:inline">{label}</span>
    </NavLink>
  );
}
