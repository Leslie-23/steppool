// Sends one sign-in email to MAIL_USER to verify SMTP credentials.
import { sendOtpEmail } from '../src/mailer.js';
import { config } from '../src/config.js';

await sendOtpEmail(config.mailUser!, '482913');
console.log(`sent to ${config.mailUser}`);
