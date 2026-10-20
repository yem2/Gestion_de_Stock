/** Envoi d'e-mails via Resend (facultatif) : actif seulement si RESEND_API_KEY et MAIL_FROM sont définis. */
export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(to: string, subject: string, text: string) {
  if (!mailConfigured()) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text })
    });
    return response.ok;
  } catch {
    return false;
  }
}
