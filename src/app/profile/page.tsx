"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileForm />
    </Suspense>
  );
}

function ProfileForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "true";
  const supabase = createClient();
  const [displayName, setDisplayName] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
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
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single();

      if (data) {
        setDisplayName(data.display_name);
        setAvatarPath(data.avatar_url);
        if (data.avatar_url) {
          const { data: signed } = await supabase.storage
            .from("avatars")
            .createSignedUrl(data.avatar_url, 60 * 60);
          setAvatarUrl(signed?.signedUrl ?? null);
        }
      }
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

    let newAvatarPath = avatarPath;
    if (newPhotoFile) {
      const ext = newPhotoFile.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, newPhotoFile);

      if (uploadError) {
        setMessage(`Photo upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      // Clean up the old photo now that the new one is safely uploaded.
      if (avatarPath) {
        await supabase.storage.from("avatars").remove([avatarPath]);
      }
      newAvatarPath = path;
    }

    const { error } = await supabase
      .from("users")
      .update({ display_name: trimmed, avatar_url: newAvatarPath })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      setMessage(error.message);
    } else if (isWelcome) {
      router.push("/recipes");
    } else {
      setMessage("Saved.");
      setAvatarPath(newAvatarPath);
      setNewPhotoFile(null);
      router.refresh();
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="max-w-sm mx-auto px-6 py-12">
        <p className="text-table-500 text-sm">Loading…</p>
      </main>
    );
  }

  const previewSrc = newPhotoFile ? URL.createObjectURL(newPhotoFile) : avatarUrl;

  return (
    <main className="max-w-sm mx-auto px-6 py-12">
      {!isWelcome && (
        <button
          onClick={() => router.back()}
          className="text-sm text-table-400 hover:text-table-100"
        >
          ← Back
        </button>
      )}

      {isWelcome ? (
        <div className="mt-4 mb-8">
          <h1 className="font-display text-3xl mb-1">Welcome to Table 👋</h1>
          <p className="text-sm text-table-400">
            What should your friends and family call you? You can add a photo too, or skip it
            for now.
          </p>
        </div>
      ) : (
        <h1 className="font-display text-3xl mt-4 mb-8">Your profile</h1>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm text-table-400 mb-2">Photo</label>
          <div className="flex items-center gap-4">
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc}
                alt=""
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-herb-600 flex items-center justify-center text-xl font-medium text-table-50">
                {displayName?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <label className="text-sm text-herb-400 hover:text-herb-300 cursor-pointer">
              {avatarUrl || newPhotoFile ? "Change photo" : "Add a photo"}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setNewPhotoFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>
        </div>

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
          {saving ? "Saving…" : isWelcome ? "Continue" : "Save"}
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

      {!isWelcome && (
        <button
          onClick={handleSignOut}
          className="w-full text-center text-sm text-table-500 hover:text-red-400 mt-8"
        >
          Sign out
        </button>
      )}
    </main>
  );
}
