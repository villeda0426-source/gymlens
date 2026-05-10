// Polyfill WebSocket for Node < 21. Must be imported before any Supabase client
// is created, because @supabase/realtime-js checks globalThis.WebSocket at
// module-load time when createClient() is called in each route file.
if (typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = require("ws");
}
