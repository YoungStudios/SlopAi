import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const OWNER_EMAIL = "northchicagorp0@gmail.com";

export async function GET(req) {
  // Verify owner via auth header (user ID passed from frontend)
  const userId = req.headers.get("x-user-id");
  const userEmail = req.headers.get("x-user-email");

  if (!userId || userEmail?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── Real user list from profiles ──────────────────
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, is_pro, created_at")
      .order("created_at", { ascending: false });

    // ── Total video generations ───────────────────────
    const { count: totalVideos } = await supabase
      .from("video_history")
      .select("*", { count: "exact", head: true });

    // ── Videos generated this week ────────────────────
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count: videosThisWeek } = await supabase
      .from("video_history")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo.toISOString());

    // ── New signups this week ─────────────────────────
    const { count: newUsersThisWeek } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo.toISOString());

    // ── Pro users ─────────────────────────────────────
    const { count: proUsers } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_pro", true);

    // ── Recent video history (last 10) ────────────────
    const { data: recentVideos } = await supabase
      .from("video_history")
      .select("user_id, prompt, model, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    return Response.json({
      stats: {
        totalUsers: profiles?.length || 0,
        newUsersThisWeek: newUsersThisWeek || 0,
        totalVideos: totalVideos || 0,
        videosThisWeek: videosThisWeek || 0,
        proUsers: proUsers || 0,
      },
      users: profiles || [],
      recentVideos: recentVideos || []
    });

  } catch (err) {
    console.error("Admin fetch error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
