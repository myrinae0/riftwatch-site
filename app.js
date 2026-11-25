"use strict";
// RiftWatch static site: leaderboard, store and event search, store pages with
// a copy-paste report, and a password-protected private view.
(function () {
  const app = document.getElementById("app");
  let DATA = null;
  let PRIVATE = null;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const day = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? esc(iso) : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  const place = (s) => [s.city, s.state].filter(Boolean).map(esc).join(", ");
  const badge = (lvl) => `<span class="badge ${esc(lvl)}">${esc(lvl)}</span>`;
  const storeById = () => Object.fromEntries(DATA.stores.map((s) => [s.id, s]));
  const eventById = () => Object.fromEntries(DATA.events.map((e) => [e.id, e]));
  const href = (id) => "#/store/" + encodeURIComponent(id);

  function counts(e) {
    let t = `${esc(e.registered)} registered`;
    if (e.usual != null) t += `<br>usually ~${esc(e.usual)}`;
    return t;
  }

  function eventItem(e, stores) {
    const s = stores[e.store_id] || {};
    return `<li><div class="grow"><div class="title">${badge(e.level)}<a href="${esc(e.url)}" rel="noopener">${esc(e.name)}</a></div>
      <div class="muted"><a href="${href(e.store_id)}">${esc(s.name)}</a> · ${place(s)} · ${day(e.date)}</div></div>
      <div class="count">${counts(e)}</div></li>`;
  }

  function match(q, ...fields) {
    q = q.trim().toLowerCase();
    return !q || fields.some((f) => String(f || "").toLowerCase().includes(q));
  }

  function storesView() {
    const stores = storeById();
    app.innerHTML = `<h1>Stores with suspicious registrations</h1>
      <p class="muted">Stores with at least one High event, most first. Search covers every listed store.</p>
      <input type="search" id="q" placeholder="Search stores, cities or states" aria-label="Search stores">
      <ul class="list" id="out"></ul>`;
    const out = document.getElementById("out");
    const draw = () => {
      const q = document.getElementById("q").value;
      const ids = q.trim() ? DATA.stores.filter((s) => match(q, s.name, s.city, s.state, s.address)).map((s) => s.id)
        : DATA.leaderboard;
      out.innerHTML = ids.map((id, i) => {
        const s = stores[id];
        return `<li><span class="rank">${q.trim() ? "" : i + 1}</span><div class="grow">
          <div class="title"><a href="${href(id)}">${esc(s.name)}</a></div><div class="muted">${place(s)}</div></div>
          <div class="count">${s.high} High<br>${s.elevated} Elevated</div></li>`;
      }).join("") || `<li class="muted">No stores match.</li>`;
    };
    document.getElementById("q").addEventListener("input", draw);
    draw();
  }

  function eventsView() {
    const stores = storeById();
    app.innerHTML = `<h1>Events with suspicious registrations</h1>
      <input type="search" id="q" placeholder="Search events, stores, cities or states" aria-label="Search events">
      <ul class="list" id="out"></ul>`;
    const out = document.getElementById("out");
    const draw = () => {
      const q = document.getElementById("q").value;
      const rows = DATA.events.filter((e) => {
        const s = stores[e.store_id] || {};
        return match(q, e.name, s.name, s.city, s.state, e.level);
      });
      out.innerHTML = rows.slice(0, 300).map((e) => eventItem(e, stores)).join("") ||
        `<li class="muted">No events match.</li>`;
    };
    document.getElementById("q").addEventListener("input", draw);
    draw();
  }

  function storeView(id) {
    const s = storeById()[id];
    if (!s) { app.innerHTML = `<p>Store not found. <a href="#/">Back to stores</a></p>`; return; }
    const evs = eventById();
    const stores = storeById();
    app.innerHTML = `<p><a href="#/">← Stores</a></p><h1>${esc(s.name)}</h1>
      <p class="muted">${esc(s.address)}</p>
      <p>${s.high} High · ${s.elevated} Elevated</p>
      <ul class="list">${s.events.map((e) => eventItem(evs[e], stores)).join("")}</ul>
      <div class="card"><h2>Report this store</h2>
      <p class="muted">Copy this text and send it to ${esc(DATA.report_to)}.</p>
      <p><button id="copy">Export report</button> <span id="copied" class="muted"></span></p>
      <textarea id="report" readonly>${esc(s.report)}</textarea></div>`;
    document.getElementById("copy").addEventListener("click", async () => {
      const ta = document.getElementById("report");
      try { await navigator.clipboard.writeText(ta.value); }
      catch (e) { ta.select(); document.execCommand("copy"); }
      document.getElementById("copied").textContent = "Copied.";
    });
  }

  function aboutView() {
    app.innerHTML = `<h1>About</h1><p>${esc(DATA.about)}</p>
      <p>A store's listing means some of its events had registrations that look automated.
      It is not a finding that anyone did anything wrong.</p>
      ${DATA.contact ? `<p>Questions or a listing you think is wrong: ${esc(DATA.contact)}</p>` : ''}
      <p class="muted">Data as of ${esc(DATA.data_as_of)}.</p>`;
  }

  // ---- private view: decrypted in the browser, never sent anywhere ----
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function decrypt(env, password) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: env.hash, salt: b64(env.salt), iterations: env.iterations },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(env.iv) }, key, b64(env.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function privateView() {
    if (PRIVATE) return drawPrivate();
    app.innerHTML = `<h1>Private</h1><form id="pw" class="card">
      <label for="p">Password</label><input type="password" id="p" autocomplete="current-password">
      <p><button type="submit">Unlock</button> <span id="msg" class="muted"></span></p></form>`;
    document.getElementById("pw").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById("msg");
      msg.textContent = "Unlocking…";
      try {
        const env = await (await fetch("data/private.enc.json", { cache: "no-store" })).json();
        PRIVATE = await decrypt(env, document.getElementById("p").value);
        drawPrivate();
      } catch (e) { msg.textContent = "Wrong password or no private data."; }
    });
  }

  function drawPrivate() {
    const P = PRIVATE;
    const sig = (s) => `<li><b>${esc(s.code)}</b> w=${esc(s.weight)} c=${esc(s.confidence)}: ${esc(s.detail)}
      ${s.players && s.players.length ? `<details><summary>${s.players.length} accounts</summary><pre>${esc(s.players.join("\n"))}</pre></details>` : ""}</li>`;
    app.innerHTML = `<h1>Private</h1><p class="muted">Data as of ${esc(P.data_as_of)}. All levels, with reasons.</p>
      <input type="search" id="q" placeholder="Filter" aria-label="Filter">
      <h2>Flagged events</h2><div id="ev"></div>
      <h2>New clusters</h2><div id="fd"></div>
      <h2>Word list</h2><p>${P.name_pool.map(esc).join(", ") || "none yet"}</p>`;
    const draw = () => {
      const q = document.getElementById("q").value;
      document.getElementById("ev").innerHTML = P.events.filter((e) => match(q, e.name, e.store, e.city, e.state, e.level))
        .slice(0, 400).map((e) => `<div class="card">${badge(e.level)}<b><a href="${esc(e.url)}">${esc(e.name)}</a></b>
          <div class="muted">${esc(e.store)} · ${esc(e.city)}, ${esc(e.state)} · ${day(e.date)} · score ${esc(e.score)}
          · ${esc(e.registered)} registered, usual ${esc(e.usual)}</div><ul>${e.signals.map(sig).join("")}</ul></div>`).join("");
      document.getElementById("fd").innerHTML = P.finder.map((c) => `<div class="card"><b>${esc(c.kind)}</b>
        ${c.template ? `<code>${esc(c.template)}</code>` : ""} · ${esc(c.accounts)} accounts · ${esc(c.unexplained_events)} unexplained events
        <pre>${esc(JSON.stringify({ events: c.events, stores: c.stores, examples: c.examples }, null, 1))}</pre></div>`).join("") ||
        `<p class="muted">Nothing new found.</p>`;
    };
    document.getElementById("q").addEventListener("input", draw);
    draw();
  }

  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [page, arg] = h.split("/");
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on",
      a.dataset.nav === (page || "stores") || (page === "store" && a.dataset.nav === "stores")));
    if (page === "events") eventsView();
    else if (page === "store") storeView(decodeURIComponent(arg || ""));
    else if (page === "about") aboutView();
    else if (page === "private" && DATA.has_private) privateView();
    else storesView();
    window.scrollTo(0, 0);
  }

  fetch("data/public.json", { cache: "no-store" }).then((r) => r.json()).then((d) => {
    DATA = d;
    document.getElementById("asof").textContent = `Data as of ${d.data_as_of}.`;
    document.getElementById("private-link").hidden = !d.has_private;
    window.addEventListener("hashchange", route);
    route();
  }).catch(() => { app.innerHTML = `<p>Could not load the data. Try again later.</p>`; });
})();
