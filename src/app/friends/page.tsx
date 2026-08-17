"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import QRCode from "qrcode";

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
  users_requester?: { display_name: string; avatar_url: string | null };
  users_addressee?: { display_name: string; avatar_url: string | null };
};

export default function FriendsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [myCode, setMyCode] = useState<string>("");
  const [myQrDataUrl, setMyQrDataUrl] = useState<string | null>(null);
  const [showMyQr, setShowMyQr] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);
  const [codeInput, setCodeInput] = useState("");
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());
  const [avatarUrls, setAvatarUrls] = useState<Map<string, string>>(new Map());

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
        "id, requester_id, addressee_id, status, users_requester:requester_id(display_name, avatar_url), users_addressee:addressee_id(display_name, avatar_url)"
      )
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    // @ts-expect-error -- Supabase's join typing is looser than our local type
    setFriendships(rels ?? []);

    const { data: nicknameRows } = await supabase
      .from("friend_nicknames")
      .select("friend_id, nickname")
      .eq("user_id", user.id);
    setNicknames(new Map((nicknameRows ?? []).map((n) => [n.friend_id, n.nickname])));

    // Signed URLs for every friend's avatar photo, if they have one --
    // pending requests included now, since RLS allows viewing anyone
    // with any friendship row (see migration_pending_friend_visibility).
    const relsList = (rels ?? []) as Friendship[];
    const avatarPaths = new Map<string, string>();
    relsList.forEach((f) => {
      const isRequester = f.requester_id === user.id;
      const friendId = isRequester ? f.addressee_id : f.requester_id;
      const avatarPath = isRequester
        ? f.users_addressee?.avatar_url
        : f.users_requester?.avatar_url;
      if (avatarPath) avatarPaths.set(friendId, avatarPath);
    });
    const urlEntries = await Promise.all(
      [...avatarPaths.entries()].map(async ([friendId, path]) => {
        const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
        return [friendId, data?.signedUrl ?? null] as const;
      })
    );
    setAvatarUrls(
      new Map(urlEntries.filter(([, url]) => url).map(([id, url]) => [id, url as string]))
    );
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Generate the QR image client-side once we know our own code.
  useEffect(() => {
    if (!myCode) return;
    QRCode.toDataURL(myCode, { margin: 1, width: 240 })
      .then(setMyQrDataUrl)
      .catch(() => setMyQrDataUrl(null));
  }, [myCode]);

  // Start/stop the camera scanner as the `scanning` toggle changes.
  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;
    setScanError(null);

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (cancelled) return;
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 220 },
          (decodedText) => {
            setCodeInput(decodedText.trim());
            scanner.stop().catch(() => {});
            setScanning(false);
          },
          () => {
            // Fires continuously while no code is found in-frame -- not an error.
          }
        )
        .catch((err: any) => {
          setScanError(
            "Couldn't access your camera. Check that you've allowed camera permission."
          );
        });
    });

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [scanning]);

  async function addByCode(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const { data: match, error: lookupError } = await supabase
      .from("users")
      .select("id")
      .eq("invite_code", codeInput.trim())
      .single();

    if (lookupError || !match) {
      setMessage("No one found with that code.");
      return;
    }
    if (match.id === userId) {
      setMessage("That's your own code.");
      return;
    }

    const { error: insertError } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: match.id,
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
      <button
        type="button"
        onClick={() => router.back()}
        className="text-sm text-table-400 hover:text-table-100 mb-4"
      >
        ← Back
      </button>
      <h1 className="font-display text-3xl mb-8">Friends</h1>

      <section className="mb-10 rounded-lg border border-table-700 bg-table-900 card-surface p-5">
        <p className="text-sm text-table-400 mb-1">Your invite code</p>
        <p className="font-display text-2xl tracking-wide">{myCode || "…"}</p>
        <p className="text-xs text-table-600 mt-1 mb-3">
          Share this with people you actually know. There's no directory or search.
        </p>

        <button
          type="button"
          onClick={() => setShowMyQr((v) => !v)}
          className="text-xs text-herb-400 hover:text-herb-300 flex items-center gap-1"
        >
          <i className="ti ti-qrcode" style={{ fontSize: 14 }} />
          {showMyQr ? "Hide QR code" : "Show my QR code"}
        </button>

        {showMyQr && myQrDataUrl && (
          <div className="mt-3 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={myQrDataUrl}
              alt="Your invite QR code"
              className="rounded-lg bg-white p-3"
              width={200}
              height={200}
            />
          </div>
        )}
      </section>

      <div className="mb-3">
        {!scanning ? (
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="w-full rounded-md bg-table-800 hover:bg-table-700 transition-colors px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 mb-3"
          >
            <i className="ti ti-scan" style={{ fontSize: 16 }} />
            Scan a friend's QR code
          </button>
        ) : (
          <div className="mb-3">
            <div
              id="qr-reader"
              className="rounded-lg overflow-hidden border border-table-700 mb-2"
            />
            <button
              type="button"
              onClick={() => setScanning(false)}
              className="text-xs text-table-500 hover:text-table-300"
            >
              Cancel scanning
            </button>
            {scanError && <p className="text-xs text-red-400 mt-1">{scanError}</p>}
          </div>
        )}
      </div>

      <form onSubmit={addByCode} className="flex gap-2 mb-10">
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="Or enter a friend's code"
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
            {incoming.map((f) => {
              const requesterName = f.users_requester?.display_name;
              const requesterAvatar = avatarUrls.get(f.requester_id);
              return (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-md bg-table-900 border border-table-700 card-surface px-4 py-3"
                >
                  {requesterAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={requesterAvatar}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-herb-600 flex items-center justify-center text-xs font-medium text-table-50 flex-shrink-0">
                      {requesterName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <span className="flex-1">{requesterName ?? "Someone"}</span>
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
              );
            })}
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
            {accepted.map((f) => {
              const friendId = f.requester_id === userId ? f.addressee_id : f.requester_id;
              const realName =
                f.requester_id === userId
                  ? f.users_addressee?.display_name
                  : f.users_requester?.display_name;
              const nickname = nicknames.get(friendId);
              const displayLabel = nickname ?? realName;
              const avatarUrl = avatarUrls.get(friendId);

              return (
                <li key={f.id}>
                  <Link
                    href={`/people/${friendId}`}
                    className="flex items-center gap-3 rounded-md bg-table-900 border border-table-700 px-4 py-3 hover:border-table-500 transition-colors"
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt={displayLabel ?? ""}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-herb-600 flex items-center justify-center text-sm font-medium text-table-50 flex-shrink-0">
                        {displayLabel?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{displayLabel}</p>
                      {nickname && (
                        <p className="text-xs text-table-500 truncate">{realName}</p>
                      )}
                    </div>
                    <i
                      className="ti ti-chevron-right flex-shrink-0"
                      style={{ fontSize: 16, color: "#524b3d" }}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-table-400 mb-3">
            Waiting on
          </h2>
          <ul className="space-y-2">
            {outgoing.map((f) => {
              const addresseeName = f.users_addressee?.display_name;
              const addresseeAvatar = avatarUrls.get(f.addressee_id);
              return (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-md bg-table-900 border border-table-700 px-4 py-3"
                >
                  {addresseeAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={addresseeAvatar}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0 opacity-70"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-table-800 flex items-center justify-center text-xs font-medium text-table-400 flex-shrink-0">
                      {addresseeName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <span className="text-table-400 text-sm flex-1">
                    {addresseeName ?? "Someone"}
                  </span>
                  <span className="text-xs text-table-600">Pending</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
