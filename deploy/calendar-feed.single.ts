// 자동 생성 파일 — 수정하지 마십시오. 원본: supabase/functions/calendar-feed, supabase/functions/_shared (npm run bundle:feed)

// supabase/functions/calendar-feed/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// supabase/functions/_shared/ics.js
var pad = (n) => String(n).padStart(2, "0");
var enc = new TextEncoder();
var TZ = "Asia/Seoul";
var BS = String.fromCharCode(92);
function esc(s) {
  return String(s ?? "").replace(/\\/g, BS + BS).replace(/\r?\n/g, BS + "n").replace(/;/g, BS + ";").replace(/,/g, BS + ",");
}
function fold(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) {
      out.push(cur);
      cur = " " + ch;
      bytes = 1 + b;
      limit = 75;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  out.push(cur);
  return out.join("\r\n");
}
var ymd = (s) => String(s).slice(0, 10).replace(/-/g, "");
function addDaysStr(s, n) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.getUTCFullYear() + "-" + pad(x.getUTCMonth() + 1) + "-" + pad(x.getUTCDate());
}
function localDateTime(date, time, plusMin = 0) {
  const [y, mo, d] = date.slice(0, 10).split("-").map(Number), [h, mi] = String(time || "09:00").slice(0, 5).split(":").map(Number);
  const x = new Date(Date.UTC(y, mo - 1, d, h, mi + plusMin));
  return x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()) + "T" + pad(x.getUTCHours()) + pad(x.getUTCMinutes()) + "00";
}
var utcStamp = (d) => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
function untilUtc(date) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return utcStamp(new Date(Date.UTC(y, m - 1, d, 23 - 9, 59, 59)));
}
var seq = (iso) => iso ? Math.floor(new Date(iso).getTime() / 6e4) : 0;
var VTIMEZONE = ["BEGIN:VTIMEZONE", "TZID:" + TZ, "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:KST", "END:STANDARD", "END:VTIMEZONE"];
function apptTimes(a) {
  if (!a.visit_time) return { allDay: true, start: ymd(a.visit_date), end: ymd(addDaysStr(a.visit_date, 1)) };
  return { allDay: false, start: localDateTime(a.visit_date, a.visit_time), end: localDateTime(a.visit_date, a.visit_time, 60) };
}
function apptTitle(a, patientName) {
  return `[\uC9C4\uB8CC] ${patientName ? patientName + " \xB7 " : ""}${a.hospital}${a.department ? " " + a.department : ""}`;
}
function apptDetails(a, patientName, companionName) {
  return [patientName && `\uD658\uC790: ${patientName}`, a.department && `\uC9C4\uB8CC\uACFC: ${a.department}`, a.doctor && `\uB2F4\uB2F9 \uC758\uC0AC: ${a.doctor}`, `\uB3D9\uD589: ${companionName || "\uBBF8\uC815"}`, a.status && `\uC0C1\uD0DC: ${a.status}`, "Family Health Hub\uC5D0\uC11C \uB9CC\uB4E0 \uC77C\uC815\uC785\uB2C8\uB2E4."].filter(Boolean).join("\n");
}
function buildIcs({ calName = "Family Health Hub", patients = [], appointments = [], medications = [], options = {}, now = /* @__PURE__ */ new Date(), refreshHours = 1 }) {
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Health Hub//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc(calName),
    "X-WR-TIMEZONE:" + TZ,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H`,
    `X-PUBLISHED-TTL:PT${refreshHours}H`,
    ...VTIMEZONE
  ];
  const name = (id) => patients.find((p) => p.id === id)?.name || "";
  const stamp = utcStamp(now);
  for (const a of appointments) {
    const t = apptTimes(a), cancelled = a.status === "\uCDE8\uC18C";
    L.push("BEGIN:VEVENT", `UID:appt-${a.id}@family-health-hub`, "DTSTAMP:" + stamp);
    if (a.updated_at || a.created_at) L.push("LAST-MODIFIED:" + utcStamp(new Date(a.updated_at || a.created_at)), "SEQUENCE:" + seq(a.updated_at || a.created_at));
    L.push(
      t.allDay ? `DTSTART;VALUE=DATE:${t.start}` : `DTSTART;TZID=${TZ}:${t.start}`,
      t.allDay ? `DTEND;VALUE=DATE:${t.end}` : `DTEND;TZID=${TZ}:${t.end}`,
      "SUMMARY:" + esc(apptTitle(a, name(a.patient_id))),
      "LOCATION:" + esc(a.hospital),
      "DESCRIPTION:" + esc(apptDetails(a, name(a.patient_id), a.companion_name)),
      "STATUS:" + (cancelled ? "CANCELLED" : "CONFIRMED"),
      "TRANSP:OPAQUE"
    );
    if (!cancelled) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc("\uC9C4\uB8CC \uC77C\uC815 \uC54C\uB9BC"), "TRIGGER:-PT120M", "END:VALARM");
    L.push("END:VEVENT");
  }
  if (options.include_meds !== false) {
    for (const m of medications) {
      for (const t of m.times || []) {
        const first = (m.start_date || String(m.created_at || now.toISOString()).slice(0, 10)).slice(0, 10), p = name(m.patient_id);
        const label = options.show_med_names === false ? `[\uBCF5\uC57D] ${p ? p + " \xB7 " : ""}${t}` : `[\uBCF5\uC57D] ${p ? p + " \xB7 " : ""}${t} ${m.name}${m.dosage ? " " + m.dosage : ""}`;
        L.push("BEGIN:VEVENT", `UID:med-${m.id}-${t.replace(":", "")}@family-health-hub`, "DTSTAMP:" + stamp);
        if (m.updated_at || m.created_at) L.push("LAST-MODIFIED:" + utcStamp(new Date(m.updated_at || m.created_at)), "SEQUENCE:" + seq(m.updated_at || m.created_at));
        L.push(
          `DTSTART;TZID=${TZ}:${localDateTime(first, t)}`,
          "DURATION:PT10M",
          "RRULE:FREQ=DAILY" + (m.end_date ? ";UNTIL=" + untilUtc(m.end_date) : ""),
          "SUMMARY:" + esc(label),
          "DESCRIPTION:" + esc(`\uBCF5\uC57D \uC2DC\uAC04\uC785\uB2C8\uB2E4. \uBCF5\uC6A9 \uD655\uC778\uC740 Family Health Hub \uC571\uC5D0\uC11C \uD569\uB2C8\uB2E4.${m.instructions && options.show_med_names !== false ? "\n\uBCF5\uC6A9 \uBC29\uBC95: " + m.instructions : ""}`),
          "TRANSP:TRANSPARENT",
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "DESCRIPTION:" + esc("\uBCF5\uC57D \uC2DC\uAC04"),
          "TRIGGER:PT0M",
          "END:VALARM",
          "END:VEVENT"
        );
      }
    }
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

// supabase/functions/_shared/feed.js
var TOKEN_RE = /^[0-9a-f]{64}$/;
function tokenFromUrl(url) {
  const u = new URL(url), seg = u.pathname.split("/").filter(Boolean).pop() || "";
  return (u.searchParams.get("t") || seg).replace(/\.ics$/i, "").toLowerCase();
}
async function handleFeedRequest(req, fetchData) {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const token = tokenFromUrl(req.url);
  if (!TOKEN_RE.test(token)) return new Response("Not found", { status: 404 });
  let data = null;
  try {
    data = await fetchData(token);
  } catch {
    return new Response("Temporarily unavailable", { status: 503 });
  }
  if (!data) return new Response("Not found", { status: 404 });
  const body = buildIcs({ calName: data.calName, patients: data.patients, appointments: data.appointments, medications: data.medications, options: data.options });
  return new Response(req.method === "HEAD" ? null : body, { status: 200, headers: {
    "Content-Type": "text/calendar; charset=utf-8",
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": 'inline; filename="family-health-hub.ics"',
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer"
  } });
}

// supabase/functions/calendar-feed/index.ts
var supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
Deno.serve((req) => handleFeedRequest(req, async (token) => {
  const { data, error } = await supabase.rpc("calendar_feed_data", { p_token: token });
  if (error) throw error;
  return data;
}));
