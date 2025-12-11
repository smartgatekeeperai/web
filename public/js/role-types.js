/* Placeholder for role.js */

document.addEventListener("DOMContentLoaded", () => {
  let tableData = [];
  const table = document.querySelector(".table-container table");
  const tbody =
    document.getElementById("role-types-tbody") || table?.querySelector("tbody");
  const addBtn = document.getElementById("add-roleType-btn");

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
   * Helpers to map between <tr> and roleType object
   * -----------------------------------------------------*/
  function createRow(roleType) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <button class="table-icon-btn btn-edit" title="Edit role type" type="button">
          <i class="fa fa-pen"></i>
        </button>
      </td>
      <td class="fix-width">${roleType.id}</td>
      <td>${roleType.name}</td>
      <td>
        <button class="table-icon-btn btn-delete" title="Delete role type" type="button">
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
      renderEmptyRow("No role types match filters.");
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
      renderEmptyRow("No role types found.");
      return;
    }

    const idFilter = normalize(filterInputs.id?.value);
    const nameFilter = normalize(filterInputs.name?.value);

    const filtered = tableData.filter((roleType) => {
      const idText = normalize(roleType.id);
      const nameText = normalize(roleType.name);


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
  async function loadRoleTypes() {
    tbody.innerHTML = "";
    tableData = [];
    renderEmptyRow("Loading role types...");

    try {
      const resp = await fetch("/api/role-types", { method: "GET" });

      if (!resp.ok) {
        throw new Error(`Failed to load role types`);
      }
      const data = await resp.json();

      tableData = data?.data;

      if (!tableData.length) {
        renderEmptyRow("No role types found.");
        return;
      }

      // Instead of rendering directly, always go through filters
      applyFilters(); // <<< FILTERS
      resizeTable();
    } catch (err) {
      console.error(err);
      renderEmptyRow("Failed to load role types.");
      window
        .showAlert({
          type: "error",
          title: "Load failed",
          message: "Unable to load role types. Please refresh the page.",
        })
        .catch(() => {});
    }
  }

  loadRoleTypes();
  
  /* -------------------------------------------------------
   * ADD DATA
   * -----------------------------------------------------*/
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      // Show form modal. onSubmit controls when it closes.
      window.showFormModal({
        title: "Add role type",
        variant: "info",
        submitText: "Save role type",
        cancelText: "Cancel",
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                Name *
                <input type="text" id="roleType-name-input" placeholder="Role type name" />
              </label>
            </div>
          `;
        },
        onSubmit: async ({ close }) => {
          const name = document
            .getElementById("roleType-name-input")
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

            const resp = await fetch("/api/role-types", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              const error = await resp.json();
              await window.showAlert({
                type: "error",
                title: "Failed to create role type",
                message: `Failed to create role type (${error?.message ?? resp.status})`,
              });
              return;
            }

            const created = await resp.json();
            const roleType = created.data;

            await window.showAlert({
              type: "success",
              title: "Role type created",
              message: `Role type <b>${roleType.name}</b> was created successfully.`,
            });

            // Now actually close the form modal
            close();
            await loadRoleTypes(); // reload and reapply filters
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Create failed",
              message: err?.message ?? "Unable to create role type. Please try again.",
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

    const roleType = tableData.find(
      (x) => String(x.id) === row.querySelectorAll("td")[1]?.textContent.trim()
    );
    if (!roleType) return;

    /* ------------------- EDIT ------------------- */
    if (editBtn) {
      window.showFormModal({
        title: `Edit role type #${roleType.id}`,
        variant: "info",
        submitText: "Save Changes",
        cancelText: "Cancel",
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                Role type ID
                <input type="text" id="roleType-id-input" value="${
                  roleType.id
                }" readonly />
              </label>
              <label>
                Name
                <input type="text" id="roleType-name-input" placeholder="Full name" value="${
                  roleType.name
                }" />
              </label>
            </div>
          `;
        },
        onSubmit: async ({ close }) => {
          const id = document.getElementById("roleType-id-input")?.value.trim();
          const name = document
            .getElementById("roleType-name-input")
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

            const resp = await fetch(`/api/role-types`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              const error = await resp.json();
              await window.showAlert({
                type: "error",
                title: "Failed to update role type",
                message: `Failed to update role type (${error?.message ?? resp.status})`,
              });
              return;
            }

            const updated = await resp.json().catch(() => ({}));
            const updatedRoleType = updated.data ?? payload;

            await window.showAlert({
              type: "success",
              title: "Role type updated",
              message: `Role type <b>${updatedRoleType.name}</b> was updated successfully.`,
            });

            close();
            await loadRoleTypes(); // reload and reapply filters
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Update failed",
              message: "Unable to update role type. Please try again.",
            });
          }
        },
      });
    }

    /* ------------------- DELETE ------------------- */
    if (deleteBtn) {
      const result = await window.showConfirm({
        title: "Delete role type?",
        message: `Do you really want to delete <b>${roleType.name}</b>? This action cannot be undone.`,
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
          `/api/role-types/${encodeURIComponent(roleType.id)}`,
          {
            method: "DELETE",
          }
        );

        if (!resp.ok) {
          throw new Error(`Failed to delete role type (${resp.status})`);
        }

        await window.showAlert({
          type: "success",
          title: "Role type deleted",
          message: `Role type <b>${roleType.name}</b> was deleted.`,
        });

        await loadRoleTypes(); // reload and reapply filters
      } catch (err) {
        console.error(err);
        await window.showAlert({
          type: "error",
          title: "Delete failed",
          message: "Unable to delete role type. Please try again.",
        });
      }
    }
  });
});
