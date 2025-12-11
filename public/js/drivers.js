// public/js/drivers.js

document.addEventListener("DOMContentLoaded", () => {
  let tableData = [];
  const table = document.querySelector(".table-container table");
  const tbody = document.getElementById("drivers-tbody") || table?.querySelector("tbody");
  const addBtn = document.getElementById("add-driver-btn");

  function resizeTable() {
    let draftHeight = document.querySelector(".content")?.clientHeight ?? 0;
    draftHeight = draftHeight - 40 - (document.querySelector(".content .page-subtitle")?.clientHeight ?? 0) - 15 - (document.querySelector(".content .page-controls")?.clientHeight ?? 0) - 16;
    document.querySelector(".table-container").style.maxHeight = draftHeight + "px";
    document.querySelector(".table-container table thead .filters").style.top = ((document.querySelectorAll(".table-container table thead tr")[0]?.clientHeight ?? 0) - 2) + "px";
  }
  
  window.addEventListener("resize", () => {
    resizeTable();
  });

  if (!table || !tbody) return;

  // -------------------------------------------------------
  // FILTER INPUTS  // <<< FILTERS
  // -------------------------------------------------------
  const filterInputs = {
    id: document.getElementById("filterDriverID"),
    fullName: document.getElementById("filterDriverName"),
    vehicles: document.getElementById("filterDriverVehicles"),
    roleType: document.getElementById("filterDriverRoleType"),
    identificationType: document.getElementById("filterIdentificationType"),
    identificationNumber: document.getElementById("filterIdentificationNumber"),
    gender: document.getElementById("filterGender"),
  };

  function normalize(value) { // <<< FILTERS
    return String(value ?? "").toLowerCase();
  }

  /* -------------------------------------------------------
   * Helpers to map between <tr> and driver object
   * -----------------------------------------------------*/
  function createRow(driver) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <button class="table-icon-btn btn-edit" title="Edit driver" type="button">
          <i class="fa fa-pen"></i>
        </button>
      </td>
      <td>${driver.id}</td>
      <td>${driver.fullName}</td>
      <td class="vehicle-col">
          <div class="view-wrapper">
            <a href="/vehicles?driver=${driver?.id}&driverName=${driver?.fullName}" class="table-icon-btn btn-view" title="View vehicle" type="button">
              <i class="fa fa-car"></i>
            </a>
            ${driver.vehicles?.length ? ("<ul>" +
              (driver.vehicles?.map((x, i) =>
                `<li>${x.brand} ${x.model}${i === driver.vehicles?.length - 1 ? "" : ","}</li>`
              ).join("\n") ?? "")
              + "</ul>") : "<span class='placeholder'>No vehicles found</span>"
            }
          </div>
      </td>
      <td>${driver.roleType}</td>
      <td>${driver.identificationType}</td>
      <td>${driver.identificationNumber}</td>
      <td>${driver.gender}</td>
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
      <td colspan="9" style="text-align:center; padding: 20px; color:#7f8c8d;">
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

    const idFilter = normalize(filterInputs.id?.value);
    const nameFilter = normalize(filterInputs.fullName?.value);
    const vehiclesFilter = normalize(filterInputs.vehicles?.value);
    const roleFilter = normalize(filterInputs.roleType?.value);
    const idTypeFilter = normalize(filterInputs.identificationType?.value);
    const idNumberFilter = normalize(filterInputs.identificationNumber?.value);
    const genderFilter = normalize(filterInputs.gender?.value);

    const filtered = tableData.filter((driver) => {
      const idText = normalize(driver.id);
      const nameText = normalize(driver.fullName);
      const roleText = normalize(driver.roleType);
      const idTypeText = normalize(driver.identificationType);
      const idNumberText = normalize(driver.identificationNumber);
      const genderText = normalize(driver.gender);

      // Build vehicles text (brand, model, plate, type)
      const vehiclesText = normalize(
        (driver.vehicles || [])
          .map((v) =>
            [
              v.brand,
              v.model,
              v.plateNumber,
              v.type,
            ]
              .filter(Boolean)
              .join(" ")
          )
          .join(" ")
      );

      if (idFilter && !idText.includes(idFilter)) return false;
      if (nameFilter && !nameText.includes(nameFilter)) return false;
      if (vehiclesFilter && !vehiclesText.includes(vehiclesFilter)) return false;
      if (roleFilter && !roleText.includes(roleFilter)) return false;
      if (idTypeFilter && !idTypeText.includes(idTypeFilter)) return false;
      if (idNumberFilter && !idNumberText.includes(idNumberFilter)) return false;
      if (genderFilter && !genderText.includes(genderFilter)) return false;

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
  async function loadDrivers() {
    tbody.innerHTML = "";
    tableData = [];
    renderEmptyRow("Loading drivers...");

    try {
      let offset = 0;
      while (true) {
        const resp = await fetch(`/api/drivers?limit=10&offset=${offset}`);
        if (!resp.ok) throw new Error("Failed to fetch drivers");

        const data = await resp.json();
        const chunk = data?.data ?? [];
        tableData = tableData.concat(chunk);

        offset += chunk.length;

        const total = data.total ?? tableData.length;
        if (offset >= total || chunk.length === 0) break;
      }

      if (!tableData.length) {
        renderEmptyRow("No drivers found.");
        return;
      }

      // Instead of rendering directly, always go through filters
      applyFilters(); // <<< FILTERS
      resizeTable();
    } catch (err) {
      console.error(err);
      renderEmptyRow("Failed to load drivers.");
      window
        .showAlert({
          type: "error",
          title: "Load failed",
          message: "Unable to load drivers. Please refresh the page.",
        })
        .catch(() => {});
    }
  }

  loadDrivers();

  /* -------------------------------------------------------
   * ADD DATA
   * -----------------------------------------------------*/
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const roleTypeOptions = window.createSelectOptions(window.getRoleTypes());
      const identificationTypeOptions = window.createSelectOptions(
        window.getIdentificationTypes()
      );
      const vehicleBrands = window.getVehicleBrands();

      // Show form modal. onSubmit controls when it closes.
      window.showFormModal({
        title: "Add Driver",
        variant: "info",
        submitText: "Save Driver",
        cancelText: "Cancel",
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                <h3>Driver Information</h3>
              </label>
              <label>
                Full name *
                <input type="text" id="driver-fullName-input" placeholder="Full name" />
              </label>
              <label>
                Role type *
                <select id="driver-roleType-input">
                 <option value="" disabled selected hidden>Select Role type</option>
                 ${roleTypeOptions}
                </select>
              </label>
              <label>
                Identification type *
                <select id="driver-identificationType-input">
                 <option value="" disabled selected hidden>Select Identification type</option>
                 ${identificationTypeOptions}
                </select>
              </label>
              <label>
                Identification number *
                <input type="text" id="driver-identificationNumber-input" placeholder="Identification number" />
              </label>
              <label>
                Gender
                <select id="driver-gender-input">
                  <option value="" disabled selected hidden>Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </label>
              <label>
                <h3>Vehicle Information</h3>
              </label>
              <label>
                Vehicle Type *
                <select id="driver-type-input">
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
                <input type="text" id="driver-plateNumber-input" placeholder="Plate number" />
              </label>
              <label>
                Vehicle brand *
                <div class="autocomplete-wrapper">
                  <input
                    type="text"
                    id="driver-vehicleBrand-input"
                    placeholder="Start typing vehicle brand..."
                    autocomplete="off"
                  />
                  <div class="autocomplete-list" id="driver-vehicleBrand-list"></div>
                </div>
              </label>
              <label>
                Model *
                <input type="text" id="driver-model-input" placeholder="Model" />
              </label>
            </div>
          `;

          const brandInput = bodyEl.querySelector("#driver-vehicleBrand-input");
          const brandList = bodyEl.querySelector("#driver-vehicleBrand-list");
          window.setupAutocomplete(brandInput, brandList, vehicleBrands);
        },
        onSubmit: async ({ close }) => {
          const fullName = document
            .getElementById("driver-fullName-input")
            ?.value.trim();
          const roleType = document
            .getElementById("driver-roleType-input")
            ?.value.trim();
          const identificationType = document
            .getElementById("driver-identificationType-input")
            ?.value.trim();
          const identificationNumber = document
            .getElementById("driver-identificationNumber-input")
            ?.value.trim();
          const gender = document
            .getElementById("driver-gender-input")
            ?.value.trim();
          const plateNumber = document
            .getElementById("driver-plateNumber-input")
            ?.value.trim();
          const type = document
            .getElementById("driver-type-input")
            ?.value.trim();
          const model = document
            .getElementById("driver-model-input")
            ?.value.trim();
          const vehicleBrand = document
            .getElementById("driver-vehicleBrand-input")
            ?.value.trim();

          if (
            !fullName ||
            !roleType ||
            !identificationType ||
            !identificationNumber ||
            !gender ||
            !plateNumber ||
            !type ||
            !model ||
            !vehicleBrand
          ) {
            await window.showAlert({
              type: "error",
              title: "Missing fields",
              message: "Please fill the missing fields",
            });
            // Keep form open
            return;
          }

          try {
            const payload = {
              fullName,
              roleType,
              identificationType,
              identificationNumber,
              gender,
              plateNumber,
              type,
              model,
              brand: vehicleBrand,
            };

            const resp = await fetch("/api/drivers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              const error = await resp.json();
              await window.showAlert({
                type: "error",
                title: "Failed to create driver",
                message: `Failed to create driver (${error?.message ?? resp.status})`,
              });
              return;
            }

            const created = await resp.json();
            const driver = created.data;

            await window.showAlert({
              type: "success",
              title: "Driver created",
              message: `Driver <b>${driver.fullName}</b> was created successfully.`,
            });

            // Now actually close the form modal
            close();
            await loadDrivers(); // reload and reapply filters
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Create failed",
              message: err?.message ?? "Unable to create driver. Please try again.",
            });
            // Keep form open so user can retry / adjust
          }
        },
      });
    });
  }

  /* -------------------------------------------------------
   * EDIT / DELETE via delegated click
   * -----------------------------------------------------*/
  table.addEventListener("click", async (event) => {
    const editBtn = event.target.closest(".btn-edit");
    const deleteBtn = event.target.closest(".btn-delete");

    if (!editBtn && !deleteBtn) return;

    const row = event.target.closest("tr");
    if (!row) return;

    const driver = tableData.find(
      (x) => String(x.id) === row.querySelectorAll("td")[1]?.textContent.trim()
    );
    if (!driver) return;

    const roleTypeOptions = window.createSelectOptions(
      window.getRoleTypes(),
      driver.roleType
    );
    const identificationTypeOptions = window.createSelectOptions(
      window.getIdentificationTypes(),
      driver.identificationType
    );

    /* ------------------- EDIT ------------------- */
    if (editBtn) {
      window.showFormModal({
        title: `Edit Driver #${driver.id}`,
        variant: "info",
        submitText: "Save Changes",
        cancelText: "Cancel",
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                Driver ID
                <input type="text" id="driver-id-input" value="${
                  driver.id
                }" readonly />
              </label>
              <label>
                Full name
                <input type="text" id="driver-fullName-input" placeholder="Full name" value="${
                  driver.fullName
                }" />
              </label>
              <label>
                Role type
                <select id="driver-roleType-input">
                 <option value="" disabled selected hidden>Role type</option>
                 ${roleTypeOptions}
                </select>
              </label>
              <label>
                Identification type
                <select id="driver-identificationType-input">
                 <option value="" disabled selected hidden>Identification type</option>
                 ${identificationTypeOptions}
                </select>
              </label>
              <label>
                Identification number
                <input type="text" id="driver-identificationNumber-input" placeholder="Identification number" value="${
                  driver.identificationNumber
                }"/>
              </label>
              <label>
                Gender
                <select id="driver-gender-input">
                  <option value="Male" ${
                    driver.gender.toLowerCase() === "male" ? "selected" : ""
                  }>Male</option>
                  <option value="Female" ${
                    driver.gender.toLowerCase() === "female" ? "selected" : ""
                  }>Female</option>
                </select>
              </label>
            </div>
          `;
        },
        onSubmit: async ({ close }) => {
          const id = document.getElementById("driver-id-input")?.value.trim();
          const fullName = document
            .getElementById("driver-fullName-input")
            ?.value.trim();
          const roleType = document
            .getElementById("driver-roleType-input")
            ?.value.trim();
          const identificationType = document
            .getElementById("driver-identificationType-input")
            ?.value.trim();
          const identificationNumber = document
            .getElementById("driver-identificationNumber-input")
            ?.value.trim();
          const gender = document
            .getElementById("driver-gender-input")
            ?.value.trim();

          if (
            !id ||
            !fullName ||
            !roleType ||
            !identificationType ||
            !identificationNumber ||
            !gender
          ) {
            await window.showAlert({
              type: "error",
              title: "Missing fields",
              message: "Please fill the missing fields",
            });
            return;
          }

          try {
            const payload = {
              id,
              fullName,
              roleType,
              identificationType,
              identificationNumber,
              gender,
            };

            const resp = await fetch(`/api/drivers`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              const error = await resp.json();
              await window.showAlert({
                type: "error",
                title: "Failed to update driver",
                message: `Failed to update driver (${error?.message ?? resp.status})`,
              });
              return;
            }

            const updated = await resp.json().catch(() => ({}));
            const newDriver = updated.data ?? payload;

            await window.showAlert({
              type: "success",
              title: "Driver updated",
              message: `Driver <b>${newDriver.fullName}</b> was updated successfully.`,
            });

            close();
            await loadDrivers(); // reload and reapply filters
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Update failed",
              message: "Unable to update driver. Please try again.",
            });
          }
        },
      });
    }

    /* ------------------- DELETE ------------------- */
    if (deleteBtn) {
      const result = await window.showConfirm({
        title: "Delete Driver?",
        message: `Do you really want to delete <b>${driver.fullName}</b>? This action cannot be undone.`,
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
          `/api/drivers/${encodeURIComponent(driver.id)}`,
          {
            method: "DELETE",
          }
        );

        if (!resp.ok) {
          throw new Error(`Failed to delete driver (${resp.status})`);
        }

        await window.showAlert({
          type: "success",
          title: "Driver deleted",
          message: `Driver <b>${driver.fullName}</b> was deleted.`,
        });

        await loadDrivers(); // reload and reapply filters
      } catch (err) {
        console.error(err);
        await window.showAlert({
          type: "error",
          title: "Delete failed",
          message: "Unable to delete driver. Please try again.",
        });
      }
    }
  });
});
