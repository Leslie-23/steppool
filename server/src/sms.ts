import { config } from './config.js';

/** Arkesel SMS (Ghana). Only called when ARKESEL_API_KEY is set. */
export async function sendSms(phone: string, message: string) {
  const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
    method: 'POST',
    headers: { 'api-key': config.arkeselKey!, 'content-type': 'application/json' },
    body: JSON.stringify({ sender: config.smsSender, message, recipients: [phone.replace('+', '')] }),
  });
  if (!res.ok) throw new Error(`SMS failed: ${res.status} ${await res.text()}`);
}
