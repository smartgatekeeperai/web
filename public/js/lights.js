document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page !== "lights") return;

  const grid = document.getElementById("lights-grid");
  const addBtn = document.getElementById("add-light-btn");

  let lightsData = [];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeLightInput(value) {
    return String(value || "").trim().toUpperCase();
  }

  function readDashboardAssignedStreams() {
    try {
      const raw = localStorage.getItem("dashboard_camera_slot_assignments_v1");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return [];

      const streams = Object.values(parsed)
        .map((x) => String(x || "").trim())
        .filter(Boolean);

      return [...new Set(streams)];
    } catch {
      return [];
    }
  }

  async function fetchCameraStreamsFromAI() {
    try {
      const aiUrl = String(window.getAIURL?.() || "").replace(/\/+$/, "");
      if (!aiUrl) return [];

      const resp = await fetch(`${aiUrl}/streams`, {
        method: "GET",
        cache: "no-store",
      });

      if (!resp.ok) return [];

      const result = await resp.json();
      const streams = Array.isArray(result?.streams) ? result.streams : [];

      return streams
        .map((x) => String(x?.stream_id || "").trim())
        .filter(Boolean);
    } catch (err) {
      console.warn("[lights] failed to fetch AI streams:", err);
      return [];
    }
  }

  async function getCameraOptions() {
    const localStreams = readDashboardAssignedStreams();
    const aiStreams = await fetchCameraStreamsFromAI();

    const merged = [...new Set([...localStreams, ...aiStreams])];
    return merged.sort((a, b) => a.localeCompare(b));
  }

  function renderEmpty(message) {
    if (!grid) return;
    grid.innerHTML = `
      <div class="empty-state">
        ${message}
      </div>
    `;
  }

  function renderLights() {
    if (!grid) return;

    if (!lightsData.length) {
      renderEmpty("No lights found. Click <b>Add Light</b> to create one.");
      return;
    }

    grid.innerHTML = lightsData
      .map(
        (light) => `
          <div class="light-card">
            <div class="light-card-header">
              <h3 class="light-card-title">${escapeHtml(light.name)}</h3>
              <span class="light-badge">
                <i class="fas fa-lightbulb"></i>
                Active
              </span>
            </div>

            <div class="light-details">
              <div class="light-detail">
                <div class="light-detail-label">Name</div>
                <div class="light-detail-value">${escapeHtml(light.name)}</div>
              </div>

              <div class="light-detail">
                <div class="light-detail-label">Secret Key</div>
                <div class="light-detail-value">${escapeHtml(light.secretKey)}</div>
              </div>

              <div class="light-detail">
                <div class="light-detail-label">Camera Stream ID</div>
                <div class="light-detail-value">${escapeHtml(light.cameraStreamId)}</div>
              </div>
            </div>

            <div class="light-card-actions">
              <button
                type="button"
                class="secondary-btn btn-edit-light"
                data-name="${escapeHtml(light.name)}"
                data-secret-key="${escapeHtml(light.secretKey)}"
              >
                Update
              </button>

              <button
                type="button"
                class="danger-btn btn-delete-light"
                data-name="${escapeHtml(light.name)}"
                data-secret-key="${escapeHtml(light.secretKey)}"
              >
                Delete
              </button>
            </div>
          </div>
        `,
      )
      .join("");
  }

  async function loadLights() {
    if (!grid) return;
    renderEmpty("Loading lights...");

    try {
      const resp = await fetch("/api/lights", {
        method: "GET",
        cache: "no-store",
      });

      if (!resp.ok) {
        throw new Error(`Failed to load lights (${resp.status})`);
      }

      const result = await resp.json();
      if (!result?.success) {
        throw new Error(result?.message || "Failed to load lights");
      }

      lightsData = Array.isArray(result?.data) ? result.data : [];
      renderLights();
    } catch (err) {
      console.error("[lights] load error:", err);
      renderEmpty("Failed to load lights.");

      await window.showAlert?.({
        type: "error",
        title: "Load failed",
        message: err?.message || "Unable to load lights.",
      });
    }
  }

  async function openLightModal(mode, light = null) {
    const isEdit = mode === "edit";
    const cameraOptions = await getCameraOptions();

    window.showFormModal({
      title: isEdit ? `Update Light ${light?.name || ""}` : "Add Light",
      variant: "info",
      submitText: isEdit ? "Save changes" : "Save light",
      cancelText: "Cancel",
      render: (bodyEl) => {
        bodyEl.innerHTML = `
          <div class="modal-form">
            <label>
              Name *
              <input
                type="text"
                id="light-name-input"
                maxlength="4"
                placeholder="Max 4 chars"
                value="${escapeHtml(light?.name || "")}"
              />
            </label>

            <label>
              SecretKey *
              <input
                type="text"
                id="light-secretkey-input"
                maxlength="4"
                placeholder="Max 4 chars"
                value="${escapeHtml(light?.secretKey || "")}"
              />
            </label>

            <label>
              Camera *
              <select id="light-camera-input">
                <option value="">Select camera stream</option>
                ${cameraOptions
                  .map(
                    (streamId) => `
                      <option
                        value="${escapeHtml(streamId)}"
                        ${
                          String(light?.cameraStreamId || "") === String(streamId)
                            ? "selected"
                            : ""
                        }
                      >
                        ${escapeHtml(streamId)}
                      </option>
                    `,
                  )
                  .join("")}
              </select>
            </label>

            <div class="modal-helper-text">
              Camera options are loaded from dashboard pairing or AI stream discovery.
            </div>
          </div>
        `;
      },
      onSubmit: async ({ close }) => {
        const name = normalizeLightInput(
          document.getElementById("light-name-input")?.value,
        );
        const secretKey = normalizeLightInput(
          document.getElementById("light-secretkey-input")?.value,
        );
        const cameraStreamId = String(
          document.getElementById("light-camera-input")?.value || "",
        ).trim();

        if (!name || !secretKey || !cameraStreamId) {
          await window.showAlert?.({
            type: "error",
            title: "Missing fields",
            message: "Please fill the missing fields.",
          });
          return;
        }

        if (name.length > 4) {
          await window.showAlert?.({
            type: "error",
            title: "Invalid Name",
            message: "Name must be at most 4 characters.",
          });
          return;
        }

        if (secretKey.length > 4) {
          await window.showAlert?.({
            type: "error",
            title: "Invalid SecretKey",
            message: "SecretKey must be at most 4 characters.",
          });
          return;
        }

        try {
          const payload = {
            name,
            secretKey,
            cameraStreamId,
          };

          if (isEdit) {
            payload.originalName = light.name;
            payload.originalSecretKey = light.secretKey;
          }

          const resp = await fetch("/api/lights", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const result = await resp.json().catch(() => ({}));

          if (!resp.ok || result?.success === false) {
            await window.showAlert?.({
              type: "error",
              title: isEdit ? "Update failed" : "Create failed",
              message:
                result?.message ||
                (isEdit ? "Unable to update light." : "Unable to create light."),
            });
            return;
          }

          await window.showAlert?.({
            type: "success",
            title: isEdit ? "Light updated" : "Light created",
            message: isEdit
              ? `Light <b>${escapeHtml(name)}</b> was updated successfully.`
              : `Light <b>${escapeHtml(name)}</b> was created successfully.`,
          });

          close();
          await loadLights();
        } catch (err) {
          console.error("[lights] save error:", err);
          await window.showAlert?.({
            type: "error",
            title: isEdit ? "Update failed" : "Create failed",
            message: err?.message || "Unable to save light.",
          });
        }
      },
    });
  }

  addBtn?.addEventListener("click", async () => {
    await openLightModal("create");
  });

  grid?.addEventListener("click", async (event) => {
    const editBtn = event.target.closest(".btn-edit-light");
    const deleteBtn = event.target.closest(".btn-delete-light");

    if (!editBtn && !deleteBtn) return;

    const name = String(
      editBtn?.dataset?.name || deleteBtn?.dataset?.name || "",
    ).trim();
    const secretKey = String(
      editBtn?.dataset?.secretKey || deleteBtn?.dataset?.secretKey || "",
    ).trim();

    const light = lightsData.find(
      (x) =>
        String(x.name).trim().toUpperCase() === name.toUpperCase() &&
        String(x.secretKey).trim().toUpperCase() === secretKey.toUpperCase(),
    );

    if (!light) return;

    if (editBtn) {
      await openLightModal("edit", light);
      return;
    }

    if (deleteBtn) {
      const result = await window.showConfirm?.({
        title: "Delete light?",
        message: `Do you really want to delete <b>${escapeHtml(
          light.name,
        )}</b>?`,
        yesText: "Yes, delete",
        cancelText: "Cancel",
        showNo: false,
        showCancel: true,
        variant: "error",
      });

      if (result !== "yes") return;

      try {
        const resp = await fetch(
          `/api/lights/${encodeURIComponent(light.name)}/${encodeURIComponent(
            light.secretKey,
          )}`,
          {
            method: "DELETE",
          },
        );

        const deleteResult = await resp.json().catch(() => ({}));

        if (!resp.ok || deleteResult?.success === false) {
          await window.showAlert?.({
            type: "error",
            title: "Delete failed",
            message: deleteResult?.message || "Unable to delete light.",
          });
          return;
        }

        await window.showAlert?.({
          type: "success",
          title: "Light deleted",
          message: `Light <b>${escapeHtml(light.name)}</b> was deleted.`,
        });

        await loadLights();
      } catch (err) {
        console.error("[lights] delete error:", err);
        await window.showAlert?.({
          type: "error",
          title: "Delete failed",
          message: err?.message || "Unable to delete light.",
        });
      }
    }
  });

  loadLights();
});