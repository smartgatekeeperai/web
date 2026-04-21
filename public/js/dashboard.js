document.addEventListener("DOMContentLoaded", async () => {
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

  const COLORS = {
    car: "rgba(52, 152, 219, 1)",
    pickup: "rgba(241, 196, 15, 1)",
    utilityVehicle: "rgba(155, 89, 182, 1)",
    motorcycle: "rgba(231, 76, 60, 1)",
    truck: "rgba(39, 174, 96, 1)",
    bus: "rgba(230, 126, 34, 1)",
  };

  const ctx = document.getElementById("peakHoursChart")?.getContext("2d");
  const legendContainer = document.getElementById("chartLegend");
  const rangeSelect = document.getElementById("rangeSelect");
  const chipsContainer = document.getElementById("resolutionChips");

  const activityList = document.getElementById("activityList");
  const activityResolutionChips = document.getElementById(
    "activityResolutionChips",
  );
  const activityRangeSelect = document.getElementById("activityRangeSelect");
  const searchInput = document.getElementById("searchInput");

  const totalVehiclesEl = document.getElementById("totalVehicles");
  const avgVehiclesDailyEl = document.getElementById("avgVehiclesDaily");
  const registeredVehiclesEl = document.getElementById("registeredVehicles");

  const AI_URL = String(window.getAIURL?.() || "").replace(/\/+$/, "");
  const STREAMS_ENDPOINT = `${AI_URL}/streams`;

  let AI_CONFIG = null;
  let LOG_THUMBNAIL_BASE_URL = "";

  let currentResolution = "hour";
  let currentRange = RESOLUTION_CONFIG[currentResolution].ranges[0];
  let chartInstance = null;

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

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
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

      console.log("[AI Config]", AI_CONFIG);
      console.log("[AI Thumbnail Base]", LOG_THUMBNAIL_BASE_URL);
    } catch (err) {
      console.warn("[AI Config] failed to load:", err);
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

  async function fetchChartByResolution(resolution, range) {
    const cfg = RESOLUTION_CONFIG[resolution];
    const url = `/api/chart?type=${encodeURIComponent(
      cfg.apiType,
    )}&value=${encodeURIComponent(range)}`;

    const resp = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    if (!resp.ok) {
      throw new Error(`Failed to load chart (${resp.status})`);
    }

    const result = await resp.json();

    if (!result?.success) {
      throw new Error(result?.message || "Failed to load chart");
    }

    return Array.isArray(result?.data) ? result.data : [];
  }

  function renderLegend() {
    if (!legendContainer) return;

    const items = [
      { label: "Car", color: COLORS.car },
      { label: "Pickup", color: COLORS.pickup },
      { label: "Utility Vehicle", color: COLORS.utilityVehicle },
      { label: "Motorcycle", color: COLORS.motorcycle },
      { label: "Truck", color: COLORS.truck },
      { label: "Bus", color: COLORS.bus },
    ];

    legendContainer.innerHTML = items
      .map(
        (item) => `
          <div class="legend-item">
            <div class="legend-color" style="background-color: ${item.color};"></div>
            <span>${escapeHtml(item.label)}</span>
          </div>
        `,
      )
      .join("");
  }

  function updateRangeSelect() {
    if (!rangeSelect) return;

    const cfg = RESOLUTION_CONFIG[currentResolution];
    rangeSelect.innerHTML = cfg.ranges
      .map(
        (value) => `
          <option value="${value}">
            ${cfg.label} ${value} ${cfg.unit}
          </option>
        `,
      )
      .join("");
    currentRange = cfg.ranges[0];
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

  async function loadChart() {
    if (!ctx) return;

    try {
      const chartRows = await fetchChartByResolution(
        currentResolution,
        currentRange,
      );

      const data = {
        labels: chartRows.map((x) => x.label),
        datasets: [
          {
            label: "Car",
            data: chartRows.map((x) => Number(x.car || 0)),
            borderColor: COLORS.car,
            backgroundColor: "rgba(52,152,219,0.10)",
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBorderWidth: 2,
            tension: 0.35,
            fill: true,
          },
          {
            label: "Pickup",
            data: chartRows.map((x) => Number(x.pickup || 0)),
            borderColor: COLORS.pickup,
            backgroundColor: "rgba(241,196,15,0.08)",
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBorderWidth: 2,
            tension: 0.35,
            fill: false,
          },
          {
            label: "Utility Vehicle",
            data: chartRows.map((x) => Number(x.utilityVehicle || 0)),
            borderColor: COLORS.utilityVehicle,
            backgroundColor: "rgba(155,89,182,0.08)",
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBorderWidth: 2,
            tension: 0.35,
            fill: false,
          },
          {
            label: "Motorcycle",
            data: chartRows.map((x) => Number(x.motorcycle || 0)),
            borderColor: COLORS.motorcycle,
            backgroundColor: "rgba(231,76,60,0.08)",
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBorderWidth: 2,
            tension: 0.35,
            fill: false,
          },
          {
            label: "Truck",
            data: chartRows.map((x) => Number(x.truck || 0)),
            borderColor: COLORS.truck,
            backgroundColor: "rgba(39,174,96,0.08)",
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBorderWidth: 2,
            tension: 0.35,
            fill: false,
          },
          {
            label: "Bus",
            data: chartRows.map((x) => Number(x.bus || 0)),
            borderColor: COLORS.bus,
            backgroundColor: "rgba(230,126,34,0.08)",
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBorderWidth: 2,
            tension: 0.35,
            fill: false,
          },
        ],
      };

      const options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(17,24,39,0.92)",
            padding: 10,
            cornerRadius: 6,
            titleFont: { size: 12, weight: "600" },
            bodyFont: { size: 11 },
            callbacks: {
              afterTitle: (items) => {
                const idx = items?.[0]?.dataIndex ?? -1;
                if (idx < 0) return "";
                const row = chartRows[idx];
                return `Peak Value: ${Number(row?.peakValue || 0)}`;
              },
              label: (context) => {
                const value = context.parsed.y || 0;
                return `${context.dataset.label}: ${value} unique plates`;
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text:
                currentResolution === "hour"
                  ? "Hour"
                  : currentResolution === "day"
                    ? "Day"
                    : "Date Range",
              color: "#6b7280",
            },
            grid: { display: false },
            ticks: { color: "#6b7280", maxRotation: 0 },
          },
          y: {
            title: {
              display: true,
              text: "Peak Value",
              color: "#6b7280",
            },
            beginAtZero: true,
            grid: { color: "rgba(209,213,219,0.4)", drawBorder: false },
            ticks: {
              color: "#9ca3af",
              precision: 0,
            },
          },
        },
      };

      if (chartInstance) {
        chartInstance.data = data;
        chartInstance.options = options;
        chartInstance.update();
      } else {
        chartInstance = new Chart(ctx, {
          type: "line",
          data,
          options,
        });
      }
    } catch (err) {
      console.error("[dashboard chart] error:", err);

      if (chartInstance) {
        chartInstance.data = {
          labels: [],
          datasets: [],
        };
        chartInstance.update();
      }
    }
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
      console.error("[activity feed] error:", err);
      historyEvents = [];
      renderActivity([]);
    }
  }

  async function loadDashboardStats() {
    try {
      const resp = await fetch("/api/summary", {
        method: "GET",
        cache: "no-store",
      });

      if (!resp.ok) {
        throw new Error(`Failed to load summary (${resp.status})`);
      }

      const result = await resp.json();

      if (!result?.success) {
        throw new Error(result?.message || "Failed to load summary");
      }

      const summary = result?.data || {};

      if (totalVehiclesEl) {
        totalVehiclesEl.textContent = formatNumber(summary.totalVehiclesToday || 0);
      }

      if (avgVehiclesDailyEl) {
        avgVehiclesDailyEl.textContent = formatNumber(summary.averageVehiclesDaily || 0);
      }

      if (registeredVehiclesEl) {
        registeredVehiclesEl.textContent = formatNumber(summary.registeredVehicles || 0);
      }

      const peakHoursEl = document.querySelector(".stat-card:nth-child(4) h3");
      if (peakHoursEl) {
        peakHoursEl.textContent = summary.peakHours || "---";
      }
    } catch (err) {
      console.error("[dashboard summary] error:", err);
    }
  }

  function renderLegendAndInit() {
    renderLegend();
    updateRangeSelect();
    updateActivityRangeSelect();
  }

  chipsContainer?.addEventListener("click", (evt) => {
    const chip = evt.target.closest(".chip");
    if (!chip) return;

    const res = chip.dataset.resolution;
    if (!res || res === currentResolution) return;

    currentResolution = res;

    chipsContainer.querySelectorAll(".chip").forEach((btn) => {
      btn.classList.toggle("active", btn === chip);
    });

    updateRangeSelect();
    loadChart();
  });

  rangeSelect?.addEventListener("change", (evt) => {
    currentRange = Number(evt.target.value) || currentRange;
    loadChart();
  });

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

  renderLegendAndInit();
  await loadAIConfig();
  await Promise.all([loadChart(), loadActivityFeed(), loadDashboardStats()]);

  let pusher = null;
  let channel = null;
  let videoChannel = null;

  try {
    const cfg = await window.getPusherConfig?.();
    console.log("[Pusher] config from server:", cfg);

    if (cfg?.key && typeof Pusher !== "undefined") {
      const { key, ...options } = cfg;
      pusher = new Pusher(key, options);

      pusher.connection.bind("connected", () => {
        console.log("[Pusher] connected");
      });

      pusher.connection.bind("state_change", (states) => {
        console.log("[Pusher] state change:", states);
      });

      pusher.connection.bind("error", (err) => {
        console.warn("[Pusher] connection error:", err);
      });

      channel = pusher.subscribe("gate-channel");
      videoChannel = pusher.subscribe("video-channel");

      channel.bind("pusher:subscription_succeeded", () => {
        console.log("[Pusher] subscribed: gate-channel");
      });

      channel.bind("pusher:subscription_error", (status) => {
        console.warn("[Pusher] subscription error: gate-channel", status);
      });

      videoChannel.bind("pusher:subscription_succeeded", () => {
        console.log("[Pusher] subscribed: video-channel");
      });

      videoChannel.bind("pusher:subscription_error", (status) => {
        console.warn("[Pusher] subscription error: video-channel", status);
      });
    } else {
      console.warn("[Pusher] config missing or Pusher lib unavailable");
    }
  } catch (err) {
    console.warn("[Pusher] disabled/fallback mode:", err);
  }

  const band = document.querySelector(".gate-status-band");
  const label = document.querySelector(".gate-status-label");
  const plateField = document.querySelectorAll(".gate-info-item-value");
  const gateVehicleImg = document.querySelector(".gate-vehicle-img");

  const GATE_DETECT_TIMEOUT_MS = 15000;
  let gateResetTimer = null;

  const reset = () => {
    console.log("[GateUI] reset()");
    if (band) band.classList.remove("registered", "not-registered");
    if (label) label.textContent = "NO VEHICLE";
    if (gateVehicleImg) gateVehicleImg.src = "";
    document
      .querySelectorAll(".gate-info-item-value")
      .forEach((el) => (el.textContent = "---"));
  };

  const scheduleGateReset = () => {
    if (gateResetTimer) clearTimeout(gateResetTimer);
    gateResetTimer = setTimeout(() => {
      reset();
      gateResetTimer = null;
    }, GATE_DETECT_TIMEOUT_MS);
  };

  reset();

  function getVehicleImageFromType(typeValue) {
    const raw = String(typeValue || "").trim().toLowerCase();

    if (raw.includes("motor")) return "images/motorcycle.png";
    if (raw.includes("pickup")) return "images/pickup.png";
    if (raw.includes("truck")) return "images/truck.png";
    if (raw.includes("bus")) return "images/bus.png";
    if (raw.includes("van")) return "images/van.png";

    return "images/car.png";
  }

  const handleGateUpdate = (data) => {
    console.log("[Pusher] gate-update event received", data);

    if (!data?.vehicleFound) {
      if (gateVehicleImg) gateVehicleImg.src = "";
      if (band) band.classList.remove("registered", "not-registered");
      if (label) label.textContent = "NO VEHICLE";
      if (gateResetTimer) {
        clearTimeout(gateResetTimer);
        gateResetTimer = null;
      }
      reset();
      return;
    }

    if (gateVehicleImg) {
      gateVehicleImg.src = getVehicleImageFromType(data?.vehicle?.type);
    }

    if (!data?.driver || !data?.vehicle) {
      if (band) {
        band.classList.remove("registered");
        band.classList.add("not-registered");
      }
      if (label) label.textContent = "NOT REGISTERED";

      if (plateField && plateField.length > 0) {
        plateField[0].textContent = data?.plate || "---";
        plateField[1].textContent = "---";
        plateField[2].textContent = "---";
        plateField[3].textContent = "---";
        plateField[4].textContent = "---";
      }

      scheduleGateReset();
      return;
    } else if (!data?.plate) {
      if (band) band.classList.remove("registered", "not-registered");
      if (label) label.textContent = "NO VEHICLE";
      reset();
      return;
    }

    if (band) {
      band.classList.remove("not-registered");
      band.classList.add("registered");
    }
    if (label) label.textContent = "REGISTERED";

    if (plateField && plateField.length > 0) {
      plateField[0].textContent = data?.plate || "---";
      plateField[1].textContent = data?.driver?.fullName || "---";
      plateField[2].textContent = data?.vehicle?.type || "---";
      plateField[3].textContent = data?.vehicle?.brand || "---";
      plateField[4].textContent = data?.vehicle?.model || "---";
    }

    scheduleGateReset();
  };

  const SLOT_ASSIGNMENTS_KEY = "dashboard_camera_slot_assignments_v1";
  const CAMERA_TIMEOUT_MS = 4000;
  const STREAMS_REFRESH_MS = 3000;
  const FRAME_POLL_MS = 1000;

  const cameraCards = Array.from(
    document.querySelectorAll(".camera-previews .camera-card"),
  );

  const slots = cameraCards.map((card, index) => {
    const img = card.querySelector("[data-camera-image]");
    const labelChip = card.querySelector(".camera-label-chip");
    const cameraName = card.querySelector(".camera-name");
    const statusPill = card.querySelector("[data-camera-status]");
    const selectEl = card.querySelector("[data-camera-select]");
    const refreshBtn = card.querySelector("[data-camera-refresh]");
    const assignedText = card.querySelector("[data-camera-assigned]");

    return {
      key: `slot_${index + 1}`,
      card,
      img,
      labelChip,
      cameraName,
      statusPill,
      assignedText,
      selectEl,
      refreshBtn,
      assignedStreamId: null,
      lastFrameTs: null,
      lastImageUrl: "",
    };
  });

  let availableStreams = [];

  function readAssignments() {
    try {
      const raw = localStorage.getItem(SLOT_ASSIGNMENTS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveAssignments() {
    const payload = {};
    slots.forEach((slot) => {
      payload[slot.key] = slot.assignedStreamId || "";
    });
    localStorage.setItem(SLOT_ASSIGNMENTS_KEY, JSON.stringify(payload));
  }

  function applySavedAssignments() {
    const saved = readAssignments();
    slots.forEach((slot) => {
      const streamId = String(saved?.[slot.key] || "").trim();
      slot.assignedStreamId = streamId || null;
    });
  }

  function updateSlotStatus(slot, isOnline) {
    if (!slot?.statusPill) return;

    slot.statusPill.classList.toggle("online", !!isOnline);
    slot.statusPill.classList.toggle("offline", !isOnline);
    slot.statusPill.innerHTML = `<i class="fas fa-circle"></i> ${
      isOnline ? "Online" : "Offline"
    }`;

    if (!isOnline && slot?.img && !slot.img.src.includes("no-video.png")) {
      slot.img.src = "images/no-video.png";
    }
  }

  function bindSlotActions(slot) {
    if (slot.selectEl && !slot.selectEl.dataset.bound) {
      slot.selectEl.addEventListener("change", (evt) => {
        const value = String(evt.target.value || "").trim();
        slot.assignedStreamId = value || null;
        slot.lastFrameTs = null;
        slot.lastImageUrl = "";
        saveAssignments();
        renderSlots();
      });
      slot.selectEl.dataset.bound = "true";
    }

    if (slot.refreshBtn && !slot.refreshBtn.dataset.bound) {
      slot.refreshBtn.addEventListener("click", async () => {
        await fetchStreams();
      });
      slot.refreshBtn.dataset.bound = "true";
    }
  }

  function autoAssignEmptySlots() {
    const assigned = new Set(
      slots.map((slot) => slot.assignedStreamId).filter(Boolean),
    );

    const freeStreams = availableStreams
      .map((x) => x.stream_id)
      .filter((id) => id && !assigned.has(id));

    slots.forEach((slot) => {
      if (slot.assignedStreamId) return;
      const next = freeStreams.shift();
      if (next) slot.assignedStreamId = next;
    });
  }

  function renderSlots() {
    slots.forEach((slot, index) => {
      bindSlotActions(slot);

      const selected = slot.assignedStreamId || "";
      const onlineInfo = availableStreams.find(
        (s) => s.stream_id === slot.assignedStreamId,
      );

      const options = [
        `<option value="">Not paired</option>`,
        ...availableStreams.map(
          (stream) => `
            <option value="${stream.stream_id}" ${
              stream.stream_id === selected ? "selected" : ""
            }>
              ${stream.stream_id}
            </option>
          `,
        ),
      ].join("");

      if (slot.selectEl) {
        slot.selectEl.innerHTML = options;
        slot.selectEl.value = selected;
      }

      const title = selected || `Camera Slot ${index + 1}`;
      if (slot.labelChip) slot.labelChip.textContent = title;
      if (slot.cameraName) slot.cameraName.textContent = title;
      if (slot.assignedText) {
        slot.assignedText.textContent = selected || "Not paired";
      }

      if (!selected) {
        updateSlotStatus(slot, false);
        if (slot.img) slot.img.src = "images/no-video.png";
        return;
      }

      const isOnline =
        !!onlineInfo &&
        (onlineInfo.is_online === true ||
          (typeof slot.lastFrameTs === "number" &&
            Date.now() - slot.lastFrameTs <= CAMERA_TIMEOUT_MS));

      updateSlotStatus(slot, isOnline);
    });
  }

  async function fetchStreams() {
    try {
      const resp = await fetch(STREAMS_ENDPOINT, {
        method: "GET",
        cache: "no-store",
      });

      if (!resp.ok) {
        throw new Error(`Failed to load streams (${resp.status})`);
      }

      const result = await resp.json();
      availableStreams = Array.isArray(result?.streams) ? result.streams : [];

      autoAssignEmptySlots();
      saveAssignments();
      renderSlots();
    } catch (err) {
      console.error("[streams] fetch error:", err);
      availableStreams = [];
      renderSlots();
    }
  }

  function updateSlotFrame(streamId, ts) {
    const matchedSlots = slots.filter(
      (slot) => slot.assignedStreamId && slot.assignedStreamId === streamId,
    );

    matchedSlots.forEach((slot) => {
      slot.lastFrameTs = Date.now();
      updateSlotStatus(slot, true);

      if (slot.img) {
        const nextSrc = `${AI_URL}/latest-frame?stream_id=${encodeURIComponent(
          streamId,
        )}&ts=${ts || Date.now()}`;

        slot.lastImageUrl = nextSrc;
        slot.img.src = nextSrc;
      }
    });
  }

  async function pollAssignedFrames() {
    for (const slot of slots) {
      const streamId = slot.assignedStreamId;
      if (!streamId) continue;

      const streamInfo = availableStreams.find((s) => s.stream_id === streamId);
      if (!streamInfo?.is_online) {
        updateSlotStatus(slot, false);
        continue;
      }

      const nextSrc = `${AI_URL}/latest-frame?stream_id=${encodeURIComponent(
        streamId,
      )}&ts=${Date.now()}`;

      if (slot.img) {
        slot.img.src = nextSrc;
        slot.lastImageUrl = nextSrc;
        slot.lastFrameTs = Date.now();
        updateSlotStatus(slot, true);
      }
    }
  }

  function monitorCameraTimeouts() {
    slots.forEach((slot) => {
      if (!slot.assignedStreamId) {
        updateSlotStatus(slot, false);
        return;
      }

      if (slot.lastFrameTs === null) {
        const info = availableStreams.find(
          (s) => s.stream_id === slot.assignedStreamId,
        );
        updateSlotStatus(slot, !!info?.is_online);
        return;
      }

      const diff = Date.now() - slot.lastFrameTs;
      if (diff > CAMERA_TIMEOUT_MS) {
        updateSlotStatus(slot, false);
      }
    });
  }

  applySavedAssignments();
  renderSlots();
  fetchStreams();

  setInterval(fetchStreams, STREAMS_REFRESH_MS);
  setInterval(monitorCameraTimeouts, 1000);
  setInterval(pollAssignedFrames, FRAME_POLL_MS);

  if (channel) {
    console.log("[Pusher] binding gate-update handler");
    channel.bind("gate-update", async (data) => {
      console.log("[Pusher] gate-update event received", data);
      handleGateUpdate(data);

      loadDashboardStats();
      loadChart();
      loadActivityFeed();
    });
  } else {
    console.warn("[Pusher] gate channel is not available");
  }

  if (videoChannel) {
    console.log("[Pusher] binding video frame handler");
    videoChannel.bind("frame", (data) => {
      console.log("[video-channel/frame]", data);

      const streamId = String(data?.stream_id || "").trim();
      if (!streamId) return;

      const ts = data?.ts || Date.now();
      updateSlotFrame(streamId, ts);
    });
  } else {
    console.warn("[Pusher] video channel is not available");
  }
});