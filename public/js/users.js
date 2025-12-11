// public/js/users.js
/* Users page logic */

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page !== "users") return;

  let tableData = [];
  const table = document.querySelector(".table-container table");
  const tbody =
    document.getElementById("users-tbody") || table?.querySelector("tbody");
  const addBtn = document.getElementById("add-user-btn");

  function resizeTable() {
    let draftHeight = document.querySelector(".content")?.clientHeight ?? 0;
    draftHeight =
      draftHeight -
      40 -
      (document.querySelector(".content .page-subtitle")?.clientHeight ?? 0) -
      15 -
      (document.querySelector(".content .page-controls")?.clientHeight ?? 0) -
      16;
    const container = document.querySelector(".table-container");
    const filtersRow = document.querySelector(
      ".table-container table thead .filters"
    );
    if (!container || !filtersRow) return;

    container.style.maxHeight = draftHeight + "px";
    filtersRow.style.top =
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
  // Helper: init show/hide password toggles inside a modal
  // -------------------------------------------------------
  function initPasswordToggles(rootEl) {
    const toggles = rootEl.querySelectorAll(".toggle-password-btn");
    toggles.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.targetId;
        if (!targetId) return;
        const input = rootEl.querySelector(`#${targetId}`);
        if (!input) return;

        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";

        const icon = btn.querySelector("i");
        if (icon) {
          icon.classList.toggle("fa-eye", !isPassword);
          icon.classList.toggle("fa-eye-slash", isPassword);
        }
      });
    });
  }

  // -------------------------------------------------------
  // FILTER INPUTS
  // -------------------------------------------------------
  const filterInputs = {
    id: document.getElementById("filterUserID"),
    name: document.getElementById("filterName"),
    username: document.getElementById("filterUsername"),
  };

  function normalize(value) {
    return String(value ?? "").toLowerCase()?.trim();
  }

  /* -------------------------------------------------------
   * Helpers to map between <tr> and user object
   * -----------------------------------------------------*/
  function createRow(user) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <button class="table-icon-btn btn-edit" title="Edit user" type="button">
          <i class="fa fa-pen"></i>
        </button>
      </td>
      <td class="fix-width">${user.id}</td>
      <td>${user.name}</td>
      <td>${user.username}</td>
      <td>
        <button class="table-icon-btn btn-update-password" title="Update password" type="button">
          <i class="fa fa-lock"></i>
        </button>
      </td>
      <td>
        <button class="table-icon-btn btn-delete" title="Delete user" type="button">
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

  // Generic renderer that can render any subset of data
  function renderRows(rows) {
    if (!rows || !rows.length) {
      renderEmptyRow("No users match filters.");
      return;
    }

    tbody.innerHTML = "";
    rows.forEach((item) => {
      const tr = createRow(item);
      tbody.appendChild(tr);
    });
  }

  // Apply filters on tableData and re-render
  function applyFilters() {
    if (!tableData.length) {
      renderEmptyRow("No users found.");
      return;
    }

    const idFilter = normalize(filterInputs.id?.value);
    const nameFilter = normalize(filterInputs.name?.value);
    const usernameFilter = normalize(filterInputs.username?.value);

    const filtered = tableData.filter((user) => {
      const idText = normalize(user.id);
      const nameText = normalize(user.name);
      const usernameText = normalize(user.username);

      if (idFilter && !idText.includes(idFilter)) return false;
      if (nameFilter && !nameText.includes(nameFilter)) return false;
      if (usernameFilter && !usernameText.includes(usernameFilter)) return false;

      return true;
    });

    renderRows(filtered);
  }

  // Wire filter inputs to applyFilters on each change
  Object.values(filterInputs).forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => {
      applyFilters();
    });
  });

  /* -------------------------------------------------------
   * LOAD FROM API
   * -----------------------------------------------------*/
  async function loadUsers() {
    tbody.innerHTML = "";
    tableData = [];
    renderEmptyRow("Loading users...");

    try {
      const resp = await fetch("/api/users", { method: "GET" });

      if (!resp.ok) {
        throw new Error(`Failed to load users`);
      }
      const data = await resp.json();

      tableData = data?.data || [];

      if (!tableData.length) {
        renderEmptyRow("No users found.");
        return;
      }

      applyFilters();
      resizeTable();
    } catch (err) {
      console.error(err);
      renderEmptyRow("Failed to load users.");
      window
        .showAlert({
          type: "error",
          title: "Load failed",
          message: "Unable to load users. Please refresh the page.",
        })
        .catch(() => {});
    }
  }

  loadUsers();

  /* -------------------------------------------------------
   * ADD USER
   * -----------------------------------------------------*/
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      window.showFormModal({
        title: "Add user",
        variant: "info",
        submitText: "Save user",
        cancelText: "Cancel",
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                Name *
                <input type="text" id="name-input" placeholder="Name" />
              </label>
              <label>
                Username *
                <input type="text" id="username-input" placeholder="Username" />
              </label>
              <label>
                Password *
                <div class="password-field">
                  <input type="password" id="password-input" placeholder="Password" />
                  <button type="button" class="toggle-password-btn" data-target-id="password-input" title="Show/Hide password">
                    <i class="fa fa-eye"></i>
                  </button>
                </div>
              </label>
              <label>
                Confirm password *
                <div class="password-field">
                  <input type="password" id="confirm-password-input" placeholder="Confirm password" />
                  <button type="button" class="toggle-password-btn" data-target-id="confirm-password-input" title="Show/Hide password">
                    <i class="fa fa-eye"></i>
                  </button>
                </div>
              </label>
            </div>
          `;

          // Enable show/hide on these password fields
          initPasswordToggles(bodyEl);
        },
        onSubmit: async ({ close }) => {
          const name = document.getElementById("name-input")?.value.trim();
          const username = document
            .getElementById("username-input")
            ?.value.trim();
          const password = document
            .getElementById("password-input")
            ?.value.trim();
          const confirmPassword = document
            .getElementById("confirm-password-input")
            ?.value.trim();

          if (!name || !username || !password || !confirmPassword) {
            await window.showAlert({
              type: "error",
              title: "Missing fields",
              message: "Please fill the missing fields",
            });
            return;
          }

          if (password !== confirmPassword) {
            await window.showAlert({
              type: "error",
              title: "Passwords do not match",
              message: "Please ensure both password fields are identical.",
            });
            return;
          }

          try {
            const payload = { username, name, password };

            const resp = await fetch("/api/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              const error = await resp.json().catch(() => ({}));
              await window.showAlert({
                type: "error",
                title: "Failed to create user",
                message: `Failed to create user (${
                  error?.message ?? resp.status
                })`,
              });
              return;
            }

            const created = await resp.json();
            const user = created.data;

            await window.showAlert({
              type: "success",
              title: "User created",
              message: `User <b>${user.username}</b> was created successfully.`,
            });

            close();
            await loadUsers();
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Create failed",
              message:
                err?.message ?? "Unable to create user. Please try again.",
            });
          }
        },
      });
    });
  }

  /* -------------------------------------------------------
   * EDIT / UPDATE PASSWORD / DELETE via delegated click
   * -----------------------------------------------------*/
  table.addEventListener("click", async (event) => {
    const editBtn = event.target.closest(".btn-edit");
    const deleteBtn = event.target.closest(".btn-delete");
    const updatePasswordBtn = event.target.closest(".btn-update-password");

    if (!editBtn && !deleteBtn && !updatePasswordBtn) return;

    const row = event.target.closest("tr");
    if (!row) return;

    const user = tableData.find(
      (x) =>
        String(x.id) ===
        row.querySelectorAll("td")[1]?.textContent.trim()
    );
    if (!user) return;

    /* ------------------- EDIT (no password) ------------------- */
    if (editBtn) {
      window.showFormModal({
        title: `Edit user #${user.id}`,
        variant: "info",
        submitText: "Save Changes",
        cancelText: "Cancel",
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                User ID
                <input type="text" id="id-input" value="${user.id}" readonly />
              </label>
              <label>
                Username
                <input type="text" id="username-input" placeholder="Username" value="${
                  user.username
                }" />
              </label>
              <label>
                Name
                <input type="text" id="name-input" placeholder="Name" value="${
                  user.name
                }" />
              </label>
            </div>
          `;
        },
        onSubmit: async ({ close }) => {
          const id = document.getElementById("id-input")?.value.trim();
          const username = document
            .getElementById("username-input")
            ?.value.trim();
          const name = document
            .getElementById("name-input")
            ?.value.trim();

          if (!id || !username || !name) {
            await window.showAlert({
              type: "error",
              title: "Missing fields",
              message: "Please fill the missing fields",
            });
            return;
          }

          try {
            const payload = { id, username, name };

            const resp = await fetch(`/api/users`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              const error = await resp.json().catch(() => ({}));
              await window.showAlert({
                type: "error",
                title: "Failed to update user",
                message: `Failed to update user (${
                  error?.message ?? resp.status
                })`,
              });
              return;
            }

            const updated = await resp.json().catch(() => ({}));
            const updatedUser = updated.data ?? payload;

            await window.showAlert({
              type: "success",
              title: "User updated",
              message: `User <b>${updatedUser.username}</b> was updated successfully.`,
            });

            close();
            await loadUsers();
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Update failed",
              message: "Unable to update user. Please try again.",
            });
          }
        },
      });
    }

    /* ------------------- UPDATE PASSWORD ------------------- */
    if (updatePasswordBtn) {
      window.showFormModal({
        title: `Update password for ${user.username}`,
        variant: "info",
        submitText: "Update password",
        cancelText: "Cancel",
        render: (bodyEl) => {
          bodyEl.innerHTML = `
            <div class="modal-form">
              <label>
                New password *
                <div class="password-field">
                  <input type="password" id="new-password-input" placeholder="New password" />
                  <button type="button" class="toggle-password-btn" data-target-id="new-password-input" title="Show/Hide password">
                    <i class="fa fa-eye"></i>
                  </button>
                </div>
              </label>
              <label>
                Confirm new password *
                <div class="password-field">
                  <input type="password" id="confirm-new-password-input" placeholder="Confirm new password" />
                  <button type="button" class="toggle-password-btn" data-target-id="confirm-new-password-input" title="Show/Hide password">
                    <i class="fa fa-eye"></i>
                  </button>
                </div>
              </label>
            </div>
          `;

          // Enable show/hide on these password fields
          initPasswordToggles(bodyEl);
        },
        onSubmit: async ({ close }) => {
          const newPassword = document
            .getElementById("new-password-input")
            ?.value.trim();
          const confirmNewPassword = document
            .getElementById("confirm-new-password-input")
            ?.value.trim();

          if (!newPassword || !confirmNewPassword) {
            await window.showAlert({
              type: "error",
              title: "Missing fields",
              message: "Please fill both password fields.",
            });
            return;
          }

          if (newPassword !== confirmNewPassword) {
            await window.showAlert({
              type: "error",
              title: "Passwords do not match",
              message: "Please ensure both password fields are identical.",
            });
            return;
          }

          try {
            const resp = await fetch(
              `/api/users/${encodeURIComponent(user.id)}/update-password`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: newPassword }),
              }
            );

            if (!resp.ok) {
              const error = await resp.json().catch(() => ({}));
              await window.showAlert({
                type: "error",
                title: "Failed to update password",
                message:
                  error?.message ??
                  `Failed to update password (${resp.status}).`,
              });
              return;
            }

            await window.showAlert({
              type: "success",
              title: "Password updated",
              message: `Password for <b>${user.username}</b> was updated successfully.`,
            });

            // Table data doesn't change visually for password, no need to reload.
            close();
          } catch (err) {
            console.error(err);
            await window.showAlert({
              type: "error",
              title: "Update password failed",
              message: "Unable to update password. Please try again.",
            });
          }
        },
      });
    }

    /* ------------------- DELETE ------------------- */
    if (deleteBtn) {
      const result = await window.showConfirm({
        title: "Delete user?",
        message: `Do you really want to delete <b>${user.username}</b>? This action cannot be undone.`,
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
          `/api/users/${encodeURIComponent(user.id)}`,
          {
            method: "DELETE",
          }
        );

        if (!resp.ok) {
          throw new Error(`Failed to delete user (${resp.status})`);
        }

        await window.showAlert({
          type: "success",
          title: "User deleted",
          message: `User <b>${user.username}</b> was deleted.`,
        });

        await loadUsers();
      } catch (err) {
        console.error(err);
        await window.showAlert({
          type: "error",
          title: "Delete failed",
          message: "Unable to delete user. Please try again.",
        });
      }
    }
  });
});
