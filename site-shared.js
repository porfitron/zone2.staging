/* Zone 2 For You — shared (all pages) */
function trackEvent(eventName, params) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params || {});
}

function scrollDocumentToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function initOutboundLinkTracking() {
  document.querySelectorAll("a[href]").forEach(function (link) {
    link.addEventListener("click", function () {
      var href = link.getAttribute("href") || "";
      var isExternal = /^https?:\/\//i.test(href);
      if (!isExternal) return;
      trackEvent("outbound_link_click", {
        link_url: href,
        link_text: (link.textContent || "").trim().slice(0, 80)
      });
    });
  });
}

function initSiteChrome() {
  scrollDocumentToTop();
  requestAnimationFrame(function () {
    scrollDocumentToTop();
  });
  initOutboundLinkTracking();
}

window.addEventListener("DOMContentLoaded", initSiteChrome);
window.addEventListener("load", function () {
  scrollDocumentToTop();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    var swUrl = new URL("service-worker.js", window.location.href).pathname;
    navigator.serviceWorker.register(swUrl).catch(function () {});
  });
}
