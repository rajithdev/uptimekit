"use client";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-muted-foreground">An unexpected error occurred while rendering this page.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
      <Button onClick={reset} variant="outline" className="mt-2">
        Try again
      </Button>
    </div>
  );
}
