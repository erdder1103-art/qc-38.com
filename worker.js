/**
 * QC姐妹花 專屬 Meta CAPI Worker
 * Pixel ID: 1009089872010856
 * 只接受 CompleteRegistration 事件
 */
const PIXEL_ID = "1009089872010856";
const GRAPH_VERSION = "v23.0";

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method Not Allowed" }, 405, corsHeaders);
    }

    if (!env.META_ACCESS_TOKEN) {
      return json({ ok: false, error: "META_ACCESS_TOKEN is not configured" }, 500, corsHeaders);
    }

    try {
      const body = await request.json();
      const eventId = String(body.event_id || "").trim();
      const eventSourceUrl = String(body.event_source_url || "").trim();

      if (!eventId || !eventSourceUrl) {
        return json({ ok: false, error: "event_id and event_source_url are required" }, 400, corsHeaders);
      }

      const userData = {
        client_ip_address: request.headers.get("CF-Connecting-IP") || "",
        client_user_agent: request.headers.get("User-Agent") || "",
      };
      if (body.fbp) userData.fbp = body.fbp;
      if (body.fbc) userData.fbc = body.fbc;

      const payload = {
        data: [{
          event_name: "CompleteRegistration",
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "website",
          event_source_url: eventSourceUrl,
          user_data: userData,
        }],
      };

      if (body.test_event_code) payload.test_event_code = body.test_event_code;

      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`;
      const metaResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const metaResult = await metaResponse.json();

      if (!metaResponse.ok) {
        return json({ ok: false, meta_status: metaResponse.status, meta_error: metaResult }, 502, corsHeaders);
      }

      return json({ ok: true, pixel_id: PIXEL_ID, event_name: "CompleteRegistration", event_id: eventId, meta: metaResult }, 200, corsHeaders);
    } catch (error) {
      return json({ ok: false, error: error?.message || "Unknown error" }, 500, corsHeaders);
    }
  },
};

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json;charset=UTF-8" },
  });
}
