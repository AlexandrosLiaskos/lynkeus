// @ts-check

/**
 * Show the total of recorded page visits and count this browser once.
 *
 * The page holds one element with the id "visit-count" and the address of
 * the counter in its "data-endpoint" attribute. A marker in the storage of
 * the browser records that the visit has been counted, so that later visits
 * from the same browser only read the total.
 */
(() => {
  const MARKER = "lynkeus-visit-counted";
  const element = document.getElementById("visit-count");
  const endpoint = element?.dataset.endpoint;
  if (!element || !endpoint) {
    return;
  }

  /** @returns {boolean} whether this browser has been counted before */
  const isCounted = () => {
    try {
      return window.localStorage.getItem(MARKER) === "1";
    } catch {
      return false;
    }
  };

  const markCounted = () => {
    try {
      window.localStorage.setItem(MARKER, "1");
    } catch {
      // The browser refuses storage: the visit is counted again next time.
    }
  };

  const counted = isCounted();
  fetch(endpoint, { method: counted ? "GET" : "POST", headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`The counter answered ${response.status}.`);
      }
      return response.json();
    })
    .then((data) => {
      const count = Number(data.count);
      if (!Number.isInteger(count) || count < 0) {
        throw new Error("The counter returned no valid total.");
      }
      element.textContent = new Intl.NumberFormat("en").format(count);
      if (!counted) {
        markCounted();
      }
    })
    .catch(() => {
      element.textContent = "not available";
    });
})();
