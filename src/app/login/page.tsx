"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/recipes`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl mb-2">Table</h1>
        <p className="text-table-400 mb-8">
          Recipes and spots, from people you actually know. No strangers, no ads.
        </p>

        {sent ? (
          <p className="text-herb-400 text-sm">
            Check {email} for a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md bg-table-900 border border-table-700 px-4 py-3 text-table-100 placeholder:text-table-600 focus:border-herb-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-herb-600 hover:bg-herb-500 transition-colors px-4 py-3 font-medium disabled:opacity-50"
            >
              {loading ? "Sending link…" : "Send sign-in link"}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
