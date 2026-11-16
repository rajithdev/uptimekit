"use client";
import { Activity, AlertTriangle, Bell, LayoutDashboard, LogOut, Menu, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/monitors", label: "Monitors", icon: Activity },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
];
const SETTINGS = [
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/account", label: "Account", icon: UserRound },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const item = (n: (typeof NAV)[number]) => {
    const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
          active && "bg-sidebar-accent font-medium text-sidebar-foreground",
        )}
      >
        <n.icon className="size-4" />
        {n.label}
      </Link>
    );
  };
  return (
    <nav className="flex flex-col gap-6" aria-label="Main">
      <div className="flex flex-col gap-0.5">{NAV.map(item)}</div>
      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Settings</div>
        {SETTINGS.map(item)}
      </div>
    </nav>
  );
}

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function logout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 md:flex">
        <Link href="/dashboard" className="mb-6 px-2.5">
          <Logo />
        </Link>
        <NavLinks />
        <div className="mt-auto px-2.5 text-[11px] text-muted-foreground">Data refreshes every 15s</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-4">
              <SheetTitle className="mb-4">
                <Logo />
              </SheetTitle>
              <NavLinks onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Link href="/dashboard" className="md:hidden">
            <Logo withText={false} />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild size="sm" className="mr-1 hidden sm:inline-flex">
              <Link href="/monitors/new">
                <Plus className="size-4" /> New monitor
              </Link>
            </Button>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
                  <Avatar className="size-7">
                    <AvatarFallback className="text-[11px]">{initials || "U"}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings/account">Account settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/notifications">Notifications</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={logout}>
                  <LogOut className="size-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
