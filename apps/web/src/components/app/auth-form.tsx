"use client";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    if (mode === "register" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    const res =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: name || email.split("@")[0]! });
    setPending(false);
    if (res.error) {
      setError(
        res.error.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : (res.error.message ?? "Something went wrong. Please try again."),
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const isLogin = mode === "login";
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-[-0.03em]">{isLogin ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-2 text-muted-foreground">{isLogin ? "Sign in to your monitoring dashboard." : "Start monitoring your sites and APIs in minutes."}</p>
      <div className="mt-8">
        <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" className="h-10" autoComplete="name" maxLength={100} placeholder="Ada Lovelace" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" className="h-10" type="email" autoComplete="email" required placeholder="you@company.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              className="h-10"
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={isLogin ? undefined : 8}
              maxLength={128}
            />
            {!isLogin && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isLogin ? "Sign in" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          {isLogin ? "New to UptimeKit? " : "Already have an account? "}
          <Link href={isLogin ? "/register" : "/login"} className="font-medium text-foreground underline-offset-4 hover:underline">
            {isLogin ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </div>
    </div>
  );
}
