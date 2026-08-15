import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  let avatarUrl: string | null = null;
  if (profile?.avatar_url) {
    const { data } = await supabase.storage
      .from("avatars")
      .createSignedUrl(profile.avatar_url, 60 * 60);
    avatarUrl = data?.signedUrl ?? null;
  }

  const firstName = profile?.display_name?.split(" ")[0] ?? "";

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-display text-3xl">Table</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/friends" className="text-table-400 hover:text-table-100">
            Friends
          </Link>
          <Link href="/profile" className="flex items-center gap-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-herb-600 flex items-center justify-center text-[11px] font-medium text-table-50">
                {firstName?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
          </Link>
        </div>
      </div>

      <p className="text-table-500 text-sm mb-1">
        {greeting()}
        {firstName ? `, ${firstName}` : ""}.
      </p>
      <p className="font-display text-xl text-table-200 mb-10">
        No feeds. No strangers. Just your circle.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/recipes"
          className="group rounded-xl border border-table-700 bg-table-900 card-surface p-8 text-center hover:border-herb-500 hover:-translate-y-0.5 transition-all duration-200"
        >
          <i
            className="ti ti-tools-kitchen-2 transition-colors duration-200"
            style={{ fontSize: 30, color: "#7c9269" }}
          />
          <p className="font-display text-lg mt-3 mb-1">Recipes</p>
          <p className="text-xs text-table-500">Browse and search your friends' recipes</p>
        </Link>
        <Link
          href="/restaurants"
          className="group rounded-xl border border-table-700 bg-table-900 card-surface p-8 text-center hover:border-herb-500 hover:-translate-y-0.5 transition-all duration-200"
        >
          <i
            className="ti ti-map-pin transition-colors duration-200"
            style={{ fontSize: 30, color: "#7c9269" }}
          />
          <p className="font-display text-lg mt-3 mb-1">Restaurants</p>
          <p className="text-xs text-table-500">See what your circle has reviewed</p>
        </Link>
      </div>
    </main>
  );
}
