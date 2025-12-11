// public/js/layout.js
document.addEventListener("DOMContentLoaded", async () => {
  const isProd = ![
    "localhost",
    "127.",
    "192.168.",
    "10.",
  ].some((prefix) => location.hostname.startsWith(prefix));

  /* Load external API for Vehicle Brand and Model */
  async function loadVehicleBrands() {
    try {
      const resp = await fetch("/api/vehicle-brands/", { method: "GET" });

      if (!resp.ok) {
        throw new Error(`Failed to load Role types`);
      }
      const data = await resp.json();
      localStorage.setItem("vehicle-brands", data?.data);
    } catch (err) {
      console.error(err);
      if (window.showAlert) {
        await window.showAlert({
          type: "error",
          title: "Failed to load Role types",
          message: `${err?.message}. Please try again.`,
        });
      }
    }
  }

  async function loadRoleType() {
    try {
      const resp = await fetch("/api/role-types/", { method: "GET" });

      if (!resp.ok) {
        throw new Error(`Failed to load Role types`);
      }
      const data = await resp.json();
      localStorage.setItem(
        "role-types",
        data?.data?.map((x) => x.name)
      );
    } catch (err) {
      console.error(err);
      if (window.showAlert) {
        await window.showAlert({
          type: "error",
          title: "Failed to load Role types",
          message: `${err?.message}. Please try again.`,
        });
      }
    }
  }

  async function loadIdentificationTypes() {
    try {
      const resp = await fetch("/api/identification-types/", {
        method: "GET",
      });

      if (!resp.ok) {
        throw new Error(`Failed to load Identification types`);
      }
      const data = await resp.json();
      localStorage.setItem(
        "identification-types",
        data?.data?.map((x) => x.name)
      );
    } catch (err) {
      console.error(err);
      if (window.showAlert) {
        await window.showAlert({
          type: "error",
          title: "Failed to load Identification types",
          message: `${err?.message}. Please try again.`,
        });
      }
    }
  }

  Promise.all([loadVehicleBrands(), loadRoleType(), loadIdentificationTypes()]);

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
        <li data-page="dashboard"><a href="${
          HAS_HTML ? "/dashboard.html" : "dashboard"
        }">Dashboard</a></li>
        <li data-page="camera"><a>Camera</a></li>
        <li data-page="logs"><a>Logs</a></li>
        <li data-page="drivers"><a href="${
          HAS_HTML ? "/drivers.html" : "drivers"
        }">Drivers</a></li>
        <li data-page="vehicles"><a href="${
          HAS_HTML ? "/vehicles.html" : "vehicles"
        }">Vehicles</a></li>
        <li data-page="role-types"><a href="${
          HAS_HTML ? "/role-types.html" : "role-types"
        }">Role Types</a></li>
        <li data-page="identification-types"><a href="${
          HAS_HTML ? "/identification-types.html" : "identification-types"
        }">Identification Types</a></li>
        <li data-page="users"><a href="${
          HAS_HTML ? "/users.html" : "users"
        }">Users</a></li>
        <li data-page="system-config"><a>System Config</a></li>
      </ul>
      <div class="user-profile" id="sidebar-user-profile">
        <div class="avatar">
          <i class="fas fa-user"></i>
        </div>
        <div class="user-info">
          <p class="user-name" id="sidebar-user-name">John Doe</p>
          <p class="user-role" id="sidebar-user-role">Administrator</p>
        </div>
        <a href="javascript:void(0)" class="profile-link">Settings</a>
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

    <!-- User menu dropdown -->
    <div class="user-menu" id="user-menu">
      <div class="user-menu-card">
        <div class="user-menu-header" id="user-menu-header">
          <div class="user-menu-avatar">
            <i class="fas fa-user"></i>
          </div>
          <div class="user-menu-text">
            <div class="user-menu-name" id="user-menu-name">John Doe</div>
            <div class="user-menu-username" id="user-menu-username">johndoe</div>
          </div>
        </div>
        <div class="user-menu-divider"></div>
        <button class="user-menu-item" id="user-menu-change-password">
          <i class="fas fa-key"></i>
          <span>Change password</span>
        </button>
        <button class="user-menu-item" id="user-menu-logout">
          <i class="fas fa-right-from-bracket"></i>
          <span>Log out</span>
        </button>
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
  const userProfile = document.getElementById("sidebar-user-profile");
  const userMenu = document.getElementById("user-menu");
  const userMenuHeader = document.getElementById("user-menu-header");
  const userMenuChangePassword = document.getElementById(
    "user-menu-change-password"
  );
  const userMenuLogout = document.getElementById("user-menu-logout");
  const userMenuNameEl = document.getElementById("user-menu-name");
  const userMenuUsernameEl = document.getElementById("user-menu-username");
  const sidebarUserNameEl = document.getElementById("sidebar-user-name");
  const sidebarUserRoleEl = document.getElementById("sidebar-user-role");

  const isMobile = () => window.innerWidth <= 768;

  // ----- User menu helpers -----
  let isUserMenuOpen = false;

  function positionUserMenu() {
    if (!userProfile || !userMenu) return;
    const rect = userProfile.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    userMenu.style.left = rect.left + "px";
    userMenu.style.bottom = viewportHeight - rect.top + 8 + "px";
  }

  function openUserMenu() {
    if (!userMenu) return;
    positionUserMenu();
    userMenu.classList.add("open");
    isUserMenuOpen = true;
  }

  function closeUserMenu() {
    if (!userMenu) return;
    userMenu.classList.remove("open");
    isUserMenuOpen = false;
  }

  // Clicking the bottom user strip toggles the user menu
  userProfile?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isUserMenuOpen) {
      closeUserMenu();
    } else {
      openUserMenu();
    }
  });

  // Close user menu on outside click
  document.addEventListener("click", (e) => {
    if (!isUserMenuOpen) return;
    if (
      userMenu.contains(e.target) ||
      (userProfile && userProfile.contains(e.target))
    ) {
      return;
    }
    closeUserMenu();
  });

  // ----- Top menu / navigation -----
  menuItems.forEach((item) => {
    const page = item.getAttribute("data-page");
    if (page === currentPage) {
      item.classList.add("active");
      if (pageTitleEl) {
        pageTitleEl.textContent = item.textContent.trim();
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
          // href = "/camera.html";
          break;
        case "drivers":
          href = "/drivers.html";
          break;
        case "vehicles":
          href = "/vehicles.html";
          break;
        case "identification-types":
          // href = "/identification-types.html";
          break;
        case "logs":
          // href = "/logs.html";
          break;
        case "role-types":
          // href = "/role-types.html";
          break;
        case "system-config":
          // href = "/system-config.html";
          break;
        case "user":
          // href = "/user.html";
          break;
        default:
          href = `/${targetPage}.html`;
      }
      // window.location.href = HAS_HTML
      //   ? href
      //   : href.replace(".html", "").replace("index", "dashboard");
    });
  });

  // Hamburger click
  hamburger?.addEventListener("click", () => {
    closeUserMenu();
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
      overlay.classList.remove("active");
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

    if (isUserMenuOpen) {
      closeUserMenu();
    }
  });

  // ----- User menu actions -----

  // Click header -> open "Update profile" modal
  userMenuHeader?.addEventListener("click", async () => {
    if (isUserMenuOpen) {
      closeUserMenu();
    }
    const currentName =
      sidebarUserNameEl?.textContent?.trim() || "John Doe";
    const currentRole =
      sidebarUserRoleEl?.textContent?.trim() || "Administrator";
    const currentUsername =
      userMenuUsernameEl?.textContent?.trim() || "johndoe";

    if (typeof window.showFormModal !== "function") return;

    window.showFormModal({
      title: "Update user details",
      variant: "info",
      submitText: "Save changes",
      cancelText: "Cancel",
      render: (bodyEl) => {
        bodyEl.innerHTML = `
          <div class="modal-form">
            <label>
              Role: ${currentRole}
            </label>
            <label>
              Full name
              <input type="text" id="profile-name-input" value="${currentName}" />
            </label>
            <label>
              Username
              <input type="text" id="profile-username-input" value="${currentUsername}" />
            </label>
          </div>
        `;
      },
      onSubmit: async ({ close }) => {
        const name = document
          .getElementById("profile-name-input")
          ?.value.trim();
        const username = document
          .getElementById("profile-username-input")
          ?.value.trim();
        const role = document
          .getElementById("profile-role-input")
          ?.value.trim();

        if (!name || !username) {
          await window.showAlert({
            type: "error",
            title: "Missing fields",
            message: "Name and username are required.",
          });
          return;
        }

        // TODO: hook this up to a real backend API.
        // For now we just update the visible UI.
        if (sidebarUserNameEl) sidebarUserNameEl.textContent = name;
        if (sidebarUserRoleEl) sidebarUserRoleEl.textContent = role || " ";
        if (userMenuNameEl) userMenuNameEl.textContent = name;
        if (userMenuUsernameEl) userMenuUsernameEl.textContent = username;

        await window.showAlert({
          type: "success",
          title: "Profile updated",
          message: "User details were updated locally.",
        });

        close();
      },
    });
  });

  // Change password (placeholder – wire to your API when ready)
  userMenuChangePassword?.addEventListener("click", async () => {
    closeUserMenu();
    if (typeof window.showAlert !== "function") return;
    await window.showAlert({
      type: "info",
      title: "Change password",
      message:
        "Password change from this menu is not wired yet. You can use the Users page update-password feature for now.",
    });
  });

  // Simple logout redirect (adjust to your actual logout URL)
  userMenuLogout?.addEventListener("click", () => {
    closeUserMenu();
    // window.location.href = "/logout";
  });

  // ===== Global data helpers =====
  window.getAIURL = () => {
    return `${
      isProd
        ? "https://smartgatekeeperai-vehicle-detector.hf.space"
        : "http://10.182.54.46:8000"
    }`;
  };

  window.getRoleTypes = function () {
    return (localStorage.getItem("role-types") ?? "")
      ?.split(",")
      ?.map((x) => x.trim()) ?? [];
  };

  window.getIdentificationTypes = function () {
    return (localStorage.getItem("identification-types") ?? "")
      ?.split(",")
      ?.map((x) => x.trim()) ?? [];
  };

  window.getVehicleBrands = function () {
    return (
      (localStorage.getItem("vehicle-brands") ?? "")
        ?.split(",")
        ?.map((x) => x.trim())
        ?.filter(Boolean) ?? []
    );
  };

  // ===== Util helpers =====
  window.createSelectOptions = function (array = [], selectedValue = null) {
    if (!Array.isArray(array)) return "";

    return array
      .map((value) => {
        const selected = value === selectedValue ? "selected" : "";
        return `<option value="${value}" ${selected}>${value}</option>`;
      })
      .join("");
  };

  window.setupAutocomplete = function (inputEl, listEl, items = []) {
    if (!inputEl || !listEl || !Array.isArray(items)) return;

    let currentItems = [...items];

    function closeList() {
      listEl.innerHTML = "";
      listEl.style.display = "none";
    }

    function positionList() {
      const rect = inputEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;

      const desiredHeight = 180;
      const minMargin = 8;

      const width = rect.width;
      let left = rect.left;

      if (left + width + minMargin > viewportWidth) {
        left = Math.max(minMargin, viewportWidth - width - minMargin);
      }
      if (left < minMargin) {
        left = minMargin;
      }

      listEl.style.minWidth = width + "px";
      listEl.style.left = left + "px";

      listEl.classList.remove("above");
      listEl.style.top = "auto";
      listEl.style.bottom = "auto";

      if (spaceBelow >= desiredHeight || spaceBelow >= spaceAbove) {
        listEl.style.top = rect.bottom + "px";
      } else {
        listEl.classList.add("above");
        listEl.style.bottom = viewportHeight - rect.top + "px";
      }
    }

    function renderList(filterText) {
      const q = (filterText || "").toLowerCase();
      const matches = currentItems
        .filter((b) => b.toLowerCase().includes(q))
        .slice(0, 8);

      if (!matches.length) {
        closeList();
        return;
      }

      listEl.innerHTML = "";
      matches.forEach((brand) => {
        const div = document.createElement("div");
        div.className = "autocomplete-item";
        div.textContent = brand;
        div.addEventListener("mousedown", (e) => {
          e.preventDefault();
          inputEl.value = brand;
          closeList();
        });
        listEl.appendChild(div);
      });

      listEl.style.display = "block";
      positionList();
    }

    inputEl.addEventListener("input", () => {
      const val = inputEl.value.trim();
      if (!val) {
        closeList();
        return;
      }
      renderList(val);
    });

    inputEl.addEventListener("focus", () => {
      const val = inputEl.value.trim();
      if (val) {
        renderList(val);
      }
    });

    inputEl.addEventListener("blur", () => {
      setTimeout(() => closeList(), 150);
    });

    const modalBody = document.querySelector(".modal-body");

    function handleReposition() {
      if (listEl.style.display === "block") {
        positionList();
      }

      closeUserMenu();
    }

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    modalBody && modalBody.addEventListener("scroll", handleReposition);
  };
});
