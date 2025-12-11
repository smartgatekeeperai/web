/* Placeholder for identification-types.js */

document.addEventListener("DOMContentLoaded", () => {
  let tableData = [];
  const table = document.querySelector(".table-container table");
  const tbody =
    document.getElementById("identification-types-tbody") || table?.querySelector("tbody");
  const addBtn = document.getElementById("add-identificationType-btn");

  function resizeTable() {
    let draftHeight = document.querySelector(".content")?.clientHeight ?? 0;
    draftHeight =
      draftHeight -
      40 -
      (document.querySelector(".content .page-subtitle")?.clientHeight ?? 0) -
      15 -
      (document.querySelector(".content .page-controls")?.clientHeight ?? 0) -
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
    id: document.getElementById("filterRoleTypeID"),
    name: document.getElementById("filterRoleTypeName"),
  };

  function normalize(value) {
    // <<< FILTERS
    return String(value ?? "").toLowerCase()?.trim();
  }

  /* -------------------------------------------------------
   * Helpers to map between <tr> and identificationType object
   * -----------------------------------------------------*/
  function createRow(identificationType) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <button class="table-icon-btn btn-edit" title="Edit identification type" type="button">
          <i class="fa fa-pen"></i>
        </button>
      </td>
      <td class="fix-width">${identificationType.id}</td>
      <td>${identificationType.name}</td>
      <td>
        <button class="table-icon-btn btn-delete" title="Delete identification type" type="button">
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
      renderEmptyRow("No identification types match filters.");
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
      renderEmptyRow("No identification types found.");
      return;
    }

    const idFilter = normalize(filterInputs.id?.value);
    const nameFilter = normalize(filterInputs.name?.value);

    const filtered = tableData.filter((identificationType) => {
      const idText = normalize(identificationType.id);
      const nameText = normalize(identificationType.name);


      if (idFilter && !idText.includes(idFilter)) return false;
      if (nameFilter && !nameText.includes(nameFilter)) return false;

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
  async function loadIdentificationTypes() {
    tbody.innerHTML = "";
    tableData = [];
    renderEmptyRow("Loading identification types...");

    try {
      const resp = await fetch("/api/identification-types", { method: "GET" });

      if (!resp.ok) {
        throw new Error(`Failed to load identification types`);
      }
      const data = await resp.json();

      tableData = data?.data;

      if (!tableData.length) {
        renderEmptyRow("No identification types found.");
        return;
      }

      // Instead of rendering directly, always go through filters
      applyFilters(); // <<< FILTERS
      resizeTable();
    } catch (err) {
      console.error(err);
      renderEmptyRow("Failed to load identification types.");
      window
        .showAlert({
          type: "error",
          title: "Load failed",
          message: "Unable to load identification types. Please refresh the page.",
        })
        .catch(() => {});
    }
  }

  loadIdentificationTypes();
  
  /* -------------------------------------------------------
   * ADD DATA
   * -----------------------------------------------------*/
  if (addBtn) {
    addBtn.addEventListener("click", async () => {

      // Show form modal. onSubmit controls when it closes.
      window.showFormModal({
        title: "Add identification type",
        variant: "info",
        submitText: "Save identification type",
        cancelText: "Cancel",
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                Name *
                <input type="text" id="identificationType-name-input" placeholder="Identification type name" />
              </label>
            </div>
          `;
        },
        onSubmit: async ({ close }) => {
          const name = document
            .getElementById("identificationType-name-input")
            ?.value.trim();

          if (
            !name
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
            const payload = { name, };

            const resp = await fetch("/api/identification-types", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              const error = await resp.json();
              await window.showAlert({
                type: "error",
                title: "Failed to create identification type",
                message: `Failed to create identification type (${error?.message ?? resp.status})`,
              });
              return;
            }

            const created = await resp.json();
            const identificationType = created.data;

            await window.showAlert({
              type: "success",
              title: "Identification type created",
              message: `Identification type <b>${identificationType.name}</b> was created successfully.`,
            });

            // Now actually close the form modal
            close();
            await loadIdentificationTypes(); // reload and reapply filters
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Create failed",
              message: err?.message ?? "Unable to create identification type. Please try again.",
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

    const identificationType = tableData.find(
      (x) => String(x.id) === row.querySelectorAll("td")[1]?.textContent.trim()
    );
    if (!identificationType) return;

    /* ------------------- EDIT ------------------- */
    if (editBtn) {
      window.showFormModal({
        title: `Edit identification type #${identificationType.id}`,
        variant: "info",
        submitText: "Save Changes",
        cancelText: "Cancel",
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                Identification type ID
                <input type="text" id="identificationType-id-input" value="${
                  identificationType.id
                }" readonly />
              </label>
              <label>
                Name
                <input type="text" id="identificationType-name-input" placeholder="Full name" value="${
                  identificationType.name
                }" />
              </label>
            </div>
          `;
        },
        onSubmit: async ({ close }) => {
          const id = document.getElementById("identificationType-id-input")?.value.trim();
          const name = document
            .getElementById("identificationType-name-input")
            ?.value.trim();

          if (!id || !name) {
            await window.showAlert({
              type: "error",
              title: "Missing fields",
              message: "Please fill the missing fields",
            });
            return;
          }

          try {
            const payload = { id, name };

            const resp = await fetch(`/api/identification-types`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              const error = await resp.json();
              await window.showAlert({
                type: "error",
                title: "Failed to update identification type",
                message: `Failed to update identification type (${error?.message ?? resp.status})`,
              });
              return;
            }

            const updated = await resp.json().catch(() => ({}));
            const updatedRoleType = updated.data ?? payload;

            await window.showAlert({
              type: "success",
              title: "Identification type updated",
              message: `Identification type <b>${updatedRoleType.name}</b> was updated successfully.`,
            });

            close();
            await loadIdentificationTypes(); // reload and reapply filters
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Update failed",
              message: "Unable to update identification type. Please try again.",
            });
          }
        },
      });
    }

    /* ------------------- DELETE ------------------- */
    if (deleteBtn) {
      const result = await window.showConfirm({
        title: "Delete identification type?",
        message: `Do you really want to delete <b>${identificationType.name}</b>? This action cannot be undone.`,
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
          `/api/identification-types/${encodeURIComponent(identificationType.id)}`,
          {
            method: "DELETE",
          }
        );

        if (!resp.ok) {
          throw new Error(`Failed to delete identification type (${resp.status})`);
        }

        await window.showAlert({
          type: "success",
          title: "Identification type deleted",
          message: `Identification type <b>${identificationType.name}</b> was deleted.`,
        });

        await loadIdentificationTypes(); // reload and reapply filters
      } catch (err) {
        console.error(err);
        await window.showAlert({
          type: "error",
          title: "Delete failed",
          message: "Unable to delete identification type. Please try again.",
        });
      }
    }
  });
});
