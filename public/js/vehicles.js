// public/js/vehicles.js

document.addEventListener("DOMContentLoaded", () => {
  let tableData = [];
  const params = new URLSearchParams(window.location.search);
  const filterDriver = params.get("driver"); // "123"
  const filterDriverName = params.get("driverName"); // "123"

  document.querySelector(".page-subtitle").classList.add("show");
  document.querySelector(".filter-results").classList.remove("show");
  document.querySelector(".page-controls").classList.remove("show");
  if (filterDriver && filterDriverName) {
    document.querySelector(".page-subtitle").classList.remove("show");
    document.querySelector(".filter-results").classList.add("show");
    document.querySelector(".page-controls").classList.add("show");
    document
      .querySelector(".filter-results")
      .querySelector("#driver-details").innerHTML = filterDriverName;
  } else if (
    (!filterDriver && filterDriverName) ||
    (filterDriver && !filterDriverName)
  ) {
    window.location.href = "vehicles";
  }

  const table = document.querySelector(".table-container table");
  const tbody =
    document.getElementById("vehicles-tbody") || table?.querySelector("tbody");
  const addBtn = document.getElementById("add-driver-btn");

  function resizeTable() {
    let draftHeight = document.querySelector(".content")?.clientHeight ?? 0;
    draftHeight =
      draftHeight -
      40 -
      (document.querySelector(".content .page-subtitle.show")?.clientHeight ??
        0) -
      15 -
      (document.querySelector(".content .filter-results.show")?.clientHeight ??
        0) -
      15 -
      (document.querySelector(".content .page-controls.show")?.clientHeight ??
        0) -
      16;
    document.querySelector(".table-container").style.maxHeight =
      draftHeight + "px";
    document.querySelector(".table-container table thead .filters").style.top =
      (document.querySelectorAll(".table-container table thead tr")[0]
        ?.clientHeight ?? 0) -
      2 +
      "px";
  }

  window.addEventListener("resize", () => {
    resizeTable();
  });
  if (!table || !tbody) return;

  // -------------------------------------------------------
  // FILTER INPUTS  // <<< FILTERS
  // -------------------------------------------------------
  const filterInputs = {
    driver: document.getElementById("filterVehicleDriver"),
    id: document.getElementById("filterVehicleId"),
    plateNumber: document.getElementById("filterVehiclePlatenumber"),
    type: document.getElementById("filterVehicleType"),
    brand: document.getElementById("filterVehicleBrand"),
    model: document.getElementById("filterVehicleModel"),
  };

  function normalize(value) {
    // <<< FILTERS
    return String(value ?? "").toLowerCase();
  }

  /* -------------------------------------------------------
   * Helpers to map between <tr> and vehicle object
   * -----------------------------------------------------*/
  function createRow(vehicle) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <button class="table-icon-btn btn-view" title="View vehicle" type="button">
          <i class="fa fa-eye"></i>
        </button>
      </td>
      <td>${vehicle.driver?.fullName}</td>
      <td>${vehicle.id}</td>
      <td>${vehicle.plateNumber}</td>
      <td>${vehicle.type}</td>
      <td>${vehicle.model}</td>
      <td>${vehicle.brand}</td>
      <td>
        <button class="table-icon-btn btn-delete" title="Delete driver" type="button">
          <i class="fa fa-trash"></i>
        </button>
      </td>
    `;
    return tr;
  }

  function renderEmptyRow(message) {
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="6" style="text-align:center; padding: 20px; color:#7f8c8d;">
        ${message}
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Generic renderer that can render any subset of data // <<< FILTERS
  function renderRows(rows) {
    if (!rows || !rows.length) {
      renderEmptyRow("No drivers match filters.");
      return;
    }

    tbody.innerHTML = "";
    rows.forEach((item) => {
      const tr = createRow(item);
      tbody.appendChild(tr);
    });
  }

  // Apply filters on tableData and re-render               // <<< FILTERS
  function applyFilters() {
    if (!tableData.length) {
      renderEmptyRow("No drivers found.");
      return;
    }

    const driverFilter = normalize(filterInputs.driver?.value);
    const idFilter = normalize(filterInputs.id?.value);
    const plateNumberFilter = normalize(filterInputs.plateNumber?.value);
    const typeFilter = normalize(filterInputs.type?.value);
    const brandFilter = normalize(filterInputs.brand?.value);
    const modelFilter = normalize(filterInputs.model?.value);

    const filtered = tableData.filter((vehicle) => {
      const driverText = normalize(vehicle.driver?.fullName);
      const idText = normalize(vehicle.id);
      const plateNumberText = normalize(vehicle.plateNumber);
      const typeText = normalize(vehicle.type);
      const brandText = normalize(vehicle.brand);
      const modelText = normalize(vehicle.model);

      if (driverFilter && !driverText.includes(driverFilter)) return false;
      if (idFilter && !idText.includes(idFilter)) return false;
      if (plateNumberFilter && !plateNumberText.includes(plateNumberFilter))
        return false;
      if (typeFilter && !typeText.includes(typeFilter)) return false;
      if (brandFilter && !brandText.includes(brandFilter)) return false;
      if (modelFilter && !modelText.includes(modelFilter)) return false;
      return true;
    });

    renderRows(filtered);
  }

  // Wire filter inputs to applyFilters on each change      // <<< FILTERS
  Object.values(filterInputs).forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => {
      applyFilters();
    });
  });

  /* -------------------------------------------------------
   * LOAD FROM API
   * -----------------------------------------------------*/
  async function loadVehicles() {
    tbody.innerHTML = "";
    tableData = [];
    renderEmptyRow("Loading vehicles...");

    try {
      let offset = 0;
      while (true) {
        const resp = await fetch(
          `/api/vehicles?limit=10&offset=${offset}${
            filterDriver ? "&driver=" + filterDriver : ""
          }`
        );
        if (!resp.ok) throw new Error("Failed to fetch vehicles");

        const data = await resp.json();
        const chunk = data?.data ?? [];
        tableData = tableData.concat(chunk);

        offset += chunk.length;

        const total = data.total ?? tableData.length;
        if (offset >= total || chunk.length === 0) break;
      }

      if (!tableData.length) {
        renderEmptyRow("No vehicles found.");
        return;
      }
      tbody.innerHTML = "";

      tableData.forEach((item) => {
        const tr = createRow(item);
        tbody.appendChild(tr);
      });

      applyFilters(); // <<< FILTERS
      resizeTable();
    } catch (err) {
      console.error(err);
      renderEmptyRow("Failed to load vehicles.");
      // Optional: pop an alert on load error
      window
        .showAlert({
          type: "error",
          title: "Load failed",
          message: "Unable to load vehicles. Please refresh the page.",
        })
        .catch(() => {});
    }
  }

  // Initial load
  loadVehicles();

  /* -------------------------------------------------------
   * ADD DATA
   * -----------------------------------------------------*/
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const vehicleBrands = window.getVehicleBrands();

      // Show form modal. onSubmit controls when it closes.
      window.showFormModal({
        title: "Add Vehicle",
        variant: "info",
        submitText: "Save Vehicle",
        cancelText: "Cancel",
        backdropClosable: false,
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                <h3>Driver Information</h3>
              </label>
              <label>
                <div class="details-item">Full Name: <span>${filterDriverName}</span></div>
              </label>
              <label>
                <h3>Vehicle Information</h3>
              </label>
              <label>
                Type *
                <select id="vehicle-type-input">
                  <option value="" disabled selected hidden>Select vehicle type</option>
                  <option value="Car">Car</option>
                  <option value="Pickup">Pickup</option>
                  <option value="Utility Vehicle">Utility Vehicle</option>
                  <option value="Motorcycle">Motorcycle</option>
                  <option value="Truck">Truck</option>
                  <option value="Bus">Bus</option>
                </select>
              </label>
              <label>
                Plate number *
                <input type="text" id="vehicle-plateNumber-input" placeholder="Plate number" />
              </label>
              <label>
                Brand *
                <div class="autocomplete-wrapper">
                  <input
                    type="text"
                    id="vehicle-brand-input"
                    placeholder="Start typing vehicle brand..."
                    autocomplete="off"
                  />
                  <div class="autocomplete-list" id="vehicle-brand-list"></div>
                </div>
              </label>
              <label>
                Model *
                <input type="text" id="vehicle-model-input" placeholder="Model" />
              </label>
            </div>
          `;

          const brandInput = bodyEl.querySelector("#vehicle-brand-input");
          const brandList = bodyEl.querySelector("#vehicle-brand-list");
          window.setupAutocomplete(brandInput, brandList, vehicleBrands);
        },
        onSubmit: async ({ close }) => {
          const plateNumber = document
            .getElementById("vehicle-plateNumber-input")
            ?.value.trim();
          const type = document
            .getElementById("vehicle-type-input")
            ?.value.trim();
          const model = document
            .getElementById("vehicle-model-input")
            ?.value.trim();
          const vehicleBrand = document
            .getElementById("vehicle-brand-input")
            ?.value.trim();

          if (!plateNumber || !type || !model || !vehicleBrand) {
            await window.showAlert({
              type: "error",
              title: "Missing fields",
              message: "Please fill the missing fields",
            });
            // Keep form open
            return;
          }

          const result = await window.showConfirm({
            title: "Save vehicle?",
            message: `Do you really want to save vehicle <b>${plateNumber}</b>?`,
            yesText: "Yes, save vehicle",
            noText: "No",
            cancelText: "Cancel",
            showNo: false,
            showCancel: true,
            variant: "confirm",
          });
          if (result !== "yes") return;

          try {
            const payload = {
              driverId: filterDriver,
              plateNumber,
              type,
              model,
              brand: vehicleBrand,
            };

            const resp = await fetch("/api/vehicles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              const error = await resp.json();
              await window.showAlert({
                type: "error",
                title: "Failed to create vehicle",
                message: `Failed to create vehicle (${
                  error?.message ?? resp.status
                })`,
              });
              return;
            }

            const created = await resp.json();
            const vehicle = created.data;

            await window.showAlert({
              type: "success",
              title: "Vehicle created",
              message: `Vehicle <b>${vehicle.plateNumber}</b> was created successfully.`,
              backdropClosable: false,
            });

            // Now actually close the form modal
            close();
            await loadVehicles(); // reload and reapply filters
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Create failed",
              message:
                err?.message ?? "Unable to create vehicle. Please try again.",
            });
            // Keep form open so user can retry / adjust
          }
        },
      });
    });
  }

  /* -------------------------------------------------------
   * VIEW via delegated click
   * -----------------------------------------------------*/
  table.addEventListener("click", async (event) => {
    const viewBtn = event.target.closest(".btn-view");
    const deleteBtn = event.target.closest(".btn-delete");
    if (!viewBtn && !deleteBtn) return;
    const row = event.target.closest("tr");
    if (!row) return;

    const vehicle = tableData.find(
      (x) => x.id === row.querySelectorAll("td")[2]?.textContent.trim()
    );

    const vehicleBrands = window.getVehicleBrands();
    /* ------------------- VIEW ------------------- */
    if (viewBtn) {
      await window.showFormModal({
        title: `View Vehicle #${vehicle.plateNumber}`,
        variant: "info",
        submitText: "Save Changes",
        cancelText: "Close",
        backdropClosable: false,
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                <h3>Driver Information</h3>
              </label>
              <label>
                <div class="details-item">Full Name: <span>${
                  vehicle.driver?.fullName
                }</span></div>
                <div class="details-item">Role: <span>${
                  vehicle.driver?.roleType
                }</span></div>
                <div class="details-item">Gender: <span>${
                  vehicle.driver?.gender
                }</span></div>
              </label>
              <label>
                <h3>Vehicle Information</h3>
              </label>
              <label>
                Vehicle ID
                <input type="text" id="vehicle-id-input" value="${
                  vehicle.id
                }" readonly />
              </label>
              <label>
                Plate number
                <input type="text" id="vehicle-plateNumber-input" placeholder="Plate number" value="${
                  vehicle.plateNumber
                }" />
              </label>
              <label>
                Type *
                <select id="vehicle-type-input">
                  <option value="" disabled selected hidden>Select vehicle type</option>
                  <option ${
                    vehicle.type.toLowerCase() === "car" ? "selected" : ""
                  } value="Car">Car</option>
                  <option ${
                    vehicle.type.toLowerCase() === "pickup"
                      ? "selected"
                      : ""
                  } value="Pickup">Pickup</option>
                  <option ${
                    vehicle.type.toLowerCase() === "utility vehicle"
                      ? "selected"
                      : ""
                  } value="Utility Vehicle">Utility Vehicle</option>
                  <option ${
                    vehicle.type.toLowerCase() === "motorcycle"
                      ? "selected"
                      : ""
                  } value="Motorcycle">Motorcycle</option>
                  <option ${
                    vehicle.type.toLowerCase() === "truck" ? "selected" : ""
                  } value="Truck">Truck</option>
                  <option ${
                    vehicle.type.toLowerCase() === "bus" ? "selected" : ""
                  } value="Bus">Bus</option>
                </select>
              </label>
              <label>
                Brand *
                <div class="autocomplete-wrapper">
                  <input
                    type="text"
                    id="vehicle-brand-input"
                    placeholder="Start typing vehicle brand..."
                    autocomplete="off"
                    value="${vehicle.brand}"
                  />
                  <div class="autocomplete-list" id="vehicle-brand-list"></div>
                </div>
              </label>
              <label>
                Model *
                <input type="text" id="vehicle-model-input" placeholder="Model" value="${
                  vehicle.model
                }"/>
              </label>
            </div>
          `;
          // wire up autocomplete after HTML is injected
          const brandInput = bodyEl.querySelector("#vehicle-brand-input");
          const brandList = bodyEl.querySelector("#vehicle-brand-list");
          window.setupAutocomplete(brandInput, brandList, vehicleBrands);
        },
        onSubmit: async ({ close }) => {
          const plateNumber = document
            .getElementById("vehicle-plateNumber-input")
            ?.value.trim();
          const type = document
            .getElementById("vehicle-type-input")
            ?.value.trim();
          const model = document
            .getElementById("vehicle-model-input")
            ?.value.trim();
          const vehicleBrand = document
            .getElementById("vehicle-brand-input")
            ?.value.trim();

          if (!plateNumber || !type || !model || !vehicleBrand) {
            await window.showAlert({
              type: "error",
              title: "Missing fields",
              message: "Please fill the missing fields",
            });
            // Keep form open
            return;
          }
          const result = await window.showConfirm({
            title: "Update vehicle?",
            message: `Do you really want to update vehicle <b>${vehicle?.id}</b>? This action cannot be undone.`,
            yesText: "Yes, update",
            noText: "No",
            cancelText: "Cancel",
            showNo: false,
            showCancel: true,
            variant: "confirm",
          });

          if (result !== "yes") return;
          try {
            const payload = {
              id: vehicle?.id,
              plateNumber,
              type,
              model,
              brand: vehicleBrand,
              driverId: vehicle?.driver?.id,
            };

            const resp = await fetch(`/api/vehicles`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              const error = await resp.json();
              await window.showAlert({
                type: "error",
                title: "Failed to update vehicle",
                message: `Failed to update vehicle (${
                  error?.message ?? resp.status
                })`,
              });
              return;
            }

            const updated = await resp.json().catch(() => ({}));
            const updatedVehicle = updated.data;

            await window.showAlert({
              type: "success",
              title: "Vehicle updated",
              message: `Vehicle <b>${updatedVehicle.plateNumber}</b> was updated successfully.`,
              backdropClosable: false,
            });

            close();
            await loadVehicles();
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Update failed",
              message: "Unable to update vehicle. Please try again.",
            });
          }
        },
      });
    }

    /* ------------------- DELETE ------------------- */
    if (deleteBtn) {
      const result = await window.showConfirm({
        title: "Delete vehicle?",
        message: `Do you really want to delete <b>${vehicle.plateNumber}</b>? This action cannot be undone.`,
        yesText: "Yes, delete",
        noText: "No",
        cancelText: "Cancel",
        showNo: false,
        showCancel: true,
        variant: "error",
      });

      if (result !== "yes") return;

      try {
        const resp = await fetch(
          `/api/vehicles/${encodeURIComponent(vehicle.id)}`,
          {
            method: "DELETE",
          }
        );

        if (!resp.ok) {
          throw new Error(`Failed to delete vehicle (${resp.status})`);
        }

        await window.showAlert({
          type: "success",
          title: "Vehicle deleted",
          message: `Vehicle <b>${vehicle.plateNumber}</b> was deleted.`,
          backdropClosable: false,
        });

        await loadVehicles(); // reload and reapply filters
      } catch (err) {
        console.error(err);
        await window.showAlert({
          type: "error",
          title: "Delete failed",
          message: "Unable to delete vehicle. Please try again.",
        });
      }
    }
  });
});
