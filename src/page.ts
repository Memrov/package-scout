// The homepage: a live search box, the proof, and how to hand Scout to an agent.
// One self-contained document: no external scripts, styles, fonts or images.
// It is a plain template literal, so it must stay free of backslashes, backticks and
// interpolation; a test enforces that. (A String.raw tag makes the bundler emit the page twice.)
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="Before your AI agent writes custom code, Package Scout checks whether npm, or the platform itself, already has it. No AI inside.">
<title>Package Scout: don't build it, scout it</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='10' fill='%232e7d4f'/%3E%3Ccircle cx='13.5' cy='22' r='7' fill='%23fffdf6'/%3E%3Ccircle cx='26.5' cy='22' r='7' fill='%23fffdf6'/%3E%3Ccircle cx='15' cy='24.5' r='2.4' fill='%231c2620'/%3E%3Ccircle cx='28' cy='24.5' r='2.4' fill='%231c2620'/%3E%3Cpath d='M6.5 22a7 7 0 0 1 14 0zM19.5 22a7 7 0 0 1 14 0z' fill='%231c2620'/%3E%3C/svg%3E">
<style>
:root{
  color-scheme:light;
  --paper:#f7f2e3;--card:#fffdf6;--code:#efe8d3;--ink:#1c2620;--ink-2:#47524a;--muted:#616a63;--line:#e2d9c2;
  --green:#2e7d4f;--green-text:#1f6a40;--on-green:#ffffff;--track:#cfe6d6;--wash:#e6f1e6;--orange-text:#a8431a;--orange-wash:#fbe9dc;
  --hat:#c79a5b;--hat-dark:#a97c3f;--scout-body:#26332c;--scout-lid:#3f5247;--scout-lens:#fbf6e6;--scout-pupil:#1c2620;--pin:#f2c14e;
  --serif:ui-serif,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root{
  color-scheme:dark;
  --paper:#101713;--card:#18211c;--code:#0c120f;--ink:#ece7d8;--ink-2:#bcc3b8;--muted:#8f998e;--line:#2b372f;
  --green:#33a36c;--green-text:#6fd09c;--on-green:#0c120f;--track:#1f3a2c;--wash:#16261d;--orange-text:#f29a66;--orange-wash:#2b1d14;
  --hat:#c79a5b;--hat-dark:#9a7038;--scout-body:#3d5246;--scout-lid:#58735f;--scout-lens:#fbf6e6;--scout-pupil:#101713;
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{animation:none!important;transition:none!important}}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 var(--sans);font-synthesis:none}
a{color:var(--green-text);text-underline-offset:3px}
a:hover{text-decoration-thickness:2px}
code,pre,kbd{font-family:var(--mono);font-size:.875em}
code{background:var(--code);border-radius:5px;padding:.1em .35em;overflow-wrap:anywhere}
pre{margin:0;background:var(--code);border-radius:10px;padding:14px 16px;overflow-x:auto;line-height:1.55}
pre code{background:none;padding:0;overflow-wrap:normal}
h1,h2,h3{font-family:var(--serif);line-height:1.12;letter-spacing:-.01em;margin:0;text-wrap:balance}
p{margin:0}
:focus-visible{outline:3px solid var(--green);outline-offset:3px;border-radius:6px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.skip{position:absolute;left:16px;top:-60px;background:var(--card);padding:10px 14px;border-radius:8px;z-index:5}
.skip:focus{top:12px}
.wrap{max-width:1040px;margin:0 auto;padding:0 24px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:20px;padding-bottom:8px}
.brand{display:flex;align-items:center;gap:10px;font:700 19px/1 var(--serif);color:var(--ink);text-decoration:none}
.brand svg{width:40px;height:40px}
.nav{display:flex;gap:20px;flex-wrap:wrap;font-size:14px}
.nav a{color:var(--ink-2);text-decoration:none}
.nav a:hover{color:var(--ink);text-decoration:underline}
.eyebrow{font:600 12px/1.4 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--green-text)}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:24px 40px;align-items:center;padding-top:44px}
.hero h1{font-size:clamp(44px,8.4vw,88px);margin:14px 0 20px}
.lede{font-size:clamp(17px,2.1vw,20px);color:var(--ink-2);max-width:620px}
.mascot{position:relative;justify-self:end}
.mascot svg{width:190px;height:190px;display:block}
.stamp{position:absolute;right:0;bottom:-6px;transform:rotate(-8deg);border:2px solid var(--orange-text);color:var(--orange-text);background:var(--paper);font:700 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;padding:7px 9px;border-radius:6px;white-space:nowrap}
.ask{grid-column:1/-1;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;margin-top:10px;box-shadow:0 1px 0 var(--line)}
.ask>label{display:block;font:700 20px/1.3 var(--serif);margin-bottom:12px}
.ask-row{display:flex;gap:10px}
.ask input[type=search]{flex:1;min-width:0;font:17px/1.2 var(--mono);color:var(--ink);background:var(--paper);border:2px solid var(--line);border-radius:12px;padding:14px 16px;appearance:none}
.ask input[type=search]::placeholder{color:var(--muted)}
.ask input[type=search]:focus{outline:none;border-color:var(--green)}
button{font:inherit;cursor:pointer}
.go{font-weight:700;font-size:17px;color:var(--on-green);background:var(--green);border:0;border-radius:12px;padding:0 24px;white-space:nowrap}
.go:hover{filter:brightness(1.08)}
.go[disabled]{opacity:.6;cursor:progress}
.where{border:0;margin:14px 0 0;padding:0;display:flex;gap:6px 18px;flex-wrap:wrap;font-size:14px;color:var(--ink-2)}
.where label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.where input{accent-color:var(--green);width:16px;height:16px;margin:0}
.holes{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--line);font-size:14px;color:var(--ink-2)}
.chip{font-size:14px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:6px 13px}
.chip:hover{border-color:var(--green);color:var(--green-text)}
.hint{margin-top:14px;font-size:13px;color:var(--muted)}
.out{grid-column:1/-1;display:grid;gap:14px;min-height:0}
.out:empty{display:none}
.verdict{display:flex;gap:16px;align-items:flex-start;background:var(--wash);border:1px solid var(--line);border-radius:16px;padding:18px 20px}
.verdict svg{width:52px;height:52px;flex:none}
.label{font:600 11px/1.4 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin-bottom:4px}
.verdict-text{font:600 clamp(18px,2.4vw,22px)/1.35 var(--serif)}
.thinking .verdict-text{color:var(--ink-2);font-weight:400;font-style:italic}
.oops{background:var(--orange-wash)}
.oops .label{color:var(--orange-text)}
.builtin{background:var(--card);border:2px solid var(--green);border-radius:16px;padding:18px 20px;display:grid;gap:10px}
.builtin h3{font:700 clamp(16px,4.4vw,20px)/1.3 var(--mono);overflow-wrap:anywhere}
.facts{display:grid;gap:6px;font-size:14.5px;color:var(--ink-2);margin:0;padding:0;list-style:none}
.facts b{color:var(--ink)}
.note{font-style:italic;color:var(--ink-2)}
.subhead{font:600 12px/1.4 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:6px}
.picks{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr))}
.pick{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:10px;min-width:0}
.pick h3{font:700 18px/1.3 var(--mono);overflow-wrap:anywhere}
.pick h3 a{color:var(--ink)}
.pick h3 span{color:var(--muted);font-weight:400;font-size:14px}
.pick .desc{font-size:14.5px;color:var(--ink-2);overflow-wrap:anywhere}
.stats{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none;font-size:13px}
.stats li{background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:3px 10px;color:var(--ink-2)}
.stats b{color:var(--ink)}
.cmd{display:flex;gap:8px;align-items:stretch;margin-top:auto;min-width:0}
.cmd code{flex:1;min-width:0;padding:9px 12px;border-radius:9px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}
.copy{font-size:13px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:8px 12px;white-space:nowrap;align-self:flex-start}
.copy:hover{border-color:var(--green)}
.cautions{margin:0;padding:10px 12px 10px 28px;border-radius:10px;background:var(--orange-wash);color:var(--orange-text);font-size:13.5px}
.foot{font-size:13px;color:var(--muted)}
section{padding-top:84px}
section>h2{font-size:clamp(30px,4.6vw,46px);margin:10px 0 14px}
.sub{color:var(--ink-2);max-width:680px;font-size:17px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px;margin-top:28px}
.step{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px}
.step .n{font:600 12px/1 var(--mono);letter-spacing:.14em;color:var(--muted)}
.step h3{font-size:26px;margin:12px 0 4px}
.step .tool{font-size:13px;color:var(--green-text)}
.step p:last-child{margin-top:10px;color:var(--ink-2);font-size:15px}
.meters{margin-top:28px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:8px 22px 14px;position:relative}
.meters [role=row]{display:grid;grid-template-columns:minmax(0,1.5fr) 118px minmax(120px,1.3fr) 76px;gap:6px 18px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.meters [role=rowgroup]:first-of-type [role=row]:first-child{border-top:0}
.meters .head{font:600 11px/1.4 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:12px 0 6px}
.meters .group{font:600 12px/1.4 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);padding:16px 0 2px}
.meters .name{font-weight:600}
.meters .name small{display:block;font-weight:400;font-size:13px;color:var(--muted)}
.meters .num{font-variant-numeric:tabular-nums;text-align:right;color:var(--ink-2);font-size:14.5px}
.meters .score{font-weight:700;color:var(--ink)}
.meter{display:block;height:12px;background:var(--track);border-radius:0 4px 4px 0}
.meter i{display:block;height:100%;background:var(--green);border-radius:0 4px 4px 0}
.meters .entry{cursor:default}
.meters .head .num{font-size:inherit;color:inherit}
.meters .entry:hover .meter i,.meters .entry:focus-visible .meter i{filter:brightness(1.18)}
.tip{position:absolute;z-index:3;max-width:300px;background:var(--ink);color:var(--paper);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.45;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.2)}
.tip[hidden]{display:none}
.tip strong{display:block;font-size:15px}
.aside{margin-top:18px;padding:16px 18px;border-left:4px solid var(--orange-text);background:var(--orange-wash);border-radius:0 12px 12px 0;color:var(--ink);max-width:760px}
.more{margin-top:16px}
.bar{margin:26px 0 0;padding:0;list-style:none;display:grid;gap:10px;counter-reset:bar;max-width:760px}
.bar li{counter-increment:bar;display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.bar li::before{content:counter(bar);font:700 15px/26px var(--mono);width:26px;height:26px;border-radius:50%;background:var(--green);color:var(--on-green);text-align:center}
.bar b{display:block}
.bar span{color:var(--ink-2);font-size:15px}
.fine{margin-top:14px;font-size:14px;color:var(--muted);max-width:760px}
.ways{display:grid;gap:14px;margin-top:28px}
.way{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;min-width:0}
.way h3{font-size:21px}
.way p{color:var(--ink-2);font-size:15px}
.way .cmd code,.way pre{font-size:13px}
.faq{display:grid;gap:10px;margin-top:26px;max-width:800px}
.faq details{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:0 18px}
.faq summary{cursor:pointer;font:700 18px/1.35 var(--serif);padding:15px 0;list-style-position:outside;margin-left:18px}
.faq details p{padding:0 0 16px;color:var(--ink-2)}
footer{margin-top:96px;border-top:1px solid var(--line);padding:26px 0 56px;font-size:13.5px;color:var(--muted)}
footer .wrap{display:flex;gap:16px 28px;justify-content:space-between;flex-wrap:wrap}
footer p{max-width:640px}
footer nav{display:flex;gap:16px;flex-wrap:wrap}
@media (max-width:720px){
  .nav a:not(.keep){display:none}
  .hero{grid-template-columns:1fr;padding-top:26px}
  .mascot{grid-row:1;justify-self:start}
  .mascot svg{width:112px;height:112px}
  .stamp{left:calc(100% + 14px);right:auto;bottom:26px}
  .ask{padding:16px}
  .ask-row{flex-direction:column}
  .go{padding:14px}
  section{padding-top:64px}
  .meters{padding:4px 16px 10px}
  .meters .head{display:none}
  .meters [role=row]{grid-template-columns:minmax(0,1fr) 72px}
  .meters .name{grid-column:1/-1}
  .meters .lines{display:none}
  .meters .name small::after{content:" · " attr(data-lines)}
}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="scout" viewBox="0 0 120 120">
    <rect x="24" y="54" width="32" height="46" rx="13" fill="var(--scout-body)"/>
    <rect x="64" y="54" width="32" height="46" rx="13" fill="var(--scout-body)"/>
    <rect x="50" y="63" width="20" height="13" rx="5" fill="var(--scout-lid)"/>
    <circle cx="40" cy="81" r="12.5" fill="var(--scout-lens)"/>
    <circle cx="80" cy="81" r="12.5" fill="var(--scout-lens)"/>
    <circle cx="43.5" cy="85" r="4.8" fill="var(--scout-pupil)"/>
    <circle cx="83.5" cy="85" r="4.8" fill="var(--scout-pupil)"/>
    <path d="M27.5 81a12.5 12.5 0 0 1 25 0zM67.5 81a12.5 12.5 0 0 1 25 0z" fill="var(--scout-lid)"/>
    <ellipse cx="60" cy="47" rx="53" ry="10" fill="var(--hat-dark)"/>
    <path d="M35 46C35 22 45 11 60 11s25 11 25 35c-8 4-42 4-50 0z" fill="var(--hat)"/>
    <path d="M35.4 37c8 4 41 4 49.2 0l.4 9c-8 4-42 4-50 0z" fill="var(--green)"/>
    <circle cx="60" cy="43.5" r="3.4" fill="var(--pin)"/>
  </symbol>
</svg>
<a class="skip" href="#q">Skip to the search box</a>
<header class="wrap top">
  <a class="brand" href="/"><svg aria-hidden="true"><use href="#scout"/></svg>Package Scout</a>
  <nav class="nav" aria-label="Sections">
    <a href="#how">How it works</a>
    <a href="#challenge">The CSV challenge</a>
    <a href="#connect">Connect your agent</a>
    <a href="#faq">FAQ</a>
    <a class="keep" href="https://github.com/Memrov/package-scout" rel="noreferrer">GitHub</a>
  </nav>
</header>
<main class="wrap">
  <div class="hero">
    <div>
      <p class="eyebrow">A lazy developer for your AI agent</p>
      <h1>Don't build it.<br>Scout it.</h1>
      <p class="lede">Your AI agent loves writing code. Scout would rather not. Say what you were about to build, and Scout checks whether npm, or the platform itself, already has it.</p>
    </div>
    <div class="mascot">
      <svg role="img" aria-label="Scout: a pair of half-asleep binoculars in a ranger hat"><use href="#scout"/></svg>
      <span class="stamp">No AI inside</span>
    </div>
    <form class="ask" id="ask" action="/" method="get">
      <label for="q">What were you about to build?</label>
      <div class="ask-row">
        <input id="q" name="q" type="search" placeholder="csv parser" maxlength="64" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" required>
        <button class="go" id="go" type="submit">Scout it</button>
      </div>
      <fieldset class="where">
        <legend class="sr">Where will it run?</legend>
        <label><input type="radio" name="runtime" value="any" checked> Anywhere</label>
        <label><input type="radio" name="runtime" value="browser"> In the browser</label>
        <label><input type="radio" name="runtime" value="node"> On Node</label>
      </fieldset>
      <div class="holes">
        <span>Or pick a rabbit hole:</span>
        <button type="button" class="chip" data-q="csv parser" data-runtime="browser" data-keywords='["csv parser"]'>CSV parsing</button>
        <button type="button" class="chip" data-q="markdown parser" data-runtime="any" data-keywords='["markdown parser"]'>Markdown</button>
        <button type="button" class="chip" data-q="drag and drop" data-runtime="browser" data-keywords='["drag and drop"]'>Drag and drop</button>
        <button type="button" class="chip" data-q="date picker" data-runtime="browser" data-keywords='["date picker"]'>Date picker</button>
        <button type="button" class="chip" data-q="pdf generate" data-runtime="any" data-keywords='["pdf","generate"]'>PDFs</button>
        <button type="button" class="chip" data-q="fuzzy search" data-runtime="any" data-keywords='["fuzzy search"]'>Fuzzy search</button>
        <button type="button" class="chip" data-q="retry backoff" data-runtime="any" data-keywords='["retry","backoff"]'>Retries</button>
        <button type="button" class="chip" data-q="yaml parser" data-runtime="any" data-keywords='["yaml","parser"]'>YAML</button>
        <button type="button" class="chip" data-q="left pad" data-runtime="any" data-keywords='["left pad"]'>Left pad</button>
        <button type="button" class="chip" data-q="is odd" data-runtime="any" data-keywords='["is odd"]'>Is it odd?</button>
      </div>
      <p class="hint">Live lookups against npm and deps.dev. It takes about five seconds, because Scout is checking, not guessing.</p>
    </form>
    <div class="out" id="out" aria-live="polite"></div>
  </div>

  <section id="how">
    <p class="eyebrow">How it works</p>
    <h2>Find it. Check it. Prove it.</h2>
    <p class="sub">Three steps, in the order a careful engineer would do them, minus the part where anyone writes a parser.</p>
    <div class="steps">
      <div class="step"><p class="n">01</p><h3>Find it</h3><p class="tool"><code>search_packages</code></p><p>Up to three real packages and a one-line verdict. When the platform already does the job, Scout says so and tells you to install nothing.</p></div>
      <div class="step"><p class="n">02</p><h3>Check it</h3><p class="tool"><code>get_package_details</code></p><p>License, weekly downloads, dependencies, known advisories, release date and the README, each with a link to where it came from.</p></div>
      <div class="step"><p class="n">03</p><h3>Prove it</h3><p class="tool">The evaluation Action</p><p>Your agent writes a test. A throwaway container runs it against the exact version. You keep the logs, pass or fail.</p></div>
    </div>
  </section>

  <section id="challenge">
    <p class="eyebrow">The CSV challenge</p>
    <h2>Looks like ten lines. It's ten years of bug reports.</h2>
    <p class="sub">We ran ten small, legal CSV files through three hand-rolled parsers and the three packages Scout ranks first. Files parsed correctly, out of ten:</p>
    <div class="meters" id="meters" role="table" aria-label="Files parsed correctly out of ten, by parser">
      <div role="rowgroup">
        <div class="head" role="row"><span role="columnheader">Parser</span><span role="columnheader" class="num">Lines you own</span><span role="columnheader">Files parsed correctly</span><span role="columnheader" class="num">Score</span></div>
      </div>
      <div role="rowgroup" aria-label="Hand-rolled">
        <div class="group" aria-hidden="true">Hand-rolled</div>
        <div class="entry" role="row" tabindex="0" data-entrant="split" data-lines="5" data-passed="6" data-wrong="commas in quotes, doubled quotes, line breaks in a field, Windows line endings">
          <span role="cell" class="name">The quick way: <code>split(",")</code><small data-lines="5 lines">Trips on quoted commas, doubled quotes, line breaks in a field and Windows line endings.</small></span>
          <span role="cell" class="num lines">5</span>
          <span role="cell"><span class="meter"><i style="width:60%"></i></span></span>
          <span role="cell" class="num score">6 of 10</span>
        </div>
        <div class="entry" role="row" tabindex="0" data-entrant="regex" data-lines="7" data-passed="9" data-wrong="line breaks in a field">
          <span role="cell" class="name">The clever way: a regex<small data-lines="7 lines">Trips on a line break inside a field.</small></span>
          <span role="cell" class="num lines">7</span>
          <span role="cell"><span class="meter"><i style="width:90%"></i></span></span>
          <span role="cell" class="num score">9 of 10</span>
        </div>
        <div class="entry" role="row" tabindex="0" data-entrant="state-machine" data-lines="35" data-passed="10" data-wrong="">
          <span role="cell" class="name">The careful way: a state machine<small data-lines="35 lines">Gets everything right. Now it is your parser, forever.</small></span>
          <span role="cell" class="num lines">35</span>
          <span role="cell"><span class="meter"><i style="width:100%"></i></span></span>
          <span role="cell" class="num score">10 of 10</span>
        </div>
      </div>
      <div role="rowgroup" aria-label="What Scout picked">
        <div class="group" aria-hidden="true">What Scout picked</div>
        <div class="entry" role="row" tabindex="0" data-entrant="papaparse" data-lines="2" data-passed="10" data-wrong="">
          <span role="cell" class="name"><code>papaparse</code><small data-lines="2 lines">Scout's pick for a CSV parser in the browser.</small></span>
          <span role="cell" class="num lines">2</span>
          <span role="cell"><span class="meter"><i style="width:100%"></i></span></span>
          <span role="cell" class="num score">10 of 10</span>
        </div>
        <div class="entry" role="row" tabindex="0" data-entrant="csv-parse" data-lines="2" data-passed="10" data-wrong="">
          <span role="cell" class="name"><code>csv-parse</code><small data-lines="2 lines">Scout's pick for CSV on Node.</small></span>
          <span role="cell" class="num lines">2</span>
          <span role="cell"><span class="meter"><i style="width:100%"></i></span></span>
          <span role="cell" class="num score">10 of 10</span>
        </div>
        <div class="entry" role="row" tabindex="0" data-entrant="fast-csv" data-lines="8" data-passed="10" data-wrong="">
          <span role="cell" class="name"><code>fast-csv</code><small data-lines="8 lines">Scout's pick for a CSV parser on Node.</small></span>
          <span role="cell" class="num lines">8</span>
          <span role="cell"><span class="meter"><i style="width:100%"></i></span></span>
          <span role="cell" class="num score">10 of 10</span>
        </div>
      </div>
      <div class="tip" id="tip" role="presentation" hidden></div>
    </div>
    <p class="aside">Neither hand-rolled parser throws an error. The quick one files Jane Smith's email under a column named <code>undefined</code>. The clever one turns two customers into three.</p>
    <p class="more"><a href="https://github.com/Memrov/package-scout/tree/main/challenges/csv" rel="noreferrer">See the ten files, or bring your agent's parser</a> · <a href="https://github.com/Memrov/package-scout/actions/runs/44022644522" rel="noreferrer">Passing GitHub Actions run</a></p>
  </section>

  <section id="bar">
    <p class="eyebrow">Scout's bar</p>
    <h2>Five things every pick has to clear.</h2>
    <p class="sub">Scout is lazy about writing code. It is not lazy about what goes into yours.</p>
    <ol class="bar">
      <li><div><b>It exists.</b><span>Scout reads the live registry, so there are no invented package names.</span></div></li>
      <li><div><b>It has a license it can name.</b><span>Unlicensed and unidentified packages are left out.</span></div></li>
      <li><div><b>It is not deprecated, and not a prerelease.</b><span>Unless you ask for those.</span></div></li>
      <li><div><b>It has no known advisories of its own.</b><span>Checked against deps.dev for the exact version.</span></div></li>
      <li><div><b>At least 1,000 downloads a week.</b><span>Ask for niche packages and this one goes away. The other four stay.</span></div></li>
    </ol>
    <p class="fine">Advisories in a package's dependencies are not checked, and a metadata match is not a test. Scout says both in every answer.</p>
  </section>

  <section id="connect">
    <p class="eyebrow">Connect your agent</p>
    <h2>Give Scout to your agent.</h2>
    <p class="sub">Scout is an MCP server with two tools. It makes no model calls and needs no API keys.</p>
    <div class="ways">
      <div class="way">
        <h3>Claude Code</h3>
        <div class="cmd"><code id="cmd-claude">claude mcp add --transport http package-scout <span class="origin"></span>/mcp</code><button type="button" class="copy" data-copy="cmd-claude">Copy</button></div>
      </div>
      <div class="way">
        <h3>Any MCP client</h3>
        <p>Point it at this endpoint. It speaks MCP over plain HTTP.</p>
        <div class="cmd"><code id="cmd-url"><span class="origin"></span>/mcp</code><button type="button" class="copy" data-copy="cmd-url">Copy</button></div>
      </div>
      <div class="way">
        <h3>No agent handy</h3>
        <p>The same search is one HTTP request.</p>
        <div class="cmd"><code id="cmd-curl">curl -s <span class="origin"></span>/v1/search -H 'content-type: application/json' -d '{"keywords":["csv parser"],"runtime":"browser"}'</code><button type="button" class="copy" data-copy="cmd-curl">Copy</button></div>
      </div>
    </div>
  </section>

  <section id="faq">
    <p class="eyebrow">FAQ</p>
    <h2>Questions Scout gets.</h2>
    <div class="faq">
      <details><summary>Does Scout use AI?</summary><p>No. It looks things up. There are no model calls, no API keys and no inference bill. Your agent brings the intelligence; Scout brings the facts.</p></details>
      <details><summary>Will it bloat my node_modules?</summary><p>Scout installs nothing. It returns up to three options, says how many dependencies each one brings, and tells you when the platform already does the job. A package is for a rabbit hole, never for a few lines.</p></details>
      <details><summary>Why only three results?</summary><p>You weren't going to read ten.</p></details>
      <details><summary>Where's the score out of 100?</summary><p>We had one. It was made up, so we deleted it. Now you get the facts it was made from.</p></details>
      <details><summary>Can I trust the pick?</summary><p>Trust the facts, then check. Scout matches metadata and tells you what it did not verify. When it is unsure, the verdict says so. For anything that matters, have your agent prove it.</p></details>
      <details><summary>What if no package exists?</summary><p>Then you get to write code. Scout is sorry for your loss.</p></details>
      <details><summary>Does it work beyond npm?</summary><p>Not yet. npm today.</p></details>
      <details><summary>Is this accordion a package?</summary><p>It is a <code>&lt;details&gt;</code> element. Scout did not install anything.</p></details>
    </div>
  </section>
</main>
<footer>
  <div class="wrap">
    <p>Evidence comes from npm and deps.dev (CC BY 4.0). Scout matches metadata. It does not install or run a package unless you ask it to prove one. Every answer is dated.</p>
    <nav aria-label="Elsewhere">
      <a href="/health">Service status</a>
      <a href="https://github.com/Memrov/package-scout" rel="noreferrer">GitHub</a>
      <a href="https://docs.deps.dev/api/v3alpha/" rel="noreferrer">Data reference</a>
    </nav>
  </div>
</footer>
<script>
(function () {
  'use strict';
  var form = document.getElementById('ask');
  var input = document.getElementById('q');
  var go = document.getElementById('go');
  var out = document.getElementById('out');
  var SVG = 'http://www.w3.org/2000/svg';
  // Words that carry no meaning for a registry search.
  var STOP = { a: 1, an: 1, the: 1, to: 1, 'for': 1, 'in': 1, of: 1, 'with': 1, and: 1, or: 1, on: 1, from: 1, my: 1, i: 1, me: 1, need: 1, want: 1, how: 1, 'do': 1, please: 1, some: 1, library: 1, 'package': 1, npm: 1, javascript: 1, js: 1 };
  var QUIPS = ['Checking whether someone already wrote it…', 'Asking npm nicely…', 'Reading licenses so you do not have to…', 'Looking for known advisories…', 'Counting downloads. There are a lot of downloads…', 'Still faster than writing it yourself…'];
  var chosen = null;
  var latest = 0;
  var ticker = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function scout() {
    var svg = document.createElementNS(SVG, 'svg');
    var use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', '#scout');
    svg.setAttribute('aria-hidden', 'true');
    svg.appendChild(use);
    return svg;
  }
  function count(value) {
    var units = [['B', 1e9], ['M', 1e6], ['K', 1e3]];
    for (var i = 0; i < units.length; i++) {
      if (value < units[i][1]) continue;
      var scaled = value / units[i][1];
      var text = scaled >= 99.95 ? String(Math.round(scaled)) : scaled.toFixed(1).replace(/[.]0$/, '');
      return text === '1000' && units[i][0] !== 'B' ? '1' + (units[i][0] === 'K' ? 'M' : 'B') : text + units[i][0];
    }
    return String(Math.round(value));
  }
  function runtime() {
    var picked = form.querySelector('input[name=runtime]:checked');
    return picked ? picked.value : 'any';
  }
  // Typed text becomes separate soft keywords: forgiving about word order, strict about nothing.
  function keywordsFrom(text) {
    var words = text.toLowerCase().split(/[^a-z0-9.+#-]+/).filter(function (word) { return word && !STOP[word]; });
    var kept = [];
    var length = 0;
    for (var i = 0; i < words.length && kept.length < 6; i++) {
      var word = words[i].slice(0, 32);
      if (kept.indexOf(word) !== -1 || length + word.length + (kept.length ? 1 : 0) > 64) continue;
      kept.push(word);
      length += word.length + (kept.length > 1 ? 1 : 0);
    }
    return kept;
  }
  function says(label, text, extra) {
    var card = el('div', 'verdict' + (extra ? ' ' + extra : ''));
    var body = el('div');
    card.appendChild(scout());
    body.appendChild(el('p', 'label', label));
    body.appendChild(el('p', 'verdict-text', text));
    card.appendChild(body);
    return card;
  }
  function safeLink(url, text, hosts) {
    for (var i = 0; i < hosts.length; i++) {
      if (typeof url === 'string' && url.indexOf(hosts[i]) === 0) {
        var link = el('a', '', text);
        link.href = url;
        link.rel = 'noreferrer';
        return link;
      }
    }
    return null;
  }
  function fact(list, label, value) {
    if (!value) return;
    var item = el('li');
    item.appendChild(el('b', '', label + ' '));
    item.appendChild(document.createTextNode(value));
    list.appendChild(item);
  }
  function copyButton(text) {
    var button = el('button', 'copy', 'Copy');
    button.type = 'button';
    button.addEventListener('click', function () { copy(text, button); });
    return button;
  }
  function copy(text, button) {
    var done = function (label) { button.textContent = label; setTimeout(function () { button.textContent = 'Copy'; }, 1600); };
    if (!navigator.clipboard) return done('Select it');
    navigator.clipboard.writeText(text).then(function () { done('Copied'); }, function () { done('Select it'); });
  }
  function builtin(platform) {
    var card = el('div', 'builtin');
    var only = platform.runtimes && platform.runtimes.length === 1 ? (platform.runtimes[0] === 'node' ? ' Node only.' : ' Browsers only.') : '';
    card.appendChild(el('p', 'label', 'Built in. Install nothing.' + only));
    card.appendChild(el('h3', '', platform.builtin));
    var pre = el('pre');
    pre.appendChild(el('code', '', platform.example));
    card.appendChild(pre);
    var facts = el('ul', 'facts');
    fact(facts, 'Needs', platform.needs);
    fact(facts, 'Limits', platform.limits);
    if (facts.children.length) card.appendChild(facts);
    if (platform.note) card.appendChild(el('p', 'note', platform.note));
    var docs = safeLink(platform.docs, 'Read the docs', ['https://developer.mozilla.org/', 'https://nodejs.org/']);
    if (docs) { var line = el('p'); line.appendChild(docs); card.appendChild(line); }
    return card;
  }
  function pick(candidate) {
    var card = el('article', 'pick');
    var title = el('h3');
    var name = safeLink(candidate.npm_url, candidate.name, ['https://www.npmjs.com/package/']) || el('span', '', candidate.name);
    title.appendChild(name);
    title.appendChild(el('span', '', ' ' + candidate.version));
    card.appendChild(title);
    if (candidate.description) card.appendChild(el('p', 'desc', candidate.description));
    var stats = el('ul', 'stats');
    var stat = function (strong, rest) { var item = el('li'); item.appendChild(el('b', '', strong)); if (rest) item.appendChild(document.createTextNode(' ' + rest)); stats.appendChild(item); };
    if (typeof candidate.weekly_downloads === 'number') stat(count(candidate.weekly_downloads), 'downloads a week');
    if (candidate.licenses && candidate.licenses.length) stat(candidate.licenses.join(', '));
    if (typeof candidate.dependencies === 'number') stat(String(candidate.dependencies), candidate.dependencies === 1 ? 'dependency' : 'dependencies');
    if (typeof candidate.openssf_scorecard === 'number') stat(String(candidate.openssf_scorecard), 'of 10 on OpenSSF Scorecard');
    var released = candidate.published_at ? new Date(candidate.published_at) : null;
    if (released && !isNaN(released)) stat('Released', new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(released));
    card.appendChild(stats);
    if (candidate.cautions && candidate.cautions.length) {
      var cautions = el('ul', 'cautions');
      candidate.cautions.forEach(function (note) { cautions.appendChild(el('li', '', note)); });
      card.appendChild(cautions);
    }
    var command = el('div', 'cmd');
    command.appendChild(el('code', '', candidate.install));
    command.appendChild(copyButton(candidate.install));
    card.appendChild(command);
    return card;
  }
  function show(data, seconds) {
    out.textContent = '';
    out.appendChild(says('Scout says', data.verdict));
    if (data.platform) out.appendChild(builtin(data.platform));
    var packages = data.packages || [];
    if (packages.length) {
      out.appendChild(el('p', 'subhead', data.platform ? 'If the built-in is not enough' : (packages.length === 1 ? "Scout's pick" : "Scout's shortlist")));
      var grid = el('div', 'picks');
      packages.forEach(function (candidate) { grid.appendChild(pick(candidate)); });
      out.appendChild(grid);
    }
    (data.warnings || []).forEach(function (warning) { out.appendChild(el('p', 'foot', warning)); });
    var meta = data.meta || {};
    var lookups = meta.upstream_requests ? meta.upstream_requests.total : 0;
    out.appendChild(el('p', 'foot', (meta.cache_hit ? 'Answered from a recent lookup' : 'Checked just now against npm and deps.dev: ' + lookups + ' lookups in ' + seconds + ' s') + '. Metadata only: nothing was installed or run.'));
  }
  function fail(message) {
    out.textContent = '';
    out.appendChild(says('Scout tripped over a root', message, 'oops'));
  }
  function search(keywords, where) {
    var request = ++latest;
    var started = Date.now();
    var beat = 0;
    var thinking = says('Scout is looking', QUIPS[0], 'thinking');
    out.textContent = '';
    out.appendChild(thinking);
    go.disabled = true;
    out.setAttribute('aria-busy', 'true');
    clearInterval(ticker);
    ticker = setInterval(function () { beat = (beat + 1) % QUIPS.length; thinking.querySelector('.verdict-text').textContent = QUIPS[beat]; }, 1700);
    var options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: keywords, runtime: where }) };
    if (window.AbortSignal && AbortSignal.timeout) options.signal = AbortSignal.timeout(30000);
    fetch('/v1/search', options).then(function (response) {
      return response.json().then(function (data) { return { ok: response.ok, data: data }; });
    }).then(function (result) {
      if (request !== latest) return;
      if (!result.ok || !result.data || typeof result.data.verdict !== 'string') return fail(result.data && result.data.error ? String(result.data.error) : 'The lookup did not come back. Try again in a moment.');
      show(result.data, ((Date.now() - started) / 1000).toFixed(1));
    }).catch(function () {
      if (request === latest) fail('The lookup did not come back. npm or deps.dev may be slow. Try again in a moment.');
    }).then(function () {
      if (request !== latest) return;
      clearInterval(ticker);
      go.disabled = false;
      out.removeAttribute('aria-busy');
    });
    try {
      var params = new URLSearchParams({ q: input.value.trim() });
      if (where !== 'any') params.set('runtime', where);
      history.replaceState(null, '', '?' + params.toString());
    } catch (error) { /* The address bar is a nicety. */ }
  }
  function submit() {
    var text = input.value.trim();
    var keywords = chosen && chosen.text === text ? chosen.keywords : keywordsFrom(text);
    if (!keywords.length || keywords.join(' ').length < 2) { fail('Give Scout something to look for, such as "csv parser".'); input.focus(); return; }
    search(keywords, runtime());
  }
  function setRuntime(value) {
    var radio = form.querySelector('input[name=runtime][value="' + (value === 'browser' || value === 'node' ? value : 'any') + '"]');
    if (radio) radio.checked = true;
  }

  form.addEventListener('submit', function (event) { event.preventDefault(); submit(); });
  input.addEventListener('input', function () { if (chosen && chosen.text !== input.value.trim()) chosen = null; });
  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {
    chip.addEventListener('click', function () {
      input.value = chip.getAttribute('data-q');
      setRuntime(chip.getAttribute('data-runtime'));
      chosen = { text: input.value, keywords: JSON.parse(chip.getAttribute('data-keywords')) };
      submit();
    });
  });

  // Show this site's own address in the commands, and make them copyable.
  Array.prototype.forEach.call(document.querySelectorAll('.origin'), function (node) { node.textContent = location.origin; });
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
    button.addEventListener('click', function () { copy(document.getElementById(button.getAttribute('data-copy')).textContent, button); });
  });

  // The challenge rows repeat their figures on hover and focus. Everything shown is also printed in the row.
  var tip = document.getElementById('tip');
  var meters = document.getElementById('meters');
  Array.prototype.forEach.call(meters.querySelectorAll('.entry'), function (row) {
    var reveal = function () {
      var wrong = row.getAttribute('data-wrong');
      tip.textContent = '';
      tip.appendChild(el('strong', '', row.getAttribute('data-passed') + ' of 10 files'));
      tip.appendChild(document.createTextNode(row.getAttribute('data-lines') + ' lines you own. ' + (wrong ? 'Gets wrong: ' + wrong + '.' : 'Gets nothing wrong.')));
      tip.hidden = false;
      var box = row.getBoundingClientRect();
      var frame = meters.getBoundingClientRect();
      tip.style.top = (box.bottom - frame.top + 4) + 'px';
      tip.style.left = Math.max(12, Math.min(frame.width - tip.offsetWidth - 12, box.width * 0.45)) + 'px';
    };
    var conceal = function () { tip.hidden = true; };
    row.addEventListener('pointerenter', reveal);
    row.addEventListener('focus', reveal);
    row.addEventListener('pointerleave', conceal);
    row.addEventListener('blur', conceal);
  });

  // A shared link runs its search: /?q=csv+parser&runtime=browser
  var shared = new URLSearchParams(location.search);
  if (shared.get('q')) {
    input.value = shared.get('q').slice(0, 64);
    setRuntime(shared.get('runtime'));
    submit();
  }
})();
</script>
</body>
</html>`;
