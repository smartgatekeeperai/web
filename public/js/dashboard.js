// public/js/dashboard.js

document.addEventListener("DOMContentLoaded", async () => {
  const RESOLUTION_CONFIG = {
    hour: {
      unit: "hours",
      label: "Last",
      ranges: [6, 12, 24],
      labelFormatter: (range) =>
        Array.from({ length: range }, (_, i) => {
          const diff = range - 1 - i;
          return diff === 0 ? "Now" : `-${diff}h`;
        }),
    },
    day: {
      unit: "days",
      label: "Last",
      ranges: [3, 7, 14],
      labelFormatter: (range) =>
        Array.from({ length: range }, (_, i) => {
          const diff = range - 1 - i;
          return diff === 0 ? "Today" : `-${diff}d`;
        }),
    },
    week: {
      unit: "weeks",
      label: "Last",
      ranges: [4, 8, 12],
      labelFormatter: (range) =>
        Array.from({ length: range }, (_, i) => {
          const diff = range - 1 - i;
          return diff === 0 ? "This week" : `-${diff}w`;
        }),
    },
  };

  const ctx = document.getElementById("peakHoursChart")?.getContext("2d");
  const legendContainer = document.getElementById("chartLegend");
  const rangeSelect = document.getElementById("rangeSelect");
  const chipsContainer = document.getElementById("resolutionChips");

  const COLORS = {
    cars: "rgba(52, 152, 219, 1)",
    motorcycles: "rgba(231, 76, 60, 1)",
    vans: "rgba(39, 174, 96, 1)",
  };

  let currentResolution = "hour";
  let currentRange = RESOLUTION_CONFIG[currentResolution].ranges[0];
  let chartInstance = null;

  async function fetchTrafficData(resolution, range) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const points = range;

    const makeSeries = (base, variance = 25) =>
      Array.from({ length: points }, (_, i) => {
        const wave = Math.sin(i / 1.3) * 15;
        const noise = Math.random() * variance - variance / 2;
        return Math.max(0, Math.round(base + wave + noise));
      });

    let baseCars, baseMoto, baseVans;
    if (resolution === "hour") {
      baseCars = 80;
      baseMoto = 70;
      baseVans = 50;
    } else if (resolution === "day") {
      baseCars = 400;
      baseMoto = 320;
      baseVans = 220;
    } else {
      baseCars = 2000;
      baseMoto = 1600;
      baseVans = 1100;
    }

    return {
      labels: RESOLUTION_CONFIG[resolution].labelFormatter(range),
      datasets: {
        cars: makeSeries(baseCars),
        motorcycles: makeSeries(baseMoto),
        vans: makeSeries(baseVans),
      },
    };
  }

  function renderLegend() {
    if (!legendContainer) return;

    const items = [
      { label: "Cars", color: COLORS.cars },
      { label: "Motorcycles", color: COLORS.motorcycles },
      { label: "Vans", color: COLORS.vans },
    ];

    legendContainer.innerHTML = items
      .map(
        (item) => `
          <div class="legend-item">
            <div class="legend-color" style="background-color: ${item.color};"></div>
            <span>${item.label}</span>
          </div>
        `
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
        `
      )
      .join("");
    currentRange = cfg.ranges[0];
  }

  async function loadChart() {
    if (!ctx) return;

    const { labels, datasets } = await fetchTrafficData(
      currentResolution,
      currentRange
    );

    const data = {
      labels,
      datasets: [
        {
          label: "Cars",
          data: datasets.cars,
          borderColor: COLORS.cars,
          backgroundColor: "rgba(52,152,219,0.1)",
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBorderWidth: 2,
          tension: 0.35,
          fill: true,
        },
        {
          label: "Motorcycles",
          data: datasets.motorcycles,
          borderColor: COLORS.motorcycles,
          backgroundColor: "rgba(231,76,60,0.08)",
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBorderWidth: 2,
          tension: 0.35,
          fill: false,
        },
        {
          label: "Vans",
          data: datasets.vans,
          borderColor: COLORS.vans,
          backgroundColor: "rgba(39,174,96,0.08)",
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
            label: (context) => {
              const value = context.parsed.y || 0;
              return `${context.dataset.label}: ${value} vehicles`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#6b7280", maxRotation: 0 },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(209,213,219,0.4)", drawBorder: false },
          ticks: { color: "#9ca3af" },
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

  renderLegend();
  updateRangeSelect();
  loadChart();

  const activityList = document.getElementById("activityList");
  const activityModeChips = document.getElementById("activityModeChips");
  const activityHistoryFilters = document.getElementById("activityHistoryFilters");
  const activityResolutionChips = document.getElementById("activityResolutionChips");
  const activityRangeSelect = document.getElementById("activityRangeSelect");
  const liveDot = document.getElementById("liveDot");
  const activityModeLabel = document.getElementById("activityModeLabel");

  let activityMode = "live";
  let activityResolution = "hour";
  let activityRange = RESOLUTION_CONFIG[activityResolution].ranges[0];

  const STATIC_LIVE_EVENTS = [
    {
      plate: "ABC-123",
      status: "registered",
      timeLabel: "10:30 AM",
      vehicleType: "Sedan",
      driver: "John Doe",
      source: "Registered plate",
      reason: "",
      thumbnailUrl: "images/no-video.png",
    },
    {
      plate: "XYZ-789",
      status: "not-registered",
      timeLabel: "10:25 AM",
      vehicleType: "Pickup",
      driver: "",
      source: "",
      reason: "Plate not found in registry",
      thumbnailUrl: "images/no-video.png",
    },
    {
      plate: "DEF-456",
      status: "registered",
      timeLabel: "10:20 AM",
      vehicleType: "Motorcycle",
      driver: "Jane Smith",
      source: "RFID sticker",
      reason: "",
      thumbnailUrl: "images/no-video.png",
    },
  ];

  function renderActivity(events) {
    if (!activityList) return;

    activityList.innerHTML = events
      .map((evt) => {
        const statusClass =
          evt.status === "registered" ? "registered" : "not-registered";
        const statusLabel =
          evt.status === "registered" ? "Registered" : "Not registered";
        const metaLine =
          evt.status === "registered"
            ? evt.driver
              ? `<strong>Driver:</strong> ${evt.driver} · <strong>Source:</strong> ${evt.source}`
              : `<strong>Source:</strong> ${evt.source || "Plate recognition"}`
            : `<strong>Reason:</strong> ${evt.reason || "Unknown"}`;

        return `
          <div class="activity-item">
            <div class="activity-thumbnail">
              <img src="${evt.thumbnailUrl}" alt="Captured frame for ${evt.plate}" />
            </div>
            <div class="activity-details">
              <div class="activity-main-row">
                <span class="badge-plate">${evt.plate}</span>
              </div>
              <div class="activity-sub-row">
                <span><i class="far fa-clock"></i> ${evt.timeLabel}</span>
                <span>${evt.vehicleType}</span>
              </div>
              <div class="activity-meta">${metaLine}</div>
            </div>
            <div class="activity-confidence-badge ${statusClass}">${statusLabel}</div>
          </div>
        `;
      })
      .join("");
  }

  async function fetchActivityHistory(resolution, range) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const labels = RESOLUTION_CONFIG[resolution].labelFormatter(range);

    return labels.map((lbl, index) => {
      const isRegistered = Math.random() > 0.25;
      return {
        plate: ["ABC-123", "XYZ-789", "DEF-456", "JHK-771"][index % 4],
        status: isRegistered ? "registered" : "not-registered",
        timeLabel: lbl,
        vehicleType: ["Sedan", "Pickup", "Motorcycle"][index % 3],
        driver: isRegistered
          ? ["John Doe", "Jane Smith", "Alex Cruz"][index % 3]
          : "",
        source: isRegistered ? "Plate recognition" : "",
        reason: !isRegistered ? "Plate not found in registry" : "",
        thumbnailUrl: "images/no-video.png",
      };
    });
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
        `
      )
      .join("");
    activityRange = cfg.ranges[0];
  }

  async function loadHistoryActivity() {
    const events = await fetchActivityHistory(activityResolution, activityRange);
    renderActivity(events);
  }

  function setMode(newMode) {
    activityMode = newMode;

    if (activityMode === "live") {
      liveDot?.classList.add("on");
      if (activityModeLabel) {
        activityModeLabel.textContent = "Live · Last 20 events";
      }
      if (activityHistoryFilters) {
        activityHistoryFilters.style.display = "none";
      }
      renderActivity(STATIC_LIVE_EVENTS);
    } else {
      liveDot?.classList.remove("on");
      const cfg = RESOLUTION_CONFIG[activityResolution];
      if (activityModeLabel) {
        activityModeLabel.textContent = `History · ${cfg.label} ${activityRange} ${cfg.unit}`;
      }
      if (activityHistoryFilters) {
        activityHistoryFilters.style.display = "flex";
      }
      loadHistoryActivity();
    }
  }

  activityModeChips?.addEventListener("click", (evt) => {
    const chip = evt.target.closest(".chip");
    if (!chip) return;
    const mode = chip.dataset.mode;
    if (!mode || mode === activityMode) return;

    activityModeChips.querySelectorAll(".chip").forEach((btn) => {
      btn.classList.toggle("active", btn === chip);
    });

    setMode(mode);
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
    if (activityMode === "history") loadHistoryActivity();
  });

  activityRangeSelect?.addEventListener("change", (evt) => {
    activityRange = Number(evt.target.value) || activityRange;
    if (activityMode === "history") loadHistoryActivity();
  });

  updateActivityRangeSelect();
  setMode("live");

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

    if (gateVehicleImg) gateVehicleImg.src = "images/car.png";

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

  const AI_URL = String(window.getAIURL?.() || "").replace(/\/+$/, "");
  const STREAMS_ENDPOINT = `${AI_URL}/streams`;
  const SLOT_ASSIGNMENTS_KEY = "dashboard_camera_slot_assignments_v1";
  const CAMERA_TIMEOUT_MS = 4000;
  const STREAMS_REFRESH_MS = 3000;
  const FRAME_POLL_MS = 1000;

  const cameraCards = Array.from(
    document.querySelectorAll(".camera-previews .camera-card")
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
      slots.map((slot) => slot.assignedStreamId).filter(Boolean)
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
        (s) => s.stream_id === slot.assignedStreamId
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
          `
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
      (slot) => slot.assignedStreamId && slot.assignedStreamId === streamId
    );

    matchedSlots.forEach((slot) => {
      slot.lastFrameTs = Date.now();
      updateSlotStatus(slot, true);

      if (slot.img) {
        const nextSrc = `${AI_URL}/latest-frame?stream_id=${encodeURIComponent(
          streamId
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
        streamId
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
          (s) => s.stream_id === slot.assignedStreamId
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
    channel.bind("gate-update", (data) => {
      console.log("[Pusher] gate-update event received", data);
      handleGateUpdate(data);
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