/* Placeholder for dashboard.css */

document.addEventListener("DOMContentLoaded", () => {
  /* ------------------------------------------------
   * Shared time resolution config
   * ------------------------------------------------*/
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

  /* ------------------------------------------------
   * Peak Vehicle Flow (Chart.js)
   * ------------------------------------------------*/
  const ctx = document.getElementById("peakHoursChart").getContext("2d");
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
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
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
          grid: {
            display: false,
          },
          ticks: {
            color: "#6b7280",
            maxRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(209,213,219,0.4)",
            drawBorder: false,
          },
          ticks: {
            color: "#9ca3af",
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
  }

  chipsContainer.addEventListener("click", (evt) => {
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

  rangeSelect.addEventListener("change", (evt) => {
    currentRange = Number(evt.target.value) || currentRange;
    loadChart();
  });

  renderLegend();
  updateRangeSelect();
  loadChart();

  /* ------------------------------------------------
   * Live Activity Feed (Live + History filter)
   * ------------------------------------------------*/
  const aiURL = window.getAIURL();
  console.log("aiURL", aiURL);
  const activityList = document.getElementById("activityList");
  const activityModeChips = document.getElementById("activityModeChips");
  const activityHistoryFilters = document.getElementById(
    "activityHistoryFilters"
  );
  const activityResolutionChips = document.getElementById(
    "activityResolutionChips"
  );
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
      vehicleIcon: "fa-car-side",
      driver: "John Doe",
      source: "Registered plate",
      reason: "",
      confidence: 95,
      thumbnailUrl: "https://via.placeholder.com/80x50?text=ABC",
    },
    {
      plate: "XYZ-789",
      status: "not-registered",
      timeLabel: "10:25 AM",
      vehicleType: "Pickup",
      vehicleIcon: "fa-truck-pickup",
      driver: "",
      source: "",
      reason: "Plate not found in registry",
      confidence: 87,
      thumbnailUrl: "https://via.placeholder.com/80x50?text=XYZ",
    },
    {
      plate: "DEF-456",
      status: "registered",
      timeLabel: "10:20 AM",
      vehicleType: "Motorcycle",
      vehicleIcon: "fa-motorcycle",
      driver: "Jane Smith",
      source: "RFID sticker",
      reason: "",
      confidence: 92,
      thumbnailUrl: "https://via.placeholder.com/80x50?text=DEF",
    },
  ];

  function renderActivity(events) {
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
        const thumb =
          evt.thumbnailUrl || "https://via.placeholder.com/80x50?text=Frame";

        return `
          <div class="activity-item">
            <div class="activity-thumbnail">
              <img src="${thumb}" alt="Captured frame for ${evt.plate}" />
            </div>
            <div class="activity-details">
              <div class="activity-main-row">
                <span class="badge-plate">${evt.plate}</span>
              </div>
              <div class="activity-sub-row">
                <span><i class="far fa-clock"></i> ${evt.timeLabel}</span>
                <span>${evt.vehicleType}</span>
              </div>
              <div class="activity-meta">
                ${metaLine}
              </div>
            </div>
            <div class="activity-confidence-badge ${statusClass}">${statusLabel}</div>
          </div>
        `;
      })
      .join("");
  }

  // Fake async history source
  async function fetchActivityHistory(resolution, range) {
    await new Promise((resolve) => setTimeout(resolve, 250));

    const labels = RESOLUTION_CONFIG[resolution].labelFormatter(range);
    const types = [
      { type: "Sedan", icon: "fa-car-side" },
      { type: "Pickup", icon: "fa-truck-pickup" },
      { type: "Motorcycle", icon: "fa-motorcycle" },
    ];

    const events = labels.map((lbl, index) => {
      const isRegistered = Math.random() > 0.25;
      const t = types[index % types.length];

      return {
        plate: ["ABC-123", "XYZ-789", "DEF-456", "JHK-771"][index % 4],
        status: isRegistered ? "registered" : "not-registered",
        timeLabel: lbl,
        vehicleType: t.type,
        vehicleIcon: t.icon,
        driver: isRegistered
          ? ["John Doe", "Jane Smith", "Alex Cruz"][index % 3]
          : "",
        source: isRegistered ? "Plate recognition" : "",
        reason: !isRegistered ? "Plate not found in registry" : "",
        confidence: Math.round(80 + Math.random() * 20),
        thumbnailUrl: `https://via.placeholder.com/80x50?text=${
          isRegistered ? "REG" : "UNREG"
        }`,
      };
    });

    return events;
  }

  function updateActivityRangeSelect() {
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
    const events = await fetchActivityHistory(
      activityResolution,
      activityRange
    );
    renderActivity(events);
  }

  function setMode(newMode) {
    activityMode = newMode;

    if (activityMode === "live") {
      liveDot.classList.add("on");
      activityModeLabel.textContent = "Live · Last 20 events";
      activityHistoryFilters.style.display = "none";
      renderActivity(STATIC_LIVE_EVENTS);
    } else {
      liveDot.classList.remove("on");
      const cfg = RESOLUTION_CONFIG[activityResolution];
      activityModeLabel.textContent = `History · ${cfg.label} ${activityRange} ${cfg.unit}`;
      activityHistoryFilters.style.display = "flex";
      loadHistoryActivity();
    }
  }

  activityModeChips.addEventListener("click", (evt) => {
    const chip = evt.target.closest(".chip");
    if (!chip) return;
    const mode = chip.dataset.mode;
    if (!mode || mode === activityMode) return;

    activityModeChips.querySelectorAll(".chip").forEach((btn) => {
      btn.classList.toggle("active", btn === chip);
    });

    setMode(mode);
  });

  activityResolutionChips.addEventListener("click", (evt) => {
    const chip = evt.target.closest(".chip");
    if (!chip) return;
    const res = chip.dataset.resolution;
    if (!res || res === activityResolution) return;

    activityResolution = res;
    activityResolutionChips.querySelectorAll(".chip").forEach((btn) => {
      btn.classList.toggle("active", btn === chip);
    });
    updateActivityRangeSelect();
    if (activityMode === "history") {
      loadHistoryActivity();
    }
  });

  activityRangeSelect.addEventListener("change", (evt) => {
    activityRange = Number(evt.target.value) || activityRange;
    if (activityMode === "history") {
      loadHistoryActivity();
    }
  });

  // Init activity feed
  updateActivityRangeSelect();
  setMode("live");

  const pusher = new Pusher("437af9281329a965a6f7", { cluster: "ap1" });

  const channel = pusher.subscribe("gate-channel");
  const videoChannel = pusher.subscribe("video-channel");

  const band = document.querySelector(".gate-status-band");
  const label = document.querySelector(".gate-status-label");
  const plateField = document.querySelectorAll(".gate-info-item-value");
  const gateVehicleImg = document.querySelector(".gate-vehicle-img");

  const GATE_DETECT_TIMEOUT_MS = 15000;

  // keep track of the current reset timer
  let gateResetTimer = null;

  const reset = () => {
    band.classList.remove("registered", "not-registered");
    label.textContent = "NO VEHICLE";
    gateVehicleImg.src = "";

    document
      .querySelectorAll(".gate-info-item-value")
      .forEach((el) => (el.textContent = "---"));
  };

  // helper to schedule a reset safely (no stacking timeouts)
  const scheduleGateReset = () => {
    if (gateResetTimer) {
      clearTimeout(gateResetTimer);
    }
    gateResetTimer = setTimeout(() => {
      reset();
      gateResetTimer = null; // free reference
    }, GATE_DETECT_TIMEOUT_MS);
  };

  reset();

  channel.bind("gate-update", (data) => {
    console.log("gate-update ", data);

    // No vehicle on sensor – clear any pending reset and reset immediately
    if (!data.vehicleFound) {
      gateVehicleImg.src = "";
      band.classList.remove("registered", "not-registered");
      label.textContent = "NO VEHICLE";
      if (gateResetTimer) {
        clearTimeout(gateResetTimer);
        gateResetTimer = null;
      }
      reset();
      return;
    }
    gateVehicleImg.src = "images/car.png";

    // Vehicle present but no plate detected (unregistered / unknown)
    if (!data?.driver || !data?.vehicle) {
      band.classList.remove("registered");
      band.classList.add("not-registered");
      label.textContent = "NOT REGISTERED";
      scheduleGateReset();
      return;
    } else if (!data.plate) {
      band.classList.remove("registered", "not-registered");
      label.textContent = "NO VEHICLE";
      reset();
      return;
    }
    band.classList.remove("not-registered");
    band.classList.add("registered");
    label.textContent = "REGISTERED";

    // Plate found
    if (plateField && plateField.length > 0) {
      plateField[0].textContent = data?.vehicle?.plate;
      plateField[1].textContent = data?.driver?.fullName;
      plateField[2].textContent = data?.vehicle?.type;
      plateField[3].textContent = data?.vehicle?.brand;
      plateField[4].textContent = data?.vehicle?.model;

      setTimeout(() => {
        const type = data?.type?.toLowerCase() || "";
        if (type.includes("motorcycle")) {
          gateVehicleImg.src = "images/motorcycle.png";
        } else if (type.includes("truck")) {
          gateVehicleImg.src = "images/truck.png";
        } else if (type.includes("bus")) {
          gateVehicleImg.src = "images/bus.png";
        } else if (type.includes("utility vehicle")) {
          gateVehicleImg.src = "images/van.png";
        } else if (type.includes("pickup")) {
          gateVehicleImg.src = "images/pickup.png";
        } else {
          gateVehicleImg.src = "images/car.png";
        }
      }, 100);
    }


    // schedule a single reset for this detection
    scheduleGateReset();
  });

  // ----------------------------------------------------
  // CAMERA STREAM + ONLINE/OFFLINE DETECTION
  // ----------------------------------------------------

  // Choose the <img> element that will show the stream
  const liveImg = document.querySelector(
    ".camera-previews .camera-card:first-child .camera-thumb img"
  );

  // Status pill for that same camera
  const cameraStatusPill = document.querySelector(
    ".camera-previews .camera-card:first-child .camera-status-pill"
  );

  // How long (ms) without frames before we consider the camera offline
  const CAMERA_TIMEOUT_MS = 2000;

  let lastFrameTs = null;

  function updateCameraStatus(isOnline) {
    if (!cameraStatusPill) return;

    cameraStatusPill.classList.toggle("online", isOnline);
    cameraStatusPill.classList.toggle("offline", !isOnline);
    cameraStatusPill.innerHTML = `<i class="fas fa-circle"></i> ${
      isOnline ? "Online" : "Offline"
    }`;
    if (!isOnline && !liveImg.src.includes("no-video.png")) {
      // only reset preview when actually offline
      liveImg.src = "images/no-video.png";
    }
  }

  // Start as offline until the first frame arrives
  updateCameraStatus(false);

  // Heartbeat: called whenever we get a new frame
  videoChannel.bind("frame", (data) => {
    const streamId = data.stream_id || "mobile-1";
    const ts = data.ts || Date.now();

    lastFrameTs = Date.now();
    updateCameraStatus(true);

    // This will fetch the latest JPEG; `ts` is just cache-busting
    liveImg.src = `${window.getAIURL()}/latest-frame?stream_id=${encodeURIComponent(
      streamId
    )}&ts=${ts}`;
  });

  // Periodically check if we've stopped receiving frames
  setInterval(() => {
    if (lastFrameTs === null) return; // never got a frame yet

    const diff = Date.now() - lastFrameTs;
    if (diff > CAMERA_TIMEOUT_MS) {
      updateCameraStatus(false);
    }
  }, 1000);
});
