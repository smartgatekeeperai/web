document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  if (page !== "activity-feed") return;

  const RESOLUTION_CONFIG = {
    hour: {
      apiType: "hourly",
      unit: "hours",
      label: "Last",
      ranges: [6, 12, 24],
      defaultValue: 6,
    },
    day: {
      apiType: "daily",
      unit: "days",
      label: "Last",
      ranges: [3, 7, 14],
      defaultValue: 3,
    },
    week: {
      apiType: "weekly",
      unit: "weeks",
      label: "Last",
      ranges: [4, 8, 12],
      defaultValue: 4,
    },
  };

  const activityList = document.getElementById("activityList");
  const activityResolutionChips = document.getElementById(
    "activityResolutionChips",
  );
  const activityRangeSelect = document.getElementById("activityRangeSelect");
  const searchInput = document.getElementById("searchInput");

  let AI_CONFIG = null;
  let LOG_THUMBNAIL_BASE_URL = "";

  let activityResolution = "hour";
  let activityRange = RESOLUTION_CONFIG[activityResolution].ranges[0];
  let historyEvents = [];
  let currentRenderedEvents = [];

  function parseMaybeJson(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatTimeLabel(dateValue) {
    const dt = new Date(dateValue);
    if (Number.isNaN(dt.getTime())) return "---";

    let hours = dt.getHours();
    const minutes = pad2(dt.getMinutes());
    const suffix = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${suffix}`;
  }

  function formatDateTimeLabel(dateValue) {
    const dt = new Date(dateValue);
    if (Number.isNaN(dt.getTime())) return "---";

    const month = dt.toLocaleString("en-US", { month: "short" });
    const day = dt.getDate();
    return `${month} ${day}, ${formatTimeLabel(dt)}`;
  }

  function normalizeVerification(value) {
    const raw = String(value || "").trim().toLowerCase();

    if (
      raw === "registered" ||
      raw === "verified" ||
      raw === "authorized" ||
      raw === "matched"
    ) {
      return "registered";
    }

    return "not-registered";
  }

  function resolvePreviewUrl(value) {
    const raw = String(value || "").trim();

    if (!raw) return "images/no-video.png";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/")) return raw;

    if (LOG_THUMBNAIL_BASE_URL) {
      return `${LOG_THUMBNAIL_BASE_URL}${encodeURIComponent(raw)}`;
    }

    return "images/no-video.png";
  }

  function normalizeLogToActivityItem(log) {
    const driver = parseMaybeJson(log?.driver);
    const vehicle = parseMaybeJson(log?.vehicle);
    const status = normalizeVerification(log?.verification);

    return {
      id: log?.id ?? `${log?.plateNumber || "unknown"}-${log?.createdAt || ""}`,
      plate: String(log?.plateNumber || "---").trim() || "---",
      status,
      timeLabel: formatDateTimeLabel(log?.createdAt),
      vehicleType:
        vehicle?.type ||
        log?.vehicleType ||
        log?.type ||
        "Unknown vehicle",
      driver: driver?.fullName || log?.driverName || "",
      source:
        log?.cameraSource ||
        (status === "registered" ? "Plate recognition" : ""),
      reason:
        status === "registered"
          ? ""
          : log?.reason || "Plate not found in registry",
      thumbnailUrl: resolvePreviewUrl(log?.imagePreview),
      createdAt: log?.createdAt || null,
      searchableText: [
        log?.plateNumber,
        driver?.fullName,
        vehicle?.type,
        vehicle?.brand,
        vehicle?.model,
        log?.cameraSource,
        log?.verification,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  }

  async function loadAIConfig() {
    try {
      AI_CONFIG = await window.getAIConfig?.();
      LOG_THUMBNAIL_BASE_URL = String(AI_CONFIG?.logThumbnail || "").trim();

      if (LOG_THUMBNAIL_BASE_URL && !LOG_THUMBNAIL_BASE_URL.endsWith("/")) {
        LOG_THUMBNAIL_BASE_URL += "/";
      }
    } catch (err) {
      console.warn("[Activity Feed] AI config load failed:", err);
      AI_CONFIG = null;
      LOG_THUMBNAIL_BASE_URL = "";
    }
  }

  async function fetchLogsByResolution(resolution, range) {
    const cfg = RESOLUTION_CONFIG[resolution];
    const url = `/api/logs?type=${encodeURIComponent(
      cfg.apiType,
    )}&value=${encodeURIComponent(range)}`;

    const resp = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    if (!resp.ok) {
      throw new Error(`Failed to load logs (${resp.status})`);
    }

    const result = await resp.json();

    if (!result?.success) {
      throw new Error(result?.message || "Failed to load logs");
    }

    return Array.isArray(result?.data) ? result.data : [];
  }

  function updateActivityRangeSelect() {
    if (!activityRangeSelect) return;

    const cfg = RESOLUTION_CONFIG[activityResolution];
    activityRangeSelect.innerHTML = cfg.ranges
      .map(
        (value) => `
          <option value="${value}">
            ${cfg.label} ${value} ${cfg.unit}
          </option>
        `,
      )
      .join("");

    activityRange = cfg.ranges[0];
  }

  function getFilteredEvents(events) {
    const query = String(searchInput?.value || "")
      .trim()
      .toLowerCase();

    if (!query) return events;
    return events.filter((evt) => evt.searchableText.includes(query));
  }

  function renderActivity(events) {
    if (!activityList) return;

    currentRenderedEvents = Array.isArray(events) ? events : [];
    const filteredEvents = getFilteredEvents(currentRenderedEvents);

    if (!filteredEvents.length) {
      activityList.innerHTML = `
        <div class="activity-item">
          <div class="activity-details">
            <div class="activity-main-row">
              <span class="badge-plate">No records found</span>
            </div>
            <div class="activity-meta">No activity matched the current filter.</div>
          </div>
        </div>
      `;
      return;
    }

    activityList.innerHTML = filteredEvents
      .map((evt) => {
        const statusClass =
          evt.status === "registered" ? "registered" : "not-registered";
        const statusLabel =
          evt.status === "registered" ? "Registered" : "Not registered";

        const metaLine =
          evt.status === "registered"
            ? evt.driver
              ? `<strong>Driver:</strong> ${escapeHtml(
                  evt.driver,
                )} · <strong>Source:</strong> ${escapeHtml(evt.source)}`
              : `<strong>Source:</strong> ${escapeHtml(
                  evt.source || "Plate recognition",
                )}`
            : `<strong>Reason:</strong> ${escapeHtml(
                evt.reason || "Unknown",
              )}`;

        return `
          <div class="activity-item">
            <div class="activity-thumbnail">
              <img src="${escapeHtml(evt.thumbnailUrl)}" alt="Captured frame for ${escapeHtml(
                evt.plate,
              )}" />
            </div>
            <div class="activity-details">
              <div class="activity-main-row">
                <span class="badge-plate">${escapeHtml(evt.plate)}</span>
              </div>
              <div class="activity-sub-row">
                <span><i class="far fa-clock"></i> ${escapeHtml(
                  evt.timeLabel,
                )}</span>
                <span>${escapeHtml(evt.vehicleType || "---")}</span>
              </div>
              <div class="activity-meta">${metaLine}</div>
            </div>
            <div class="activity-confidence-badge ${statusClass}">${statusLabel}</div>
          </div>
        `;
      })
      .join("");
  }

  async function loadActivityFeed() {
    try {
      const logs = await fetchLogsByResolution(activityResolution, activityRange);
      historyEvents = logs
        .map(normalizeLogToActivityItem)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      renderActivity(historyEvents);
    } catch (err) {
      console.error("[activity-feed] load error:", err);
      historyEvents = [];
      renderActivity([]);

      await window.showAlert?.({
        type: "error",
        title: "Load failed",
        message: err?.message || "Unable to load activity feed.",
      });
    }
  }

  activityResolutionChips?.addEventListener("click", (evt) => {
    const chip = evt.target.closest(".chip");
    if (!chip) return;

    const res = chip.dataset.resolution;
    if (!res || res === activityResolution) return;

    activityResolution = res;

    activityResolutionChips.querySelectorAll(".chip").forEach((btn) => {
      btn.classList.toggle("active", btn === chip);
    });

    updateActivityRangeSelect();
    loadActivityFeed();
  });

  activityRangeSelect?.addEventListener("change", (evt) => {
    activityRange = Number(evt.target.value) || activityRange;
    loadActivityFeed();
  });

  searchInput?.addEventListener("input", () => {
    renderActivity(historyEvents);
  });

  updateActivityRangeSelect();
  await loadAIConfig();
  await loadActivityFeed();
});