// Netlify automatically invokes this function on the "submission-created"
// event whenever a Netlify form is submitted. It emails the submission to
// the site owner via Resend (https://resend.com).
//
// Required env var (set in Netlify → Site settings → Environment variables):
//   RESEND_API_KEY        your Resend API key (starts with "re_")
// Optional env vars:
//   CONTACT_TO_EMAIL      recipient (default: mike@shdw.com)
//   CONTACT_FROM_EMAIL    sender   (default: Resend onboarding sender)

const RESEND_ENDPOINT = "https://api.resend.com/emails";

exports.handler = async (event) => {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL || "mike@shdw.com";
  const from = process.env.CONTACT_FROM_EMAIL || "Michael de Geus Site <onboarding@resend.dev>";

  if (!apiKey) {
    console.error("RESEND_API_KEY is not set; skipping notification email.");
    return { statusCode: 200, body: "Skipped: RESEND_API_KEY not configured." };
  }

  let data = {};
  let formName = "contact";
  try {
    const body = JSON.parse(event.body || "{}");
    const payload = body.payload || {};
    data = payload.data || {};
    formName = payload.form_name || formName;
  } catch (err) {
    console.error("Could not parse submission payload:", err);
    return { statusCode: 200, body: "Skipped: unparseable payload." };
  }

  const get = (k) => (data[k] == null ? "" : String(data[k]).trim());
  const fullName = [get("first-name"), get("last-name")].filter(Boolean).join(" ") || "Unknown sender";
  const senderEmail = get("email");
  const inquiry = get("inquiry-type");

  const subject = `New inquiry from michaeldegeus.com — ${fullName}` + (inquiry ? ` (${inquiry})` : "");

  const rows = [
    ["Name", fullName],
    ["Email", senderEmail],
    ["Organization", get("organization")],
    ["Nature of inquiry", inquiry],
    ["Message", get("message")],
  ].filter(([, v]) => v);

  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nForm: ${formName}`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:560px;">
      <h2 style="margin:0 0 14px;font-size:18px;">New inquiry from michaeldegeus.com</h2>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
        ${rows.map(([k, v]) => `
          <tr>
            <td style="padding:7px 16px 7px 0;vertical-align:top;color:#777;white-space:nowrap;"><strong>${k}</strong></td>
            <td style="padding:7px 0;vertical-align:top;white-space:pre-wrap;">${escapeHtml(v)}</td>
          </tr>`).join("")}
      </table>
      <p style="margin:18px 0 0;color:#999;font-size:12px;">Submitted via the &ldquo;${escapeHtml(formName)}&rdquo; form.</p>
    </div>`;

  const emailPayload = { from, to: [to], subject, text, html };
  if (senderEmail && /^\S+@\S+\.\S+$/.test(senderEmail)) emailPayload.reply_to = senderEmail;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(emailPayload),
    });
    const respText = await res.text();
    if (!res.ok) {
      console.error("Resend API error:", res.status, respText);
      return { statusCode: 200, body: `Resend error ${res.status}` };
    }
    console.log("Notification email sent via Resend:", respText);
    return { statusCode: 200, body: "Email sent." };
  } catch (err) {
    console.error("Failed to call Resend:", err);
    return { statusCode: 200, body: "Send failed." };
  }
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
