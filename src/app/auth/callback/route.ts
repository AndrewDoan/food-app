import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase magic links redirect here with a `code` query param.
// This exchanges that code for an actual signed-in session (setting
// the auth cookies), THEN redirects to the real destination. Skipping
// this step is why "click the link" was landing back on /login --
// no session was ever actually created.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/recipes";

  if (code) {
    const supabase = createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First-time sign-in: the trigger that creates a profile row
      // gives everyone the placeholder name "New Cook" until they set
      // a real one. Catch that here -- the one moment per login this
      // check runs -- and send them to set their real name before
      // dumping them into the app, so friends/family don't have to be
      // told out-of-band to go fix it later.
      if (data.user) {
        const { data: profile } = await supabase
          .from("users")
          .select("display_name")
          .eq("id", data.user.id)
          .single();
        if (profile?.display_name === "New Cook") {
          return NextResponse.redirect(`${origin}/profile?welcome=true`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("Auth code exchange failed:", error.message, error);
  } else {
    console.error("Auth callback hit with no code in the URL.");
  }

  // Something went wrong with the code -- send them back to try again.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
