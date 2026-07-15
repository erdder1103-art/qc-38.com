/**
 * Shiqi CAPI Worker V3 - QC姐妹花專屬
 * Pixel ID: 1009089872010856
 * 功能：CompleteRegistration、Browser/CAPI 去重、健康檢查、除錯日誌
 */
const PIXEL_ID = "1009089872010856";
const EVENT_NAME = "CompleteRegistration";
const GRAPH_VERSION = "v23.0";
const WORKER_VERSION = "3.0.0";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 健康檢查：直接開啟 /health 即可確認 Worker 與 Secret 狀態
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "Shiqi CAPI Worker",
        version: WORKER_VERSION,
        pixel_id: PIXEL_ID,
        event_name: EVENT_NAME,
        token_configured: Boolean(env.META_ACCESS_TOKEN),
        time: new Date().toISOString(),
      }, 200, corsHeaders);
    }

    // 除錯資訊，不會主動送事件
    if (request.method === "GET" && url.pathname === "/debug") {
      return jsonResponse({
        ok: true,
        version: WORKER_VERSION,
        pixel_id: PIXEL_ID,
        event_name: EVENT_NAME,
        token_configured: Boolean(env.META_ACCESS_TOKEN),
        accepted_paths: ["/", "/track"],
        health_url: `${url.origin}/health`,
      }, 200, corsHeaders);
    }

    if (request.method !== "POST" || !["/", "/track"].includes(url.pathname)) {
      return jsonResponse({
        ok: false,
        error: "Method Not Allowed",
        hint: "Use POST /track or GET /health",
      }, 405, corsHeaders);
    }

    if (!env.META_ACCESS_TOKEN) {
      console.error(JSON.stringify({
        stage: "config_error",
        error: "META_ACCESS_TOKEN is not configured",
      }));
      return jsonResponse({
        ok: false,
        error: "META_ACCESS_TOKEN is not configured",
      }, 500, corsHeaders);
    }

    try {
      const body = await request.json();
      const eventId = String(body.event_id || "").trim();
      const eventSourceUrl = String(body.event_source_url || "").trim();
      const fbp = String(body.fbp || "").trim();
      const fbc = String(body.fbc || "").trim();
      const testEventCode = String(body.test_event_code || "").trim();

      if (!eventId || !eventSourceUrl) {
        return jsonResponse({
          ok: false,
          error: "event_id and event_source_url are required",
        }, 400, corsHeaders);
      }

      let parsedSourceUrl;
      try {
        parsedSourceUrl = new URL(eventSourceUrl);
      } catch {
        return jsonResponse({ ok: false, error: "Invalid event_source_url" }, 400, corsHeaders);
      }

      if (!["http:", "https:"].includes(parsedSourceUrl.protocol)) {
        return jsonResponse({ ok: false, error: "Invalid event_source_url protocol" }, 400, corsHeaders);
      }

      const clientIp = request.headers.get("CF-Connecting-IP") || "";
      const userAgent = request.headers.get("User-Agent") || "";

      const userData = {
        client_ip_address: clientIp,
        client_user_agent: userAgent,
      };
      if (fbp) userData.fbp = fbp;
      if (fbc) userData.fbc = fbc;

      const payload = {
        data: [{
          event_name: EVENT_NAME,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "website",
          event_source_url: eventSourceUrl,
          user_data: userData,
          custom_data: {
            contact_method: "line",
            click_area: String(body.click_area || "btn"),
          },
        }],
      };

      if (testEventCode) payload.test_event_code = testEventCode;

      console.log(JSON.stringify({
        stage: "received",
        version: WORKER_VERSION,
        pixel_id: PIXEL_ID,
        event_name: EVENT_NAME,
        event_id: eventId,
        has_fbp: Boolean(fbp),
        has_fbc: Boolean(fbc),
        has_ip: Boolean(clientIp),
        has_user_agent: Boolean(userAgent),
        test_mode: Boolean(testEventCode),
      }));

      const metaUrl =
        `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events` +
        `?access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`;

      const metaResponse = await fetch(metaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let metaResult;
      try {
        metaResult = await metaResponse.json();
      } catch {
        metaResult = { error: "Meta response is not valid JSON" };
      }

      console.log(JSON.stringify({
        stage: "meta_response",
        version: WORKER_VERSION,
        pixel_id: PIXEL_ID,
        event_id: eventId,
        meta_status: metaResponse.status,
        meta_ok: metaResponse.ok,
        meta_result: metaResult,
      }));

      if (!metaResponse.ok) {
        return jsonResponse({
          ok: false,
          version: WORKER_VERSION,
          pixel_id: PIXEL_ID,
          event_name: EVENT_NAME,
          event_id: eventId,
          meta_status: metaResponse.status,
          meta_error: metaResult,
        }, 502, corsHeaders);
      }

      return jsonResponse({
        ok: true,
        version: WORKER_VERSION,
        pixel_id: PIXEL_ID,
        event_name: EVENT_NAME,
        event_id: eventId,
        meta_status: metaResponse.status,
        meta: metaResult,
      }, 200, corsHeaders);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(JSON.stringify({
        stage: "worker_error",
        version: WORKER_VERSION,
        pixel_id: PIXEL_ID,
        error: message,
      }));
      return jsonResponse({
        ok: false,
        version: WORKER_VERSION,
        pixel_id: PIXEL_ID,
        error: message,
      }, 500, corsHeaders);
    }
  },
};

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json;charset=UTF-8",
    },
  });
}
