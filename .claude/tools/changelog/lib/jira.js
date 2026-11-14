"use strict";
/**
 * changelog adatgyűjtő — Jira ticket-cím lekérés (COCALC-241).
 *
 * Csak `enriched` / `standalone` módban hívódik (a kettő viselkedése azonos: mindkettő
 * a Jira REST API-t hívja). A hitelesítés env-ből jön, SOHA nem a repóból:
 *
 *   - JIRA_BASE_URL   pl. https://<cég>.atlassian.net
 *   - JIRA_API_TOKEN  personal access token (Bearer)
 *
 * Endpoint:  GET {JIRA_BASE_URL}/rest/api/3/issue/{key}?fields=summary
 *
 * Hibakezelés (a config.md "CHANGELOG_MODE" + a ticket AC7 szerint):
 *   - hiányzó baseUrl/token vagy fetch  -> teljes visszaesés: { jiraFallback: true },
 *     a JSON-ból elmarad minden ticketTitle, a futás exit 0-val folytatódik.
 *   - hálózati dobás VAGY 401/403/5xx (globálisan rossz token, kiesett Jira)  ->
 *     ugyanez a teljes visszaesés (a `fetchTicketTitle` dob, a hívó `jiraFallback`-be
 *     billen). Így egy lejárt `JIRA_API_TOKEN` NEM néz ki sikeres, üres dúsításnak.
 *   - egyedi ticket 404  -> csak az az egy MR marad cím nélkül, nincs teljes
 *     visszaesés (a ticket törölhető/átnevezhető volt).
 *
 * A `fetch` injektálható (teszthez); alapból a Node 18+ beépített globális `fetch`.
 */

function resolveFetch(fetchImpl) {
  if (typeof fetchImpl === "function") return fetchImpl;
  if (typeof fetch === "function") return fetch;
  return null;
}

/**
 * Egyetlen ticket címének lekérése.
 * @returns {Promise<string|null>}  a summary, vagy null ha a ticket egyedileg nem
 *          elérhető (404) — ez NEM billenti a teljes visszaesést.
 * @throws  hálózati hiba, vagy 401/403/5xx (bármely nem-ok, nem-404 válasz) esetén —
 *          a hívó ezt teljes `jiraFallback`-ként kezeli. A dobott hibán a
 *          `jiraHttpStatus` mező hordozza a HTTP-státuszt (ha volt).
 */
async function fetchTicketTitle(key, opts = {}) {
  const doFetch = resolveFetch(opts.fetchImpl);
  if (!doFetch) throw new Error("nincs elérhető fetch implementáció");
  const base = String(opts.baseUrl || "").replace(/\/+$/, "");
  const url = base + "/rest/api/3/issue/" + encodeURIComponent(key) + "?fields=summary";
  const res = await doFetch(url, {
    headers: {
      Authorization: "Bearer " + opts.token,
      Accept: "application/json",
    },
  });

  if (res && res.ok) {
    let body;
    try {
      body = await res.json();
    } catch (e) {
      return null;
    }
    return (body && body.fields && body.fields.summary) || null;
  }

  const status = res ? res.status : "ismeretlen";
  if (status === 404) return null; // egyedi ticket eltűnt/átnevezve — csak ez az MR marad cím nélkül

  const err = new Error(
    "Jira HTTP " + status + " a(z) " + key + " lekérésénél — teljes visszaesés"
  );
  err.jiraHttpStatus = status;
  throw err;
}

/**
 * MR-lista dúsítása Jira-címekkel.
 * @param {Array<object>} mrs  { ticketKey, nature, branch, title, url } objektumok.
 * @param {object} [opts]  { fetchImpl, baseUrl, token, warn }
 * @returns {Promise<{mrs:Array<object>, jiraFallback:boolean}>}
 */
async function enrichWithJira(mrs, opts = {}) {
  const warn = opts.warn || (() => {});
  const doFetch = resolveFetch(opts.fetchImpl);

  if (!opts.baseUrl || !opts.token) {
    warn(
      "figyelem: JIRA_BASE_URL / JIRA_API_TOKEN nincs beállítva — offline eredményre esem vissza (jiraFallback)"
    );
    return { mrs: stripTitles(mrs), jiraFallback: true };
  }
  if (!doFetch) {
    warn(
      "figyelem: nincs elérhető fetch implementáció (Node 18+ kell) — offline eredményre esem vissza (jiraFallback)"
    );
    return { mrs: stripTitles(mrs), jiraFallback: true };
  }

  const cache = new Map();
  const out = [];
  let fellBack = false;
  let fallbackReason = "";

  for (const mr of mrs) {
    if (fellBack || !mr.ticketKey) {
      out.push(mr);
      continue;
    }
    let title = cache.get(mr.ticketKey);
    if (title === undefined) {
      try {
        title = await fetchTicketTitle(mr.ticketKey, {
          fetchImpl: doFetch,
          baseUrl: opts.baseUrl,
          token: opts.token,
        });
        cache.set(mr.ticketKey, title);
      } catch (e) {
        // Hálózati hiba vagy 401/403/5xx -> teljes visszaesés (nem "sikeres, üres
        // dúsítás"). Egyedi 404 nem ide jut: a fetchTicketTitle null-t ad rá.
        // "Minden ticketKey-re hiba jött" is ide fut: az első hiba már billent.
        fellBack = true;
        fallbackReason = e.message || String(e);
        out.push(mr);
        continue;
      }
    }
    out.push(title ? Object.assign({}, mr, { ticketTitle: title }) : mr);
  }

  if (fellBack) {
    warn(
      "figyelem: a Jira-dúsítás nem teljesíthető (" +
        fallbackReason +
        ") — offline eredményre esem vissza (jiraFallback)"
    );
    return { mrs: stripTitles(out), jiraFallback: true };
  }
  return { mrs: out, jiraFallback: false };
}

function stripTitles(mrs) {
  return mrs.map((mr) => {
    if (!("ticketTitle" in mr)) return mr;
    const copy = Object.assign({}, mr);
    delete copy.ticketTitle;
    return copy;
  });
}

module.exports = { fetchTicketTitle, enrichWithJira };
