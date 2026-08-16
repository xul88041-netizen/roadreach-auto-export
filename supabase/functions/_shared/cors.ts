const configured = (Deno.env.get("ALLOWED_ORIGINS") || "https://xul88041-netizen.github.io,http://localhost:4173,http://127.0.0.1:4173")
  .split(",").map((value) => value.trim()).filter(Boolean);

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = configured.includes(origin) ? origin : configured[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
