import { useState } from "react";
import { Link, useLocation } from "wouter";
import { BarChart3, ChevronDown, ChevronUp, LogOut, StoreIcon, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProviderAuth } from "@/context/ProviderAuthContext";
import brandIcon from "@/assets/brand/icon.png";
import brandLogo from "@/assets/brand/logo.png";

const nav = [
  { href: "/provider", label: "نظرة عامة", icon: BarChart3 },
  { href: "/provider/stores", label: "المتاجر", icon: StoreIcon },
  { href: "/provider/leads", label: "طلبات التجار", icon: UserPlus },
];

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useProviderAuth();
  const [mobileNavCollapsed, setMobileNavCollapsed] = useState(false);

  return (
    <div className="dashboard-shell flex h-screen overflow-hidden bg-background" dir="rtl">
      <aside
        className="dashboard-sidebar w-60 flex-shrink-0 bg-sidebar flex flex-col border-l border-sidebar-border"
        data-mobile-collapsed={mobileNavCollapsed ? "true" : "false"}
      >
        <div className="dashboard-sidebar-brand flex flex-col items-center gap-2 px-5 py-5 text-center border-b border-sidebar-border">
          <div className="min-w-0">
            <img src={brandLogo} alt="Ordely" className="mx-auto h-10 w-auto max-w-[10.5rem] object-contain" />
            <p className="text-xs text-sidebar-foreground/50 leading-tight mt-2">Provider Console</p>
          </div>
        </div>

        <nav className="dashboard-sidebar-nav flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/provider" ? location === href : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "dashboard-nav-link flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                )}
                aria-label={label}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="dashboard-nav-label">{label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          className="dashboard-mobile-toggle"
          onClick={() => setMobileNavCollapsed((value) => !value)}
          aria-label={mobileNavCollapsed ? "إظهار القائمة" : "إخفاء القائمة"}
        >
          {!mobileNavCollapsed && <ChevronUp className="dashboard-mobile-toggle-arrow" />}
          <span className="dashboard-mobile-toggle-icon">
            <img src={brandIcon} alt="" aria-hidden="true" />
          </span>
          {mobileNavCollapsed && <ChevronDown className="dashboard-mobile-toggle-arrow" />}
        </button>

        <div className="dashboard-sidebar-footer px-3 py-4 border-t border-sidebar-border">
          <div className="px-2 mb-3">
            <p className="text-xs font-medium text-sidebar-foreground/70 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="dashboard-main flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
