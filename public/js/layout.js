// public/js/layout.js

document.addEventListener("DOMContentLoaded", () => {
  const CURRENT_URL = window.location.pathname; // e.g. /camera.html or /camera
  const HAS_HTML = CURRENT_URL.endsWith(".html");

  const appRoot = document.getElementById("app");
  if (!appRoot) return;

  const currentPage = document.body.dataset.page || "dashboard";
  const pageTemplate = document.getElementById("page-content");

  // Build shared layout shell
  appRoot.innerHTML = `
    <div class="sidebar" id="sidebar">
      <div class="logo">SmartGateKeeper AI</div>
      <ul>
        <li data-page="dashboard">Dashboard</li>
        <li data-page="camera">Camera</li>
        <li data-page="logs">Logs</li>
        <li data-page="drivers">Drivers</li>
        <li data-page="vehicles">Vehicles</li>
        <li data-page="role">Role</li>
        <li data-page="identification-types">Identification Types</li>
        <li data-page="user">Users</li>
        <li data-page="system-config">System Config</li>
      </ul>
      <div class="user-profile">
        <div class="avatar">
          <i class="fas fa-user"></i>
        </div>
        <div class="user-info">
          <p class="user-name">John Doe</p>
          <p class="user-role">Administrator</p>
        </div>
        <a href="#" class="profile-link">Settings</a>
      </div>
    </div>

    <div class="main-content" id="main-content">
      <div class="top-bar">
        <div class="hamburger" id="hamburger">&#9776;</div>
        <div class="page-title" id="page-title">Dashboard Overview</div>
      </div>
      <div class="content">
        <div id="page-container"></div>
      </div>
      <div class="footer">
        SmartGateKeeper AI &nbsp;&copy;&nbsp;2025
      </div>
    </div>

    <div class="overlay" id="overlay"></div>

    <!-- Reusable global modal -->
    <div class="modal-backdrop" id="app-modal-backdrop">
      <div class="modal-container" id="app-modal">
        <div class="modal-header">
          <h3 class="modal-title" id="app-modal-title"></h3>
          <button class="modal-close" id="app-modal-close">&times;</button>
        </div>
        <div class="modal-body" id="app-modal-body"></div>
        <div class="modal-footer" id="app-modal-footer"></div>
      </div>
    </div>
  `;

  // Inject page-specific content
  if (pageTemplate) {
    const clone = pageTemplate.content.cloneNode(true);
    document.getElementById("page-container")?.appendChild(clone);
    pageTemplate.remove();
  }

  const sidebar = document.getElementById("sidebar");
  const mainContent = document.getElementById("main-content");
  const hamburger = document.getElementById("hamburger");
  const overlay = document.getElementById("overlay");
  const menuItems = sidebar.querySelectorAll("ul li");
  const pageTitleEl = document.getElementById("page-title");

  const isMobile = () => window.innerWidth <= 768;

  // Set active menu by data-page
  menuItems.forEach((item) => {
    const page = item.getAttribute("data-page");
    if (page === currentPage) {
      item.classList.add("active");
      if (pageTitleEl) {
        pageTitleEl.textContent = item.textContent.trim() + " Overview";
      }
    }

    item.addEventListener("click", () => {
      const targetPage = item.getAttribute("data-page");
      if (!targetPage) return;

      // Close drawer on mobile after navigation click
      if (isMobile()) {
        sidebar.classList.remove("open");
        overlay.classList.remove("active");
      }

      let href = "";

      switch (targetPage) {
        case "dashboard":
          href = "/index.html";
          break;
        case "camera":
          href = "/camera.html";
          break;
        case "drivers":
          href = "/drivers.html";
          break;
        case "vehicles":
          href = "/vehicles.html";
          break;
        case "identification-types":
          href = "/identification-types.html";
          break;
        case "logs":
          href = "/logs.html";
          break;
        case "role":
          href = "/role.html";
          break;
        case "system-config":
          href = "/system-config.html";
          break;
        case "user":
          href = "/user.html";
          break;
        default:
          href = `/${targetPage}.html`;
      }
      window.location.href = HAS_HTML
        ? href
        : href.replace(".html", "").replace("index", "dashboard");
    });
  });

  // Hamburger click
  hamburger?.addEventListener("click", () => {
    if (isMobile()) {
      // MOBILE: slide-in drawer + dark overlay
      const open = sidebar.classList.contains("open");
      if (open) {
        sidebar.classList.remove("open");
        overlay.classList.remove("active");
      } else {
        sidebar.classList.add("open");
        overlay.classList.add("active");
      }
    } else {
      // DESKTOP: collapse sidebar, no overlay
      const collapsed = sidebar.classList.contains("collapsed");
      if (collapsed) {
        sidebar.classList.remove("collapsed");
        mainContent.classList.remove("collapsed");
      } else {
        sidebar.classList.add("collapsed");
        mainContent.classList.add("collapsed");
      }
      overlay.classList.remove("active"); // just in case
    }
  });

  // Click on overlay closes drawer (mobile only)
  overlay?.addEventListener("click", () => {
    if (!isMobile()) return;
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
  });

  // Handle resize: reset states cleanly when crossing breakpoint
  window.addEventListener("resize", () => {
    if (isMobile()) {
      // entering mobile mode
      sidebar.classList.remove("collapsed");
      mainContent.classList.remove("collapsed");
      overlay.classList.remove("active");
    } else {
      // entering desktop mode
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
      sidebar.classList.remove("collapsed");
      mainContent.classList.remove("collapsed");
    }
  });

  /* =========================================================
   * Reusable Modal API
   *  - window.showConfirm({ title, message, ... }) -> Promise<'yes'|'no'|'cancel'|'close'|'backdrop'>
   *  - window.showAlert({ type, title, message, ... }) -> Promise<'ok'>
   *  - window.showFormModal({ title, render(...) }) -> Promise<{ cancelled: boolean }>
   * =======================================================*/

  const modalBackdrop = document.getElementById("app-modal-backdrop");
  const modalEl = document.getElementById("app-modal");
  const modalTitleEl = document.getElementById("app-modal-title");
  const modalBodyEl = document.getElementById("app-modal-body");
  const modalFooterEl = document.getElementById("app-modal-footer");
  const modalCloseEl = document.getElementById("app-modal-close");

  let modalResolve = null;

  function resetModalClasses() {
    modalEl.className = "modal-container";
  }

  function closeModal(result) {
    // modalBodyEl.innerHTML = "";
    // modalFooterEl.innerHTML = "";
    resetModalClasses();
    if (typeof modalResolve === "function") {
      modalResolve(result);
      modalResolve = null;
    }
    modalBackdrop.classList.remove("active");
  }

  modalCloseEl?.addEventListener("click", () => closeModal("close"));

  // Click outside modal closes it
  modalBackdrop?.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) {
      closeModal("backdrop");
    }
  });

  function openModal({ title, html, variant = "default", buttons = [] }) {
    resetModalClasses();
    if (variant) {
      modalEl.classList.add(`modal-${variant}`);
    }

    modalTitleEl.textContent = title || "";
    modalBodyEl.innerHTML = html || "";
    modalFooterEl.innerHTML = "";

    buttons.forEach((btn) => {
      const b = document.createElement("button");
      b.textContent = btn.label;
      b.type = "button";
      b.className = `modal-btn modal-btn-${btn.variant || "primary"}`;
      b.addEventListener("click", () => {
        closeModal(btn.value);
      });
      modalFooterEl.appendChild(b);
    });

    modalBackdrop.classList.add("active");

    return new Promise((resolve) => {
      modalResolve = resolve;
    });
  }

  // Yes / No / Cancel confirm modal
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

    return openModal({
      title,
      html: `<p>${message}</p>`,
      variant,
      buttons,
    });
  };

  // Success / Error / Info modal
  window.showAlert = function (opts = {}) {
    const {
      title = "Notice",
      message = "",
      type = "info", // 'success' | 'error' | 'info'
      okText = "OK",
    } = opts;

    const variantMap = {
      success: "success",
      error: "error",
      info: "info",
    };

    return openModal({
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
    });
  };

  // Generic form modal (for create/update)
  // Caller renders inputs inside the modal body.
  window.showFormModal = function (opts = {}) {
    const {
      title = "",
      render, // function (bodyEl) { ...create inputs... }
      submitText = "Save",
      cancelText = "Cancel",
      variant = "default",
    } = opts;

    resetModalClasses();
    if (variant) {
      modalEl.classList.add(`modal-${variant}`);
    }

    modalTitleEl.textContent = title || "";
    modalBodyEl.innerHTML = "";
    modalFooterEl.innerHTML = "";

    if (typeof render === "function") {
      render(modalBodyEl);
    } else if (opts.html) {
      modalBodyEl.innerHTML = opts.html;
    }

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = cancelText;
    cancelBtn.type = "button";
    cancelBtn.className = "modal-btn modal-btn-ghost";
    cancelBtn.addEventListener("click", () =>
      closeModal({ cancelled: true })
    );

    const submitBtn = document.createElement("button");
    submitBtn.textContent = submitText;
    submitBtn.type = "button";
    submitBtn.className = "modal-btn modal-btn-primary";
    submitBtn.addEventListener("click", () =>
      closeModal({ cancelled: false })
    );

    modalFooterEl.appendChild(cancelBtn);
    modalFooterEl.appendChild(submitBtn);

    modalBackdrop.classList.add("active");

    return new Promise((resolve) => {
      modalResolve = resolve;
    });
  };

  //
  window.createSelectOptions = function (array = [], selectedValue = null) {
    if (!Array.isArray(array)) return '';

    return array
      .map(value => {
        const selected = value === selectedValue ? 'selected' : '';
        return `<option value="${value}" ${selected}>${value}</option>`;
      })
      .join('');
  }
});
