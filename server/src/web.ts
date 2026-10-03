import { Router } from 'express';

import { config } from './config.js';
import { Challenge } from './models.js';

const BUNDLE_ID = 'com.steppool.app';
const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Public pages: invite landing (/j/CODE) and the files iOS/Android need to verify universal links. */
export const webRouter = Router();

webRouter.get('/.well-known/apple-app-site-association', (_req, res) => {
  res.json({ applinks: { apps: [], details: [{ appIDs: [`${config.appleTeamId ?? 'TEAMID'}.${BUNDLE_ID}`], components: [{ '/': '/j/*' }] }] } });
});

webRouter.get('/.well-known/assetlinks.json', (_req, res) => {
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: BUNDLE_ID, sha256_cert_fingerprints: config.androidFingerprints },
    },
  ]);
});

// Shown only when the app isn't installed. Carries Open Graph tags so WhatsApp renders a rich preview.
webRouter.get('/j/:code', async (req, res) => {
  const code = String(req.params.code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const c = await Challenge.findOne({ inviteCode: code }, { name: 1, players: 1, entryCredits: 1, sponsor: 1 }).lean();
  const title = c ? `Join ${c.name} on StepPool` : 'StepPool';
  const desc = c
    ? c.sponsor?.name
      ? `${c.sponsor.prizeDescription} · presented by ${c.sponsor.name} · ${c.players} walking`
      : `${c.entryCredits ? `${c.entryCredits} credits entry` : 'Free entry'} · ${c.players} walking · hit your goal, share the pool`
    : 'Walk. Hit your goal. Share the pool.';
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(desc)}">
<meta name="theme-color" content="#07080A">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(80% 50% at 50% 0%,#D7FF3A22,#07080A 70%);background-color:#07080A;color:#F4F1EA;font:16px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:360px;padding:32px 24px;text-align:center}
.k{letter-spacing:.2em;font-size:12px;color:#D7FF3A;font-weight:700}
h1{font-size:34px;line-height:1.05;letter-spacing:-.03em;margin:16px 0 8px}
p{color:#8A8F98;margin:0 0 28px}
.code{font-size:28px;letter-spacing:.3em;font-weight:700;color:#E8C36A;margin-bottom:28px}
a{display:block;padding:16px;border-radius:999px;background:#D7FF3A;color:#07080A;font-weight:700;text-decoration:none;margin-bottom:12px}
a.g{background:transparent;color:#F4F1EA;border:1px solid #ffffff1a}
</style></head><body><main>
<div class="k">STEPPOOL</div><h1>${escape(c?.name ?? 'Challenge not found')}</h1><p>${escape(desc)}</p>
${c ? `<div class="code">${code}</div><a href="steppool://join/${code}">Open in StepPool</a>` : ''}
<a class="g" href="https://apps.apple.com/app/steppool">Get it on the App Store</a>
<a class="g" href="https://play.google.com/store/apps/details?id=${BUNDLE_ID}">Get it on Google Play</a>
</main></body></html>`);
});
