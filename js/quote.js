/* OZZO QUOTE CALCULATOR
   PUT OZZO GOOGLE MAPS API KEY HERE
   Restrict browser key to:
   https://ozzotaxi.com/*
   https://www.ozzotaxi.com/*
*/
const GOOGLE_MAPS_API_KEY = "AIzaSyBSUexy01jGVSWtkAHym1pjbXjRMKaujGM";

(function (global) {
  "use strict";

  const METRES_PER_MILE = 1609.344;
  const BANK_HOLIDAY_URL = "https://www.gov.uk/bank-holidays.json";
  const TARIFFS = {
    1: { name: "TARIFF 1", detail: "Day rate • 6am–8pm", firstMile: 4.5, extraTenth: 0.25 },
    2: { name: "TARIFF 2", detail: "Sunday / evening / bank-holiday rate", firstMile: 4.7, extraTenth: 0.3 },
    3: { name: "TARIFF 3", detail: "Night rate • midnight–6am", firstMile: 5.15, extraTenth: 0.35 },
    christmas: { name: "DOUBLE TARIFF 1", detail: "Christmas Day / New Year's Day", firstMile: 9, extraTenth: 0.5 }
  };

  function localDate(dateValue) {
    const parts = String(dateValue).split("-").map(Number);
    return parts.length === 3 && parts.every(Number.isFinite)
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : null;
  }

  function selectTariff(dateValue, timeValue, bankHolidays) {
    const date = localDate(dateValue);
    const time = String(timeValue).match(/^(\d{2}):(\d{2})$/);
    if (!date || !time || Number.isNaN(date.getTime())) throw new Error("Choose a valid date and pickup time.");
    const monthDay = dateValue.slice(5);
    if (monthDay === "12-25" || monthDay === "01-01") return TARIFFS.christmas;
    if (date.getDay() === 0) return { ...TARIFFS[2], detail: "Sunday rate • Tariff 2" };
    if (bankHolidays.has(dateValue)) return { ...TARIFFS[2], detail: "Public / bank-holiday rate" };
    const minutes = Number(time[1]) * 60 + Number(time[2]);
    if (minutes >= 360 && minutes < 1200) return TARIFFS[1];
    if (minutes >= 1200) return TARIFFS[2];
    return TARIFFS[3];
  }

  function calculateFare(distanceMiles, tariff) {
    const miles = Number(distanceMiles);
    if (!Number.isFinite(miles) || miles < 0) throw new Error("A valid driving distance is required.");
    if (miles <= 1) return tariff.firstMile;
    const additionalTenths = Math.ceil(((miles - 1) / 0.1) - 1e-9);
    return tariff.firstMile + additionalTenths * tariff.extraTenth;
  }

  function formatDuration(durationMillis) {
    return Math.max(1, Math.round(durationMillis / 60000));
  }

  function quoteInputError(mapReady, pickup, destination, dateValue, timeValue) {
    if (!mapReady) return "The Google Maps API key must be configured before a route can be calculated.";
    if (!pickup || !destination) return "Select both pickup and destination addresses from the Google suggestions.";
    if (!dateValue || !timeValue) return "Choose a pickup date and time.";
    return "";
  }

  function requireDrivingRoute(route) {
    if (!route || !route.path?.length || !Number.isFinite(route.distanceMeters)) {
      throw new Error("No driving route was found for those addresses.");
    }
    return route;
  }

  async function getBankHolidays() {
    try {
      const response = await fetch(BANK_HOLIDAY_URL, { mode: "cors" });
      if (!response.ok) throw new Error("Bank-holiday service unavailable");
      const data = await response.json();
      return {
        dates: new Set((data["england-and-wales"]?.events || []).map((event) => event.date)),
        years: new Set((data["england-and-wales"]?.events || []).map((event) => event.date.slice(0, 4))),
        available: true
      };
    } catch (_error) {
      return { dates: new Set(), years: new Set(), available: false };
    }
  }

  global.OZZO_QUOTE = { TARIFFS, selectTariff, calculateFare, formatDuration, quoteInputError, requireDrivingRoute };

  if (typeof document === "undefined") return;

  const form = document.querySelector("[data-quote-form]");
  if (!form) return;

  const state = {
    map: null,
    pickup: null,
    destination: null,
    polylines: [],
    markers: [],
    holidays: { dates: new Set(), years: new Set(), available: false }
  };
  const message = document.querySelector("[data-quote-message]");
  const result = document.querySelector("[data-quote-result]");
  const routeSummary = document.querySelector("[data-route-summary]");
  const dateInput = document.querySelector("#quote-date");
  const timeInput = document.querySelector("#quote-time");
  const holidayPromise = getBankHolidays().then((holidays) => {
    state.holidays = holidays;
    return holidays;
  });

  function setMessage(text, type) {
    message.textContent = text;
    message.dataset.type = type || "";
  }

  function setInitialDateTime() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    dateInput.value = local.toISOString().slice(0, 10);
    timeInput.value = local.toISOString().slice(11, 16);
    dateInput.min = local.toISOString().slice(0, 10);
  }

  function clearRoute() {
    state.polylines.forEach((polyline) => polyline.setMap(null));
    state.markers.forEach((marker) => marker.setMap(null));
    state.polylines = [];
    state.markers = [];
  }

  function createMarker(position, label, kind) {
    class QuoteMarker extends google.maps.OverlayView {
      onAdd() {
        this.element = document.createElement("div");
        this.element.className = `quote-map-pin ${kind}`;
        this.element.setAttribute("aria-label", label);
        this.getPanes().overlayMouseTarget.appendChild(this.element);
      }
      draw() {
        const point = this.getProjection().fromLatLngToDivPixel(position);
        if (point && this.element) this.element.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -100%)`;
      }
      onRemove() {
        this.element?.remove();
      }
    }
    const marker = new QuoteMarker();
    marker.setMap(state.map);
    return marker;
  }

  function addAutocomplete(holder, kind) {
    const autocomplete = new google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ["gb"],
      locationBias: { center: { lat: 51.856, lng: -4.31 }, radius: 50000 }
    });
    autocomplete.setAttribute("aria-label", kind === "pickup" ? "Pickup address" : "Destination address");
    autocomplete.setAttribute("placeholder", "Search for an address");
    holder.replaceChildren(autocomplete);
    autocomplete.addEventListener("gmp-select", async (event) => {
      const place = event.placePrediction.toPlace();
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
      state[kind] = place;
      result.hidden = true;
      setMessage("", "");
    });
  }

  async function initGoogleMaps() {
    const [{ Map }, { PlaceAutocompleteElement }, { Route }] = await Promise.all([
      google.maps.importLibrary("maps"),
      google.maps.importLibrary("places"),
      google.maps.importLibrary("routes")
    ]);
    void PlaceAutocompleteElement;
    void Route;
    state.map = new Map(document.querySelector("#quote-map"), {
      center: { lat: 51.856, lng: -4.31 },
      zoom: 12,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "cooperative",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1c1e23" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1c1e23" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#92969f" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#42454c" }] },
        { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#555961" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#173b4b" }] },
        { featureType: "poi", elementType: "geometry", stylers: [{ color: "#24272d" }] }
      ]
    });
    document.querySelector("[data-map-placeholder]").hidden = true;
    addAutocomplete(document.querySelector("[data-pickup-autocomplete]"), "pickup");
    addAutocomplete(document.querySelector("[data-destination-autocomplete]"), "destination");
  }

  async function loadGoogleMaps() {
    if (GOOGLE_MAPS_API_KEY === "PUT_GOOGLE_API_KEY_HERE" || !GOOGLE_MAPS_API_KEY.trim()) {
      setMessage("Add the Google Maps browser API key in js/quote.js to enable quotes.", "setup");
      return;
    }
    global.gm_authFailure = () => setMessage("Google Maps could not authenticate. Check the browser key and website restrictions.", "error");
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly&loading=async`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Google Maps could not load."));
      document.head.appendChild(script);
    });
    await initGoogleMaps();
  }

  async function calculateRoute(event) {
    event.preventDefault();
    result.hidden = true;
    const inputError = quoteInputError(state.map, state.pickup, state.destination, dateInput.value, timeInput.value);
    if (inputError) {
      setMessage(inputError, "error");
      return;
    }

    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Calculating…";
    setMessage("Calculating the driving route…", "loading");
    clearRoute();

    try {
      const { Route } = await google.maps.importLibrary("routes");
      const response = await Route.computeRoutes({
        origin: state.pickup,
        destination: state.destination,
        travelMode: "DRIVING",
        routingPreference: "TRAFFIC_UNAWARE",
        fields: ["path", "distanceMeters", "durationMillis", "viewport"]
      });
      const route = requireDrivingRoute(response.routes?.[0]);

      state.polylines = route.createPolylines();
      state.polylines.forEach((polyline) => {
        polyline.setOptions({ strokeColor: "#ef202d", strokeOpacity: 1, strokeWeight: 6, zIndex: 5 });
        polyline.setMap(state.map);
      });
      state.markers = [
        createMarker(route.path[0], "Pickup", "pickup"),
        createMarker(route.path[route.path.length - 1], "Destination", "destination")
      ];
      state.map.fitBounds(route.viewport, 42);

      const miles = route.distanceMeters / METRES_PER_MILE;
      const minutes = formatDuration(route.durationMillis);
      await holidayPromise;
      const tariff = selectTariff(dateInput.value, timeInput.value, state.holidays.dates);
      const fare = calculateFare(miles, tariff);
      document.querySelector("[data-distance]").textContent = miles.toFixed(1);
      document.querySelector("[data-duration]").textContent = String(minutes);
      document.querySelector("[data-tariff-name]").textContent = tariff.name;
      document.querySelector("[data-tariff-detail]").textContent = tariff.detail;
      document.querySelector("[data-fare]").textContent = `£${fare.toFixed(2)}`;
      document.querySelector("[data-result-distance]").textContent = `${miles.toFixed(1)} miles`;
      document.querySelector("[data-result-duration]").textContent = `Approx. ${minutes} mins`;
      document.querySelector("[data-result-pickup]").textContent = state.pickup.formattedAddress || state.pickup.displayName;
      document.querySelector("[data-result-destination]").textContent = state.destination.formattedAddress || state.destination.displayName;
      routeSummary.hidden = false;
      result.hidden = false;
      const holidayDataCoversDate = state.holidays.available && state.holidays.years.has(dateInput.value.slice(0, 4));
      const holidayNote = !holidayDataCoversDate && dateInput.value.slice(5) !== "12-25" && dateInput.value.slice(5) !== "01-01" && localDate(dateInput.value)?.getDay() !== 0
        ? " Bank-holiday data is currently unavailable, so confirm the applicable tariff when booking."
        : "";
      setMessage(`Estimate calculated.${holidayNote}`, holidayNote ? "warning" : "success");
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      setMessage(error?.message || "The route could not be calculated. Check the addresses and try again.", "error");
      routeSummary.hidden = true;
    } finally {
      button.disabled = false;
      button.textContent = "Calculate Fare";
    }
  }

  setInitialDateTime();
  form.addEventListener("submit", calculateRoute);
  loadGoogleMaps().catch((error) => setMessage(error.message, "error"));
})(typeof window !== "undefined" ? window : globalThis);
