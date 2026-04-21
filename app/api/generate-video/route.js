import { createClient } from "@supabase/supabase-js";
import { fal } from "@fal-ai/client";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // secret key, never exposed to frontend
);

fal.config({ credentials: process.env.FAL_API_KEY });

export async function POST(req) {
  try {
    const { prompt, userId, isPro } = await req.json();

    if (!prompt || !userId) {
      return Response.json({ error: "Missing prompt or user ID" }, { status: 400 });
    }

    // ── Check usage limit for free users ──────────────
    if (!isPro) {
      const now = new Date();
      const { data: usage, error: usageErr } = await supabase
        .from("video_usage")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (usageErr && usageErr.code !== "PGRST116") {
        return Response.json({ error: "Usage check failed" }, { status: 500 });
      }

      if (usage) {
        const resetDate = new Date(usage.reset_date);
        const count = now > resetDate ? 0 : usage.count;

        if (count >= 2) {
          return Response.json({
            error: "FREE_LIMIT",
            message: "You've used your 2 free videos this month. Upgrade to Pro for unlimited videos!"
          }, { status: 403 });
        }

        // Update count
        const newCount = now > resetDate ? 1 : count + 1;
        const newReset = now > resetDate
          ? new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
          : usage.reset_date;

        await supabase.from("video_usage").update({
          count: newCount,
          reset_date: newReset
        }).eq("user_id", userId);

      } else {
        // First time — create record
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        await supabase.from("video_usage").insert({
          user_id: userId,
          count: 1,
          reset_date: nextMonth.toISOString()
        });
      }
    }

    // ── Generate video via Fal.ai ─────────────────────
    // Pro users get the stronger Kling 1.6 Pro model
    // Free users get Kling 1.5 standard
    const model = isPro
      ? "fal-ai/kling-video/v1.6/pro/text-to-video"
      : "fal-ai/kling-video/v1.5/standard/text-to-video";

    const result = await fal.subscribe(model, {
      input: {
        prompt,
        duration: isPro ? "10" : "5",
        aspect_ratio: "16:9",
        negative_prompt: "blur, distortion, watermark, text overlay, low quality, artifacts, shaky, overexposed"
      }
    });

    const videoUrl = result.data?.video?.url;
    if (!videoUrl) {
      return Response.json({ error: "Video generation failed" }, { status: 500 });
    }

    // ── Save to Supabase history ──────────────────────
    await supabase.from("video_history").insert({
      user_id: userId,
      prompt,
      video_url: videoUrl,
      model: isPro ? "Kling Pro 1.6" : "Kling Standard 1.5",
      is_pro: isPro,
      created_at: new Date().toISOString()
    });

    return Response.json({ videoUrl, model: isPro ? "Kling Pro 1.6" : "Kling Standard 1.5" });

  } catch (err) {
    console.error("Video generation error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
