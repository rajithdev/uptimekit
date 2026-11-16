"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Monitor as MonitorIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "./page-header";

export function AccountSettingsView({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const res = await authClient.listSessions();
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
  });
  const current = authClient.useSession();

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    const res = await authClient.updateUser({ name: name.trim() });
    setSavingName(false);
    if (res.error) toast.error(res.error.message ?? "Could not update name");
    else {
      toast.success("Profile updated");
      router.refresh();
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next.length < 8) return toast.error("New password must be at least 8 characters");
    setSavingPw(true);
    const res = await authClient.changePassword({ currentPassword: pw.current, newPassword: pw.next, revokeOtherSessions: true });
    setSavingPw(false);
    if (res.error) toast.error(res.error.message ?? "Could not change password");
    else {
      setPw({ current: "", next: "" });
      toast.success("Password changed. Other sessions were signed out.");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    }
  }

  async function revokeOthers() {
    const res = await authClient.revokeOtherSessions();
    if (res.error) toast.error(res.error.message ?? "Failed");
    else {
      toast.success("Signed out of other sessions");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    }
  }

  async function deleteAccount() {
    const res = await authClient.deleteUser({ password: deletePw });
    if (res.error) return toast.error(res.error.message ?? "Could not delete account");
    toast.success("Account deleted");
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Account" description={user.email} />
      <div className="space-y-6">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveName} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
              </div>
              <Button type="submit" variant="outline" disabled={savingName || !name.trim() || name.trim() === user.name}>
                {savingName && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Password</CardTitle>
            <CardDescription>Changing your password signs out all other sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input id="currentPassword" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input id="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="outline" disabled={savingPw || !pw.current || !pw.next}>
                  {savingPw && <Loader2 className="size-4 animate-spin" />} Change password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Active sessions</CardTitle>
            <CardDescription>Devices currently signed in to your account.</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" onClick={revokeOthers} disabled={!sessions.data || sessions.data.length < 2}>
                Sign out others
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {!sessions.data ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <ul className="divide-y text-sm">
                {sessions.data.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <MonitorIcon className="size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{s.userAgent ? s.userAgent.slice(0, 80) : "Unknown device"}</div>
                      <div className="text-xs text-muted-foreground">
                        Signed in {relativeTime(new Date(s.createdAt).toISOString())}
                        {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                      </div>
                    </div>
                    {current.data?.session.id === s.id && <span className="text-xs text-success">This device</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-destructive/40 shadow-none">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Delete account</CardTitle>
            <CardDescription>Permanently deletes your account, monitors, check history and incidents.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete account
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>This cannot be undone. Enter your password to confirm.</DialogDescription>
          </DialogHeader>
          <Input type="password" autoComplete="current-password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} aria-label="Password" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!deletePw} onClick={deleteAccount}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
