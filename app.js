"use strict";
// RiftWatch static site: leaderboard, store and event search with a state filter,
// store pages with a copy-paste report, and a password-protected private view.
(function () {
  const app = document.getElementById("app");
  let DATA = null;
  let PRIVATE = null;
  let STATE = "";  // state filter from the URL (#/events?state=US-MA); nothing else is remembered

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
  const href = (id) => withState("#/store/" + encodeURIComponent(id));

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

  // ---- state filter: "" = all, "US" = a whole country, "US-MA" = one state ----
  const countryOf = (s) => (s && s.country) || "other";
  const filterValues = () => {
    const v = new Set([""]);
    (DATA.regions || []).forEach((g) => {
      const c = g.country || "other";
      v.add(c);
      g.states.forEach((st) => v.add(c + "-" + st.code));
    });
    return v;
  };
  function inState(s, f) {
    if (!f) return true;
    const i = f.indexOf("-");
    const c = i < 0 ? f : f.slice(0, i);
    return countryOf(s) === c && (i < 0 || (s && s.state) === f.slice(i + 1));
  }
  function stateSelect() {
    const opt = (v, label) => `<option value="${esc(v)}"${v === STATE ? " selected" : ""}>${esc(label)}</option>`;
    return `<select id="st" aria-label="Filter by state or province">${opt("", "All states and provinces")}` +
      (DATA.regions || []).map((g) => {
        const c = g.country || "other";
        return `<optgroup label="${esc(g.name)}">${opt(c, "All of " + g.name)}` +
          g.states.map((st) => opt(c + "-" + st.code, st.name)).join("") + `</optgroup>`;
      }).join("") + `</select>`;
  }
  const withState = (path) => path + (STATE ? "?state=" + encodeURIComponent(STATE) : "");
  function navLinks() {
    document.querySelectorAll("[data-nav=stores]").forEach((a) => { a.href = withState("#/"); });
    document.querySelectorAll("[data-nav=events]").forEach((a) => { a.href = withState("#/events"); });
  }
  // Wires the search box and the state select to `draw`; the select also updates the URL.
  function bindFilters(path, draw) {
    document.getElementById("q").addEventListener("input", draw);
    document.getElementById("st").addEventListener("change", (ev) => {
      STATE = ev.target.value;
      history.replaceState(null, "", withState(path));
      navLinks();
      draw();
    });
    draw();
  }

  function storesView() {
    const stores = storeById();
    app.innerHTML = `<h1>Stores with suspicious registrations</h1>
      <p class="muted">Stores with at least one High event, most first. Search covers every listed store.</p>
      <div class="filters"><input type="search" id="q" placeholder="Search stores, cities or states" aria-label="Search stores">
      ${stateSelect()}</div>
      <p class="muted small" id="n"></p>
      <ul class="list" id="out"></ul>`;
    const out = document.getElementById("out");
    const draw = () => {
      const q = document.getElementById("q").value;
      const ids = (q.trim() ? DATA.stores.filter((s) => match(q, s.name, s.city, s.state, s.address)).map((s) => s.id)
        : DATA.leaderboard).filter((id) => inState(stores[id], STATE));
      document.getElementById("n").textContent = `${ids.length} store${ids.length === 1 ? "" : "s"}`;
      out.innerHTML = ids.map((id, i) => {
        const s = stores[id];
        return `<li><span class="rank">${q.trim() ? "" : i + 1}</span><div class="grow">
          <div class="title"><a href="${href(id)}">${esc(s.name)}</a></div><div class="muted">${place(s)}</div></div>
          <div class="count">${s.high} High<br>${s.elevated} Elevated</div></li>`;
      }).join("") || `<li class="muted">No stores match.</li>`;
    };
    bindFilters("#/", draw);
  }

  function eventsView() {
    const stores = storeById();
    app.innerHTML = `<h1>Events with suspicious registrations</h1>
      <div class="filters"><input type="search" id="q" placeholder="Search events, stores, cities or states" aria-label="Search events">
      ${stateSelect()}</div>
      <p class="muted small" id="n"></p>
      <ul class="list" id="out"></ul>`;
    const out = document.getElementById("out");
    const draw = () => {
      const q = document.getElementById("q").value;
      const rows = DATA.events.filter((e) => {
        const s = stores[e.store_id] || {};
        return inState(s, STATE) && match(q, e.name, s.name, s.city, s.state, e.level);
      });
      document.getElementById("n").textContent = `${rows.length} event${rows.length === 1 ? "" : "s"}` +
        (rows.length > 300 ? " (showing the first 300)" : "");
      out.innerHTML = rows.slice(0, 300).map((e) => eventItem(e, stores)).join("") ||
        `<li class="muted">No events match.</li>`;
    };
    bindFilters("#/events", draw);
  }

  function storeView(id) {
    const s = storeById()[id];
    if (!s) { app.innerHTML = `<p>Store not found. <a href="#/">Back to stores</a></p>`; return; }
    const evs = eventById();
    const stores = storeById();
    app.innerHTML = `<p><a href="${withState("#/")}">← Stores</a></p><h1>${esc(s.name)}</h1>
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
      <p class="muted">${esc(asOf())}</p>`;
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

  function asOf() {
    const sc = DATA.scan || {};
    const n = (x) => Number(x || 0).toLocaleString();
    if (!sc.partial) return `Data as of ${DATA.data_as_of}.`;
    return `Data as of ${DATA.data_as_of}. Partial scan: ` + (sc.points_total && sc.points_done < sc.points_total
      ? `${n(sc.points_done)} of ${n(sc.points_total)} search areas covered.`
      : `${n(sc.checked)} of ${n(sc.total)} event pages checked.`);
  }

  function route() {
    const [h, qs] = location.hash.replace(/^#\/?/, "").split("?");
    const want = new URLSearchParams(qs || "").get("state") || "";
    STATE = filterValues().has(want) ? want : "";
    navLinks();
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
    document.getElementById("asof").textContent = asOf();
    document.getElementById("private-link").hidden = !d.has_private;
    window.addEventListener("hashchange", route);
    route();
  }).catch(() => { app.innerHTML = `<p>Could not load the data. Try again later.</p>`; });
})();
