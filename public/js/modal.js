// public/js/modal.js

/* =========================================================
 * Reusable Modal API
 *  - window.showConfirm({
 *        title, message, yesText, noText, cancelText,
 *        showNo, showCancel, variant, backdropClosable
 *    }) -> Promise<'yes'|'no'|'cancel'|'close'|'backdrop'>
 *
 *  - window.showAlert({
 *        title, message, type, okText, backdropClosable
 *    }) -> Promise<'ok'|'close'|'backdrop'>
 *
 *  - window.showFormModal({
 *        title, render(bodyEl) | html,
 *        submitText, cancelText,
 *        variant,
 *        onSubmit({ close }),
 *        backdropClosable
 *    }) -> Promise<result>
 *
 *  Notes:
 *    - backdropClosable (default: true)
 *      If false, clicking on the backdrop does NOT close the modal/dialog.
 * =======================================================*/

document.addEventListener("DOMContentLoaded", () => {
  /* ---------- MAIN FORM MODAL (app-modal-*) ---------- */

  const modalBackdrop = document.getElementById("app-modal-backdrop");
  const modalEl = document.getElementById("app-modal");
  const modalTitleEl = document.getElementById("app-modal-title");
  const modalBodyEl = document.getElementById("app-modal-body");
  const modalFooterEl = document.getElementById("app-modal-footer");
  const modalCloseEl = document.getElementById("app-modal-close");

  if (!modalBackdrop || !modalEl) {
    console.warn("[modal.js] app-modal elements not found.");
    return;
  }

  let modalResolve = null;
  let formBackdropClosable = true; // <--- new flag for form modal

  function resetModalClasses() {
    modalEl.className = "modal-container";
  }

  function resolveModal(result) {
    if (typeof modalResolve === "function") {
      const resolver = modalResolve;
      modalResolve = null;
      resolver(result);
    }
  }

  function hideModal() {
    modalBackdrop.classList.remove("active");
    resetModalClasses();
  }

  function closeModal(result) {
    resolveModal(result);
    hideModal();
  }

  // Expose so pages can force-close the form modal
  window.closeAppModal = function (result = "manual") {
    closeModal(result);
  };

  modalCloseEl?.addEventListener("click", () => {
    closeModal("close");
  });

  // Click outside modal (backdrop) – now configurable
  modalBackdrop?.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) {
      if (!formBackdropClosable) return; // don't close if disabled
      closeModal("backdrop");
    }
  });

  /* ---------- SECONDARY DIALOG MODAL (stacked on top) ---------- */

  const dialogBackdrop = document.createElement("div");
  dialogBackdrop.id = "dialog-backdrop";
  dialogBackdrop.className = "modal-backdrop dialog-backdrop";
  dialogBackdrop.innerHTML = `
    <div class="modal-container" id="dialog-modal">
      <div class="modal-header">
        <h3 class="modal-title" id="dialog-modal-title"></h3>
        <button class="modal-close" id="dialog-modal-close">&times;</button>
      </div>
      <div class="modal-body" id="dialog-modal-body"></div>
      <div class="modal-footer" id="dialog-modal-footer"></div>
    </div>
  `;
  document.body.appendChild(dialogBackdrop);

  const dialogModalEl = document.getElementById("dialog-modal");
  const dialogTitleEl = document.getElementById("dialog-modal-title");
  const dialogBodyEl = document.getElementById("dialog-modal-body");
  const dialogFooterEl = document.getElementById("dialog-modal-footer");
  const dialogCloseEl = document.getElementById("dialog-modal-close");

  let dialogResolve = null;
  let dialogBackdropClosable = true; // <--- new flag for alert/confirm

  function resetDialogClasses() {
    dialogModalEl.className = "modal-container";
  }

  function closeDialog(result) {
    if (typeof dialogResolve === "function") {
      const resolver = dialogResolve;
      dialogResolve = null;
      resolver(result);
    }
    resetDialogClasses();
    dialogBackdrop.classList.remove("active");
  }

  dialogCloseEl?.addEventListener("click", () => closeDialog("close"));

  dialogBackdrop?.addEventListener("click", (e) => {
    if (e.target === dialogBackdrop) {
      if (!dialogBackdropClosable) return; // don't close if disabled
      closeDialog("backdrop");
    }
  });

  function openDialog({
    title,
    html,
    variant = "default",
    buttons = [],
    backdropClosable = true,
  }) {
    dialogBackdropClosable = backdropClosable; // set per-call behavior

    resetDialogClasses();
    if (variant) {
      dialogModalEl.classList.add(`modal-${variant}`);
    }

    dialogTitleEl.textContent = title || "";
    dialogBodyEl.innerHTML = html || "";
    dialogFooterEl.innerHTML = "";

    buttons.forEach((btn) => {
      const b = document.createElement("button");
      b.textContent = btn.label;
      b.type = "button";
      b.className = `modal-btn modal-btn-${btn.variant || "primary"}`;
      b.addEventListener("click", () => {
        closeDialog(btn.value);
      });
      dialogFooterEl.appendChild(b);
    });

    dialogBackdrop.classList.add("active");

    return new Promise((resolve) => {
      dialogResolve = resolve;
    });
  }

  /* ---------- PUBLIC ALERT / CONFIRM APIS (use dialog) ---------- */

  // Yes / No / Cancel confirm dialog
  window.showConfirm = function (opts = {}) {
    const {
      title = "Confirm action",
      message = "Are you sure?",
      yesText = "Yes",
      noText = "No",
      cancelText = "Cancel",
      showNo = true,
      showCancel = true,
      variant = "confirm",
      backdropClosable = true, // <--- new option
    } = opts;

    const buttons = [];

    if (showCancel) {
      buttons.push({
        label: cancelText,
        value: "cancel",
        variant: "ghost",
      });
    }

    if (showNo) {
      buttons.push({
        label: noText,
        value: "no",
        variant: "secondary",
      });
    }

    buttons.push({
      label: yesText,
      value: "yes",
      variant: "primary",
    });

    return openDialog({
      title,
      html: `<p>${message}</p>`,
      variant,
      buttons,
      backdropClosable,
    });
  };

  // Success / Error / Info alert dialog
  window.showAlert = function (opts = {}) {
    const {
      title = "Notice",
      message = "",
      type = "info", // 'success' | 'error' | 'info'
      okText = "OK",
      backdropClosable = true, // <--- new option
    } = opts;

    const variantMap = {
      success: "success",
      error: "error",
      info: "info",
    };

    return openDialog({
      title,
      html: `<p>${message}</p>`,
      variant: variantMap[type] || "info",
      buttons: [
        {
          label: okText,
          value: "ok",
          variant: "primary",
        },
      ],
      backdropClosable,
    });
  };

  /* ---------- FORM MODAL (page-controlled submit) ---------- */

  // Caller renders inputs and (optionally) handles submit via onSubmit.
  // If onSubmit is provided, modal DOES NOT auto-close on submit.
  // onSubmit receives { close } so it can close when ready.
  window.showFormModal = function (opts = {}) {
    const {
      title = "",
      render, // function (bodyEl) { ...create inputs... }
      submitText = "Save",
      cancelText = "Cancel",
      variant = "default",
      onSubmit, // optional: async ({ close }) => { ... }
      html, // alternative to render()
      backdropClosable = true, // <--- new option
    } = opts;

    formBackdropClosable = backdropClosable; // set per-call behavior

    resetModalClasses();
    if (variant) {
      modalEl.classList.add(`modal-${variant}`);
    }

    modalTitleEl.textContent = title || "";
    modalBodyEl.innerHTML = "";
    modalFooterEl.innerHTML = "";

    if (typeof render === "function") {
      render(modalBodyEl);
    } else if (html) {
      modalBodyEl.innerHTML = html;
    }

    if (cancelText) {
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = cancelText;
      cancelBtn.type = "button";
      cancelBtn.className = "modal-btn modal-btn-ghost";
      cancelBtn.addEventListener("click", () =>
        closeModal({ cancelled: true })
      );
      modalFooterEl.appendChild(cancelBtn);
    }

    if (submitText) {
      const submitBtn = document.createElement("button");
      submitBtn.textContent = submitText;
      submitBtn.type = "button";
      submitBtn.className = "modal-btn modal-btn-primary";
      submitBtn.addEventListener("click", async () => {
        if (typeof onSubmit === "function") {
          // Page decides when to actually close
          try {
            await onSubmit({
              close: () => closeModal({ submit: true }),
            });
          } catch (err) {
            console.error("[showFormModal onSubmit error]", err);
          }
        } else {
          // Legacy behavior: auto-close on submit
          closeModal({ submit: true });
        }
      });
      modalFooterEl.appendChild(submitBtn);
    }

    modalBackdrop.classList.add("active");

    return new Promise((resolve) => {
      modalResolve = resolve;
    });
  };
});
