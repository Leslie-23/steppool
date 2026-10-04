// Pings the Render API every 10 minutes so the free instance never sleeps (it sleeps after 15 idle minutes).
const TARGET = 'https://steppool-api.onrender.com/health';

export default {
  async scheduled(_controller, _env, ctx) {
    ctx.waitUntil(fetch(TARGET, { headers: { 'user-agent': 'steppool-keep-warm' } }).then((r) => console.log('ping', r.status)));
  },
  // Visiting the worker URL pings too, handy for checking it works.
  async fetch() {
    const r = await fetch(TARGET);
    return new Response(`api ${r.status}\n`);
  },
};
