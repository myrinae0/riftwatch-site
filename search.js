"use strict";
// RiftWatch search and list helpers. Pure functions, no page access, so tests can load
// this file in Node (tests/search.test.mjs). In the browser it sets window.RiftSearch.
(function (root) {
  // Lowercase, trim, and collapse runs of whitespace. Punctuation is kept.
  const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase();

  // Full state or province name for a store's code, from the data's `regions`.
  function stateName(regions, country, code) {
    if (!code) return "";
    let any = "";
    for (const g of regions || []) {
      for (const st of g.states || []) {
        if (st.code !== code) continue;
        if ((g.country || "") === (country || "")) return st.name || "";
        any = any || st.name || "";
      }
    }
    return any;
  }

  // "City, ST", as the page shows it.
  const placeText = (s) => [s.city, s.state].map((x) => String(x == null ? "" : x).trim()).filter(Boolean).join(", ");

  // A store's display text: "<store name> <City>, <ST> <full state name>".
  function storeText(s, regions) {
    s = s || {};
    return clean([s.name, placeText(s), stateName(regions, s.country, s.state)].join(" "));
  }

  // An event's display text: "<event name> <store name> <City>, <ST> <full state name>".
  function eventText(e, s, regions) {
    return clean([e && e.name, storeText(s, regions)].join(" "));
  }

  // Case-insensitive literal substring search: ", MA" only finds "City, MA".
  // Only the ends are trimmed and runs of spaces collapsed; an empty query matches all.
  function matches(query, text) {
    const q = clean(query);
    return !q || clean(text).includes(q);
  }

  // ---- state filter: "" = all, "US" = a whole country, "US-MA" = one state ----
  const countryOf = (s) => (s && s.country) || "other";
  function inState(s, f) {
    if (!f) return true;
    const i = f.indexOf("-");
    const c = i < 0 ? f : f.slice(0, i);
    return countryOf(s) === c && (i < 0 || (s && s.state) === f.slice(i + 1));
  }

  // Most High events first, then most Elevated, then name (same order as the leaderboard).
  function byStanding(a, b) {
    if (b.high !== a.high) return b.high - a.high;
    if (b.elevated !== a.elevated) return b.elevated - a.elevated;
    const x = a.name || "", y = b.name || "";
    return x < y ? -1 : x > y ? 1 : 0;
  }

  // The Stores page's list. With no search and no filter it is the leaderboard (ranked);
  // otherwise every listed store that matches, in leaderboard order, without ranks.
  function storeList(data, query, filter) {
    if (!clean(query) && !filter) return { ids: (data.leaderboard || []).slice(), ranked: true };
    const ids = (data.stores || [])
      .filter((s) => inState(s, filter) && matches(query, storeText(s, data.regions)))
      .sort(byStanding).map((s) => s.id);
    return { ids, ranked: false };
  }

  // The Events page's list, in the data's order.
  function eventList(data, query, filter) {
    const stores = Object.fromEntries((data.stores || []).map((s) => [s.id, s]));
    return (data.events || []).filter((e) => {
      const s = stores[e.store_id] || {};
      return inState(s, filter) && matches(query, eventText(e, s, data.regions));
    });
  }

  // The private page's list (all levels), in its data's order, with the same search and
  // state filter. Each private event carries its store's name, city, state and country.
  // `regions` (full state names) comes from the private data, else from the caller.
  function privateList(priv, query, filter, regions) {
    const regs = (priv && priv.regions) || regions || [];
    return ((priv && priv.events) || []).filter((e) => {
      const s = { name: e.store, city: e.city, state: e.state, country: e.country };
      return inState(s, filter) && matches(query, eventText(e, s, regs));
    });
  }

  const api = { clean, stateName, storeText, eventText, matches, inState, byStanding, storeList, eventList,
    privateList };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RiftSearch = api;
})(this);
