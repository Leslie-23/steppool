import { mkdirSync, copyFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SPONSOR = `<div class="card hl"><div class="row" style="margin-top:0"><span class="lbl" style="color:var(--accent)">Presented by your brand</span><span class="pill">LIVE</span></div><div class="ttl">Your Brand Walk Week</div><div class="sm" style="margin-top:6px">GH₵2,000 shared by everyone who hits their goal</div><div class="lbl" style="margin-top:18px">Prize pool</div><div class="big">GH₵2,000</div><div class="bar"><i style="width:62%"></i></div><div class="row"><span class="sm">248 walking</span><span class="sm">Ends in 3d 18:30</span></div></div>
<div class="card"><div class="lbl">How it works</div><div class="row"><span class="sm">Entry for walkers</span><b class="sm" style="color:var(--ink)">Free</b></div><div class="row"><span class="sm">Each walker's goal</span><b class="sm" style="color:var(--ink)">From their own pace</b></div><div class="row"><span class="sm">Prize sent by</span><b class="sm" style="color:var(--ink)">Mobile money</b></div></div>`;
const RESULTS = `<div class="card hl"><div class="lbl">Results · Campus Walk Week</div><div class="big">12 of 18</div><div class="sm">hit their goal and shared the pool</div><div class="bar"><i style="width:67%"></i></div></div>
<div class="card">${[['AO','Ama','58,204','+100'],['KA','Kwame','51,017','+100'],['EM','Efua','49,880','+100'],['YB','Yaw','33,910','missed']].map(([i,n,s,w])=>`<div class="row"><span style="display:flex;align-items:center;gap:10px"><span class="av">${i}</span><span class="sm" style="color:var(--ink)">${n}</span></span><span class="sm">${s}</span><span class="sm" style="color:${w==='missed'?'var(--muted)':'var(--accent)'};font-weight:700">${w}</span></div>`).join('')}</div>`;

// One design per message; each is rendered at every unique size, then filed per platform.
const POSTS = [
  { id: '01-walk-share', kicker: 'Walking challenges', h: 'Walk.<br>Hit your goal.<br><em>Share the pool.</em>', s: 'Step challenges with your class, your office or your group chat.', cta: 'Free to play', shot: '1-today', photo: 'ADDEVONMCP', pos: 'center 70%', stat: ['8,412', 'steps today'] },
  { id: '02-race-live', kicker: 'Live leaderboards', h: 'Race your friends,<br><em>live.</em>', s: 'Every overtake, felt. Your phone buzzes the moment you pass someone.', cta: 'Start a challenge', shot: '2-arena', photo: '39NOIAL9TE', pos: 'center 40%', stat: ['#2 → #1', 'you just passed Kwame'] },
  { id: '03-your-goal', kicker: 'Fair for every pace', h: 'Your goal.<br><em>Not theirs.</em>', s: 'Targets come from your own usual week, so a desk job and a marathoner both have a real shot.', cta: 'Hit your goal', shot: '6-create', photo: 'OWOYF1RPMU', pos: 'center 60%', stat: ['+15%', 'on your usual pace'] },
  { id: '04-everyone-wins', kicker: 'No single winner', h: 'Everyone who<br>makes it<br><em>wins.</em>', s: 'Hit your goal before the timer ends and you share the pool with everyone else who did.', cta: 'Join a challenge', cards: RESULTS, photo: '2USDVKPSWS', pos: 'center 55%', stat: ['+100', 'for every finisher'], accent: 'gold' },
  { id: '05-earn-credits', kicker: 'Credits for walking', h: 'Every step<br><em>counts.</em>', s: 'Hit your daily target, keep your streak, bring a friend. Earn credits to enter challenges.', cta: 'Free credits to start', shot: '4-wallet', coin: true, stat: ['+100', '7-day streak bonus'], accent: 'gold' },
  { id: '06-see-how-you-move', kicker: 'Your 30 days', h: 'See how you<br><em>really move.</em>', s: 'Trends, your peak walking hours, streaks and records. All from the steps you already take.', cta: 'Track it free', shot: '5-analytics', stat: ['6:00 pm', 'your peak hour'] },
  { id: '07-sponsor', kicker: 'For brands', h: 'Put your brand<br><em>on the move.</em>', s: 'Sponsor a public walking challenge. Everyone who hits their goal shares your prize.', cta: 'Sponsor a challenge', cards: SPONSOR, photo: 'hoodie', pos: 'center 45%', stat: ['Free entry', 'for every walker'], accent: 'gold' },
];

const SIZES = {
  '1200x627': [1200, 627], '1200x1200': [1200, 1200], '1080x1350': [1080, 1350], '1600x900': [1600, 900],
  '1080x1080': [1080, 1080], '1080x566': [1080, 566], '1080x1920': [1080, 1920],
};
const PLATFORMS = {
  linkedin: { landscape: '1200x627', square: '1200x1200', portrait: '1080x1350' },
  x: { landscape: '1600x900', square: '1200x1200', portrait: '1080x1350' },
  instagram: { portrait: '1080x1350', square: '1080x1080', landscape: '1080x566', story: '1080x1920' },
};
const layoutOf = (w, h) => (h / w > 1.6 ? 'story' : h / w > 1.1 ? 'portrait' : w / h > 1.4 ? 'land' : 'square');

const OUT = process.argv[2];
const b = await chromium.launch();
for (const [size, [w, h]] of Object.entries(SIZES)) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('file://' + process.cwd() + '/template.html');
  await p.evaluate(() => document.fonts.ready);
  const layout = layoutOf(w, h);
  mkdirSync(`${OUT}/_by-size/${size}`, { recursive: true });
  for (const post of POSTS) {
    await p.evaluate(({ post, w, h, layout }) => {
      const accent = post.accent === 'gold' ? '#E8C36A' : '#D7FF3A';
      document.body.className = layout + (post.cards ? ' has-cards' : '');
      const st = document.body.style;
      st.setProperty('--w', w + 'px'); st.setProperty('--h', h + 'px'); st.setProperty('--accent', accent);
      st.setProperty('--gx', layout === 'land' ? '80%' : '50%'); st.setProperty('--gy', layout === 'land' ? '30%' : '0%');
      const photo = document.getElementById('photo');
      photo.style.backgroundImage = post.photo ? `url(web/${post.photo}.jpg)` : 'none';
      photo.style.setProperty('--pos', post.pos ?? 'center');
      // Photos sit under a heavy dark wash so the type and the phone always win.
      const dir = layout === 'land' ? '90deg' : '180deg';
      document.getElementById('shade').style.background = post.photo
        ? `linear-gradient(${dir}, #07080Af2 0%, #07080Ad9 ${layout === 'land' ? '45%' : '38%'}, #07080A99 70%, #07080Acc 100%)`
        : 'radial-gradient(60% 50% at 50% 100%, #ffffff08, transparent)';
      document.getElementById('kicker').textContent = post.kicker;
      document.getElementById('h').innerHTML = post.h;
      document.getElementById('s').textContent = post.s;
      document.getElementById('cta').textContent = post.cta + '  →';
      document.getElementById('coin').style.display = post.coin ? 'block' : 'none';
      document.getElementById('statb').textContent = post.stat[0];
      document.getElementById('stats').textContent = post.stat[1];
      // Landscape banners are short: drop the body line and button so the headline breathes.
      const short = layout === 'land' && h / w < 0.55;
      document.getElementById('s').style.display = short ? 'none' : '';
      document.getElementById('cta').style.display = layout === 'land' && h / w < 0.6 ? 'none' : '';
      // Posts about sponsors and results use app-style cards with made-up names, not real screenshots of real brands.
      document.getElementById('phone').style.display = post.cards ? 'none' : '';
      const cards = document.getElementById('cards');
      cards.style.display = post.cards ? 'flex' : 'none';
      cards.innerHTML = post.cards ?? '';
      const img = document.getElementById('shot');
      if (post.shot) img.src = `shots/${post.shot}.png`;
      return Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
    }, { post, w, h, layout });
    await p.waitForTimeout(120);
    await p.screenshot({ path: `${OUT}/_by-size/${size}/${post.id}.png` });
  }
  await p.close();
}
await b.close();

for (const [platform, kinds] of Object.entries(PLATFORMS)) {
  for (const [kind, size] of Object.entries(kinds)) {
    const dir = `${OUT}/${platform}/${kind}-${size}`;
    mkdirSync(dir, { recursive: true });
    for (const post of POSTS) copyFileSync(`${OUT}/_by-size/${size}/${post.id}.png`, `${dir}/${post.id}.png`);
  }
}
console.log('done');
