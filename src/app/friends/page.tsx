"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
  users_requester?: { display_name: string };
  users_addressee?: { display_name: string };
};

export default function FriendsPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [myCode, setMyCode] = useState<string>("");
  const [codeInput, setCodeInput] = useState("");
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: profile } = await supabase
      .from("users")
      .select("invite_code")
      .eq("id", user.id)
      .single();
    if (profile) setMyCode(profile.invite_code);

    const { data: rels } = await supabase
      .from("friendships")
      .select(
        "id, requester_id, addressee_id, status, users_requester:requester_id(display_name), users_addressee:addressee_id(display_name)"
      )
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    // @ts-expect-error -- Supabase's join typing is looser than our local type
    setFriendships(rels ?? []);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function addByCode(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const { data: matchId, error: lookupError } = await supabase.rpc(
      "find_user_by_invite_code",
      { code: codeInput.trim() }
    );

    if (lookupError || !matchId) {
      setMessage("No one found with that code.");
      return;
    }
    if (matchId === userId) {
      setMessage("That's your own code.");
      return;
    }

    const { error: insertError } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: matchId,
    });

    if (insertError) {
      setMessage(
        insertError.message.includes("unique")
          ? "You've already sent a request to this person."
          : insertError.message
      );
    } else {
      setMessage("Request sent.");
      setCodeInput("");
      loadData();
    }
  }

  async function respond(id: string, status: "accepted" | "declined") {
    await supabase.from("friendships").update({ status }).eq("id", id);
    loadData();
  }

  const incoming = friendships.filter(
    (f) => f.addressee_id === userId && f.status === "pending"
  );
  const accepted = friendships.filter((f) => f.status === "accepted");
  const outgoing = friendships.filter(
    (f) => f.requester_id === userId && f.status === "pending"
  );

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <h1 className="font-display text-3xl mb-8">Friends</h1>

      <section className="mb-10 rounded-lg border border-table-700 bg-table-900 p-5">
        <p className="text-sm text-table-400 mb-1">Your invite code</p>
        <p className="font-display text-2xl tracking-wide">{myCode || "…"}</p>
        <p className="text-xs text-table-600 mt-1">
          Share this with people you actually know. There's no directory or search.
        </p>
      </section>

      <form onSubmit={addByCode} className="flex gap-2 mb-10">
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="Enter a friend's code"
          className="flex-1 rounded-md bg-table-900 border border-table-700 px-3 py-2 placeholder:text-table-600 focus:border-herb-500"
        />
        <button className="rounded-md bg-herb-600 hover:bg-herb-500 transition-colors px-4 py-2 font-medium">
          Add
        </button>
      </form>
      {message && <p className="text-sm text-table-400 -mt-6 mb-8">{message}</p>}

      {incoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-wide text-table-400 mb-3">
            Requests
          </h2>
          <ul className="space-y-2">
            {incoming.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-md bg-table-900 border border-table-700 px-4 py-3"
              >
                <span>{f.users_requester?.display_name ?? "Someone"}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => respond(f.id, "accepted")}
                    className="text-sm text-herb-400 hover:text-herb-300"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respond(f.id, "declined")}
                    className="text-sm text-table-600 hover:text-table-400"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wide text-table-400 mb-3">
          Your circle ({accepted.length})
        </h2>
        {accepted.length === 0 ? (
          <p className="text-table-600 text-sm">
            No one yet — add a friend with their invite code above.
          </p>
        ) : (
          <ul className="space-y-2">
            {accepted.map((f) => (
              <li
                key={f.id}
                className="rounded-md bg-table-900 border border-table-700 px-4 py-3"
              >
                {f.requester_id === userId
                  ? f.users_addressee?.display_name
                  : f.users_requester?.display_name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-table-400 mb-3">
            Waiting on
          </h2>
          <ul className="space-y-2">
            {outgoing.map((f) => (
              <li key={f.id} className="text-table-500 text-sm">
                {f.users_addressee?.display_name ?? "Someone"} — pending
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
