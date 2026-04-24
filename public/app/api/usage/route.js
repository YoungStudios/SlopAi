import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Monthly Pro limits
const PRO_LIMITS = {
  images: 300,
  scripts: 100,
  subtitles: 100,
  planner: 50,
  voiceover_chars: 50000,
};

// Free limits
const FREE_LIMITS = {
  images: 5,
  voiceover_chars: 150,
};

export async function POST(req) {
  try {
    const { userId, action, chars } = await req.json();
    if (!userId || !action) return Response.json({ error: "Missing params" }, { status: 400 });

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Get profile to check pro status
    const { data: profile } = await sb
      .from("profiles")
      .select("is_pro")
      .eq("id", userId)
      .single();

    const isPro = profile?.is_pro || false;

    // Get or create usage record for this month
    const { data: usage } = await sb
      .from("usage")
      .select("*")
      .eq("user_id", userId)
      .eq("month_key", monthKey)
      .single();

    const u = usage || {
      user_id: userId,
      month_key: monthKey,
      images: 0,
      scripts: 0,
      subtitles: 0,
      planner: 0,
      voiceover_chars: 0,
    };

    // Check limits
    if (action === "image") {
      const limit = isPro ? PRO_LIMITS.images : FREE_LIMITS.images;
      if (u.images >= limit) {
        return Response.json({
          allowed: false,
          reason: isPro
            ? `Monthly image limit reached (${limit}). Resets next month.`
            : `Free plan: ${limit} images/month. Upgrade to Pro for 300/month.`,
          isPro,
        });
      }
    }

    if (["script", "subtitles", "planner"].includes(action)) {
      if (!isPro) {
        return Response.json({
          allowed: false,
          reason: "This feature is Pro only. Upgrade to unlock.",
          isPro,
        });
      }
      const key = action === "script" ? "scripts" : action === "subtitles" ? "subtitles" : "planner";
      const limit = PRO_LIMITS[key === "scripts" ? "scripts" : key];
      if (u[key] >= limit) {
        return Response.json({
          allowed: false,
          reason: `Monthly ${action} limit reached (${limit}). Resets next month.`,
          isPro,
        });
      }
    }

    if (action === "voiceover") {
      const needed = chars || 0;
      const limit = isPro ? PRO_LIMITS.voiceover_chars : FREE_LIMITS.voiceover_chars;
      if (u.voiceover_chars + needed > limit) {
        return Response.json({
          allowed: false,
          reason: isPro
            ? `You've used ${u.voiceover_chars.toLocaleString()} of ${limit.toLocaleString()} chars this month.`
            : `Free plan: ${limit} chars max. Upgrade to Pro for 50,000/month.`,
          isPro,
          used: u.voiceover_chars,
          limit,
        });
      }
    }

    // Increment usage
    const updates = { ...u };
    if (action === "image") updates.images = (u.images || 0) + 1;
    if (action === "script") updates.scripts = (u.scripts || 0) + 1;
    if (action === "subtitles") updates.subtitles = (u.subtitles || 0) + 1;
    if (action === "planner") updates.planner = (u.planner || 0) + 1;
    if (action === "voiceover") updates.voiceover_chars = (u.voiceover_chars || 0) + (chars || 0);

    // Upsert
    await sb.from("usage").upsert(updates, { onConflict: "user_id,month_key" });

    return Response.json({ allowed: true, isPro, usage: updates });
  } catch (err) {
    console.error("Usage error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: profile } = await sb.from("profiles").select("is_pro").eq("id", userId).single();
  const { data: usage } = await sb.from("usage").select("*").eq("user_id", userId).eq("month_key", monthKey).single();
  const isPro = profile?.is_pro || false;

  return Response.json({
    isPro,
    usage: usage || { images: 0, scripts: 0, subtitles: 0, planner: 0, voiceover_chars: 0 },
    limits: isPro
      ? { images: 300, scripts: 100, subtitles: 100, planner: 50, voiceover_chars: 50000 }
      : { images: 5, voiceover_chars: 150 },
  });
}
