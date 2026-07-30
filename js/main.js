document.addEventListener("DOMContentLoaded", () => {
  const b = document.querySelector(".menu-button"),
    n = document.querySelector(".nav-links");
  if (b && n) b.onclick = () => n.classList.toggle("open");
  document
    .querySelectorAll("[data-phone-display]")
    .forEach((e) => (e.textContent = OZZO_SETTINGS.phoneDisplay));
  document
    .querySelectorAll("[data-email]")
    .forEach((e) => (e.textContent = OZZO_SETTINGS.email));
  document
    .querySelectorAll("[data-address]")
    .forEach((e) => (e.textContent = OZZO_SETTINGS.address));
  document
    .querySelectorAll("[data-hours]")
    .forEach((e) => (e.textContent = OZZO_SETTINGS.openingHours));
  document
    .querySelectorAll("[data-phone-link]")
    .forEach((e) => (e.href = OZZO_SETTINGS.phoneLink));
  document
    .querySelectorAll("[data-email-link]")
    .forEach((e) => (e.href = `mailto:${OZZO_SETTINGS.email}`));
  document
    .querySelectorAll("[data-whatsapp-link]")
    .forEach((e) => (e.href = OZZO_SETTINGS.whatsappLink));
  document
    .querySelectorAll("[data-book-link]")
    .forEach((e) => (e.href = OZZO_SETTINGS.bookNowLink));
  document
    .querySelectorAll("[data-app-link]")
    .forEach((e) => (e.href = OZZO_SETTINGS.downloadAppLink));
  const a = document.querySelector("[data-airport-list]");
  if (a)
    a.innerHTML = AIRPORT_PRICES.map(
      (i) =>
        `<div class="price-row"><div><strong>${i.destination}</strong><small>${i.detail}</small></div><div class="price">${i.price}</div></div>`
    ).join("");
  const l = document.querySelector("[data-local-list]");
  if (l)
    l.innerHTML = LOCAL_PRICES.map(
      (i) =>
        `<div class="price-row"><div><strong>${i.journey}</strong><small>${i.detail}</small></div><div class="price">${i.price}</div></div>`
    ).join("");
});
