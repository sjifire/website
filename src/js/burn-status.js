// Fire Safety widget -- live burn status from the StationWorks permits API.
// The server renders structure only; everything below fills it in.
(function () {
  'use strict';

  const table = document.querySelector('[data-burn-status]');
  if (!table) return;

  // First action: the server never renders aria-busy -- if JS doesn't run
  // (disabled, blocked, fails to parse), the table must not look permanently
  // busy. Set it ourselves so the busy state only ever exists while we are
  // genuinely fetching.
  table.setAttribute('aria-busy', 'true');

  // base.liquid publishes the canonical URL from site.json's burn_status_api.
  // This literal is only the fallback for when that head snippet didn't render;
  // keep the two in sync. This file is passthrough-copied, so it can't read
  // Liquid data directly.
  const ENDPOINT = window.__burnStatusEndpoint ||
    'https://api.permits.stationworks.app/v1/agencies/sjifire/status';
  const TIMEOUT_MS = 8000;

  // The data-row attribute for these rows IS the API's status slug.
  const STATUS_SLUGS = [
    'residential',
    'commercial',
    'recreational-county',
    'recreational-dnr',
    'recreational-nps'
  ];

  // Tokens we have a colour for. Anything else renders uncoloured rather than
  // mis-coloured -- a wrong colour on a fire danger row is worse than none.
  const KNOWN_LEVELS = [
    'low', 'moderate', 'high', 'very-high', 'extreme',
    'open', 'closed', 'restricted'
  ];

  const SEASON_FMT = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });

  // "very_high" -> "very-high" (CSS class suffix)
  function slugify(value) {
    return String(value).trim().toLowerCase().replace(/[\s_-]+/g, '-');
  }

  // "very_high" -> "Very High" (display text)
  function titleCase(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  function formatSeasonDate(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;
    // Force UTC -- naive parsing renders 2026-10-06 as Oct 5 in Pacific time.
    const date = new Date(match[1] + 'T00:00:00Z');
    return isNaN(date.getTime()) ? null : SEASON_FMT.format(date);
  }

  function cellFor(token) {
    if (typeof token !== 'string' || !token.trim()) {
      return { text: '—', className: 'level level--unknown' };
    }
    const slug = slugify(token);
    return {
      text: titleCase(token),
      className: KNOWN_LEVELS.indexOf(slug) === -1
        ? 'level'
        : 'level level--' + slug
    };
  }

  function seasonFor(season) {
    if (!season) return null;
    const start = formatSeasonDate(season.start);
    const end = formatSeasonDate(season.end);
    return start && end ? start + '-' + end : null;
  }

  // Only http(s) links are safe to write into an anchor's href -- the API is
  // an external, uncontrolled source, and a `javascript:` URL would execute
  // in this origin on click. A malformed URL (throws) is treated the same as
  // an absent one: no link, never a guess.
  function safeHttpUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value, location.href);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function airQualityFor(aq) {
    if (!aq) return null;
    const aqi = aq.pm25Aqi;
    if (typeof aqi !== 'number' || !isFinite(aqi) || aqi < 0) return null;
    // category arrives display-ready ("Unhealthy for Sensitive Groups").
    // Slugify it for the class, but never title-case it for display.
    const category = typeof aq.category === 'string' ? aq.category : '';
    return {
      score: String(Math.round(aqi)),
      label: category ? 'AQI · ' + category : 'AQI',
      className: category ? 'level level--aqi-' + slugify(category) : 'level',
      station: typeof aq.station === 'string' ? aq.station : '',
      href: safeHttpUrl(aq.linkUrl)
    };
  }

  // Map the whole payload up front. Returning null means "show the warning" --
  // we never patch a partial view.
  function buildView(payload) {
    if (!payload || !Array.isArray(payload.statuses) || !payload.statuses.length) {
      return null;
    }

    const bySlug = Object.create(null);
    payload.statuses.forEach(function (status) {
      if (status && typeof status.slug === 'string') bySlug[status.slug] = status;
    });

    // If StationWorks renamed every slug we know about, the payload is a
    // slug-contract break, not partial data -- show the warning rather than
    // five permanent, silent em dashes. One or two missing slugs still
    // degrade per-row below; only a total mismatch is fatal.
    const matchedSlugs = STATUS_SLUGS.filter(function (slug) {
      return Object.prototype.hasOwnProperty.call(bySlug, slug);
    });
    if (matchedSlugs.length === 0) return null;

    const rows = { 'fire-danger': cellFor(payload.fireDanger) };
    STATUS_SLUGS.forEach(function (slug) {
      rows[slug] = cellFor(bySlug[slug] && bySlug[slug].state);
    });

    return {
      rows: rows,
      season: seasonFor(payload.season),
      airQuality: airQualityFor(payload.airQuality)
    };
  }

  function renderAirQuality(aq) {
    const row = table.querySelector('[data-aqi-row]');
    if (!row) return;
    if (!aq) {
      row.hidden = true;
      return;
    }

    const cell = table.querySelector('[data-row="air-quality"]');
    if (cell) cell.className = aq.className;

    const score = table.querySelector('[data-aqi-score]');
    if (score) score.textContent = aq.score;

    const label = table.querySelector('[data-aqi-label]');
    if (label) label.textContent = aq.label;

    const link = table.querySelector('[data-aqi-link]');
    if (link) {
      // No valid link -> plain text, not a dud href="#" that duplicates the
      // current tab (the anchor still has target="_blank").
      if (aq.href) {
        link.setAttribute('href', aq.href);
      } else {
        link.removeAttribute('href');
      }
    }

    const source = table.querySelector('[data-aqi-source]');
    if (source) {
      source.textContent = '';
      if (aq.station) {
        source.appendChild(
          document.createTextNode('Nearest monitor: ' + aq.station + ' ')
        );
        const nowrap = document.createElement('span');
        nowrap.className = 'widget__nowrap';
        nowrap.textContent = '· PM2.5';
        source.appendChild(nowrap);
      }
    }

    row.hidden = false;
  }

  function render(view) {
    Object.keys(view.rows).forEach(function (key) {
      const cell = table.querySelector('[data-row="' + key + '"]');
      if (!cell) return;
      cell.textContent = view.rows[key].text;
      cell.className = view.rows[key].className;
    });

    const season = table.querySelector('[data-burn-season]');
    const range = table.querySelector('[data-season-range]');
    if (season && range) {
      if (view.season) {
        range.textContent = view.season;
        season.hidden = false;
      } else {
        season.hidden = true;
      }
    }

    renderAirQuality(view.airQuality);
    table.removeAttribute('aria-busy');
  }

  function renderWarning() {
    const body = table.querySelector('[data-burn-body]');
    if (body) {
      while (body.firstChild) body.removeChild(body.firstChild);

      const cell = document.createElement('td');
      cell.colSpan = 2;
      cell.className = 'widget__warning';
      cell.appendChild(
        document.createTextNode('⚠ Live fire status unavailable. Call ')
      );

      const phone = document.createElement('a');
      phone.setAttribute('href', 'tel:+13603785334');
      phone.textContent = '(360) 378-5334';
      cell.appendChild(phone);

      cell.appendChild(document.createTextNode(' or see '));

      const permits = document.createElement('a');
      permits.setAttribute('href', '/services/burn-permits/');
      permits.textContent = 'Burn Permits ›';
      cell.appendChild(permits);

      const row = document.createElement('tr');
      row.appendChild(cell);
      body.appendChild(row);
    }

    // A season range is a status claim; don't show one next to "unavailable".
    const season = table.querySelector('[data-burn-season]');
    if (season) season.hidden = true;

    // Not busy any more -- we're done, we just failed.
    table.removeAttribute('aria-busy');
  }

  // Our own request, with a controller so the timeout can actually cancel it.
  function fetchDirect(controller) {
    return fetch(ENDPOINT, { signal: controller.signal }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }

  // A thenable is the only thing we can consume; anything else on the global
  // (a sentinel, a colliding extension) must not be mistaken for a payload.
  function isThenable(value) {
    return !!value && typeof value.then === 'function';
  }

  // base.liquid starts this request during head parse so it isn't waiting on
  // this file to download and run. Use that in-flight promise when it exists,
  // but retry ourselves if it already failed: it was issued in the first
  // milliseconds of page load, before DNS/TLS was warm, so a single early
  // failure is exactly the case where a second attempt tends to succeed.
  function fetchPayload(controller) {
    const early = window.__burnStatusFetch;
    if (isThenable(early)) {
      return early.catch(function () { return fetchDirect(controller); });
    }
    return fetchDirect(controller);
  }

  function load() {
    let timer;
    const controller = new AbortController();
    // Cancels our own request and, either way, stops waiting. The head-started
    // fetch has its own controller on window; abort it too when present, so a
    // stalled early request isn't left holding a connection.
    const timeout = new Promise(function (_resolve, reject) {
      timer = setTimeout(function () {
        controller.abort();
        if (window.__burnStatusAbort) window.__burnStatusAbort();
        reject(new Error('timeout'));
      }, TIMEOUT_MS);
    });

    // Guards against fetch itself throwing synchronously (a proxy or privacy
    // shim can), which would otherwise escape before .catch is attached and
    // leave the widget aria-busy forever.
    const request = new Promise(function (resolve) { resolve(fetchPayload(controller)); });

    return Promise.race([request, timeout])
      .then(function (payload) {
        const view = buildView(payload);
        if (!view) throw new Error('unusable payload');
        render(view);
      })
      .catch(function () {
        renderWarning();
      })
      .then(function () {
        clearTimeout(timer);
      });
  }

  // Exposed so tests can await the patch deterministically instead of sleeping.
  window.__burnStatusReady = load();
})();
