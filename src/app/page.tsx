import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <h1 className="font-display text-3xl">Table</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/profile" className="text-table-400 hover:text-table-100">
            Profile
          </Link>
          <Link href="/friends" className="text-table-400 hover:text-table-100">
            Friends
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/recipes"
          className="rounded-lg border border-table-700 bg-table-900 p-8 text-center hover:border-herb-500 transition-colors"
        >
          <i className="ti ti-tools-kitchen-2" style={{ fontSize: 28, color: "#7c9269" }} />
          <p className="font-medium mt-3 mb-1">Recipes</p>
          <p className="text-xs text-table-500">Browse and search your friends' recipes</p>
        </Link>
        <Link
          href="/restaurants"
          className="rounded-lg border border-table-700 bg-table-900 p-8 text-center hover:border-herb-500 transition-colors"
        >
          <i className="ti ti-map-pin" style={{ fontSize: 28, color: "#7c9269" }} />
          <p className="font-medium mt-3 mb-1">Restaurants</p>
          <p className="text-xs text-table-500">See what your circle has reviewed</p>
        </Link>
      </div>
    </main>
  );
}
