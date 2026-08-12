"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const supabase = createClient();
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("users")
        .select("display_name")
        .eq("id", user.id)
        .single();

      if (data) setDisplayName(data.display_name);
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const trimmed = displayName.trim();
    if (!trimmed) {
      setMessage("Name can't be empty.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({ display_name: trimmed })
      .eq("id", user.id);

    setSaving(false);
    setMessage(error ? error.message : "Saved.");
  }

  if (loading) {
    return (
      <main className="max-w-sm mx-auto px-6 py-12">
        <p className="text-table-500 text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-12">
      <Link href="/recipes" className="text-sm text-table-400 hover:text-table-100">
        ← Back
      </Link>

      <h1 className="font-display text-3xl mt-4 mb-8">Your profile</h1>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm text-table-400 mb-1">
            Name (shown to friends)
          </label>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 focus:border-herb-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-herb-600 hover:bg-herb-500 transition-colors px-4 py-3 font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        {message && (
          <p
            className={`text-sm ${
              message === "Saved." ? "text-herb-400" : "text-red-400"
            }`}
          >
            {message}
          </p>
        )}
      </form>
    </main>
  );
}