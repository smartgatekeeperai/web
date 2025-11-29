// public/js/drivers.js

document.addEventListener("DOMContentLoaded", () => {
  let roleTypes = [];
  let identificationTypes = [];
  const table = document.querySelector(".table-container table");
  const tbody =
    document.getElementById("drivers-tbody") || table?.querySelector("tbody");
  const addBtn = document.getElementById("add-driver-btn");

  if (!table || !tbody) return;

  /* -------------------------------------------------------
   * Helpers to map between <tr> and driver object
   * -----------------------------------------------------*/
  function getDriverFromRow(row) {
    const cells = row.querySelectorAll("td");
    return {
      id: cells[1]?.textContent.trim(),
      fullName: cells[2]?.textContent.trim(),
      roleType: cells[3]?.textContent.trim(),
      identificationType: cells[4]?.textContent.trim(),
      identificationNumber: cells[5]?.textContent.trim(),
      gender: cells[6]?.textContent.trim(),
    };
  }

  function updateRowFromDriver(row, driver) {
    const cells = row.querySelectorAll("td");
    if (cells[1]) cells[1].textContent = driver.id;
    if (cells[2]) cells[2].textContent = driver.fullName;
    if (cells[3]) cells[3].textContent = driver.roleType;
    if (cells[4]) cells[4].textContent = driver.identificationType;
    if (cells[5]) cells[5].textContent = driver.identificationNumber;
    if (cells[6]) cells[6].textContent = driver.gender;
  }

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
      <td>${driver.roleType}</td>
      <td>${driver.identificationType}</td>
      <td>${driver.identificationNumber}</td>
      <td>${driver.gender.toUpperCase()}</td>
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

  /* Load Role type and Identification type */

  async function loadRoleType() {
    try {
      const resp = await fetch("/api/role-types/", { method: "GET" });

      if (!resp.ok) {
        throw new Error(`Failed to load Role types`);
      }
      const data = await resp.json();
      roleTypes = data?.data?.map((x) => x.name);
      console.log("roleTypes ", roleTypes);
    } catch (err) {
      console.error(err);
      await window.showAlert({
        type: "error",
        title: "Failed to load Role types",
        message: `${err?.message}. Please try again.`,
      });
    }
  }

  async function loadIdentificationTypes() {
    try {
      const resp = await fetch("/api/identification-types/", { method: "GET" });

      if (!resp.ok) {
        throw new Error(`Failed to load Identification types`);
      }
      const data = await resp.json();
      identificationTypes = data?.data?.map((x) => x.name);

      console.log("identificationTypes ", identificationTypes);
    } catch (err) {
      console.error(err);
      await window.showAlert({
        type: "error",
        title: "Failed to load Identification types",
        message: `${err?.message}. Please try again.`,
      });
    }
  }

  loadRoleType();
  loadIdentificationTypes();

  /* -------------------------------------------------------
   * LOAD DRIVERS FROM API
   * -----------------------------------------------------*/
  async function loadDrivers() {
    renderEmptyRow("Loading drivers...");

    try {
      const resp = await fetch("/api/drivers");
      if (!resp.ok) {
        throw new Error(`Failed to fetch drivers (${resp.status})`);
      }

      const data = await resp.json();

      // Support both array and { items: [...] } style responses
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.data)
        ? data.data
        : [];

      if (!list.length) {
        renderEmptyRow("No drivers found.");
        return;
      }

      tbody.innerHTML = "";

      list.forEach((item) => {
        const tr = createRow(item);
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      renderEmptyRow("Failed to load drivers.");
      // Optional: pop an alert on load error
      window
        .showAlert({
          type: "error",
          title: "Load failed",
          message: "Unable to load drivers. Please refresh the page.",
        })
        .catch(() => {});
    }
  }

  // Initial load
  loadDrivers();

  /* -------------------------------------------------------
   * ADD DRIVER
   * -----------------------------------------------------*/
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const roleTypeOptions = window.createSelectOptions(roleTypes);
      const identificationTypeOptions =
        window.createSelectOptions(identificationTypes);
      console.log(roleTypeOptions);
      const result = await window.showFormModal({
        title: "Add Driver",
        variant: "info",
        submitText: "Save Driver",
        cancelText: "Cancel",
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                Full name
                <input type="text" id="driver-fullName-input" placeholder="Full name" />
              </label>
              <label>
                Role type
                <select id="driver-roleType-input">
                 <option value="" disabled selected hidden>Select Role type</option>
                 ${roleTypeOptions}
                </select>
              </label>
              <label>
                Identification type
                <select id="driver-identificationType-input">
                 <option value="" disabled selected hidden>Select Identification type</option>
                 ${identificationTypeOptions}
                </select>
              </label>
              <label>
                Identification number
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
            </div>
          `;
        },
      });

      if (
        !result ||
        result === "backdrop" ||
        result === "close" ||
        result.cancelled
      ) {
        return;
      }

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
          fullName,
          roleType,
          identificationType,
          identificationNumber,
          gender,
        };

        const resp = await fetch("/api/drivers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          throw new Error(`Failed to create driver (${resp.status})`);
        }

        const created = await resp.json();

        const driver = created.data;

        // If table was showing the "No drivers" row, clear it
        const onlyRow = tbody.querySelector("tr");
        if (
          onlyRow &&
          onlyRow.children.length === 1 &&
          onlyRow.children[0].getAttribute("colspan") === "6"
        ) {
          tbody.innerHTML = "";
        }

        const tr = createRow(driver);
        tbody.appendChild(tr);

        await window.showAlert({
          type: "success",
          title: "Driver created",
          message: `Driver <b>${driver.fullName}</b> was created successfully.`,
        });
      } catch (err) {
        console.error(err);
        await window.showAlert({
          type: "error",
          title: "Create failed",
          message: "Unable to create driver. Please try again.",
        });
      }
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

    const driver = getDriverFromRow(row);
    const roleTypeOptions = window.createSelectOptions(roleTypes, driver.roleType);
    const identificationTypeOptions =
      window.createSelectOptions(identificationTypes, driver.identificationType);

    /* ------------------- EDIT ------------------- */
    if (editBtn) {
      const result = await window.showFormModal({
        title: `Edit Driver ${driver.id}`,
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
                Name
                <input type="text" id="driver-fullName-input" value="${
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
                  <option value="" disabled selected hidden>Select gender</option>
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
      });

      if (
        !result ||
        result === "backdrop" ||
        result === "close" ||
        result.cancelled
      ) {
        return;
      }

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
          throw new Error(`Failed to update driver (${resp.status})`);
        }

        const updated = await resp.json().catch(() => ({}));
        const newDriver = updated.data;

        updateRowFromDriver(row, newDriver);

        await window.showAlert({
          type: "success",
          title: "Driver updated",
          message: `Driver <b>${newDriver.fullName}</b> was updated successfully.`,
        });
      } catch (err) {
        console.error(err);
        await window.showAlert({
          type: "error",
          title: "Update failed",
          message: "Unable to update driver. Please try again.",
        });
      }
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

        row.remove();

        if (!tbody.querySelector("tr")) {
          renderEmptyRow("No drivers found.");
        }

        await window.showAlert({
          type: "success",
          title: "Driver deleted",
          message: `Driver <b>${driver.fullName}</b> was deleted.`,
        });
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
