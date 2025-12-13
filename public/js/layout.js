// public/js/layout.js
document.addEventListener("DOMContentLoaded", async () => {
  const isProd = !["localhost", "127.", "192.168.", "10."].some((prefix) =>
    location.hostname.startsWith(prefix)
  );

  // Pages that should NOT have sidebar/topbar layout
  const LAYOUT_EXEMPT_PAGES = new Set(["login"]);

  // ---------------------------
  // USER (localStorage: "user")
  // ---------------------------
  function safeParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function getUserFromStorage() {
    const raw = localStorage.getItem("user");
    const obj = safeParseJSON(raw);

    // expected: { id, name, username }
    if (!obj || typeof obj !== "object") return null;

    const id = obj.id ?? obj.userId ?? obj._id ?? null;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    const username = typeof obj.username === "string" ? obj.username.trim() : "";

    // require username
    if (!username) return null;

    return { id, name, username };
  }

  function saveUserToStorage(user) {
    if (!user || typeof user !== "object") return;
    const clean = {
      id: user.id ?? null,
      name: String(user.name ?? "").trim(),
      username: String(user.username ?? "").trim(),
    };
    localStorage.setItem("user", JSON.stringify(clean));
  }

  function initialsFromName(name, username) {
    const n = String(name || "").trim();
    if (n) {
      const parts = n.split(/\s+/).filter(Boolean);
      const a = parts[0]?.[0] ?? "U";
      const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
      return (a + b).toUpperCase();
    }
    const u = String(username || "").trim();
    return (u[0] || "U").toUpperCase();
  }

  async function readJsonSafe(resp) {
    try {
      return await resp.json();
    } catch {
      return null;
    }
  }

  // ---------------------------
  // PAGE INFO
  // ---------------------------
  const currentPage = document.body.dataset.page || "dashboard";
  const isLayoutExempt = LAYOUT_EXEMPT_PAGES.has(currentPage);

  // ---------------------------
  // AUTH GUARD (redirect if no user)
  // ---------------------------
  let currentUser = getUserFromStorage(); // NO FALLBACK

  if (!isLayoutExempt && !currentUser) {
    if (
      !location.pathname.endsWith("/login.html") &&
      !location.pathname.endsWith("/login")
    ) {
      window.location.replace("/login");
      return;
    }
  }

  // ---------------------------
  // DATA LOADERS (skip on login)
  // ---------------------------
  async function loadVehicleBrands() {
    try {
      const resp = await fetch("/api/vehicle-brands/", { method: "GET" });
      if (!resp.ok) throw new Error(`Failed to load Vehicle brands`);
      const data = await resp.json();
      localStorage.setItem("vehicle-brands", data?.data);
    } catch (err) {
      console.error(err);
      await window.showAlert?.({
        type: "error",
        title: "Failed to load Vehicle brands",
        message: `${err?.message}. Please try again.`,
      });
    }
  }

  async function loadRoleType() {
    try {
      const resp = await fetch("/api/role-types/", { method: "GET" });
      if (!resp.ok) throw new Error(`Failed to load Role types`);
      const data = await resp.json();
      localStorage.setItem("role-types", data?.data?.map((x) => x.name));
    } catch (err) {
      console.error(err);
      await window.showAlert?.({
        type: "error",
        title: "Failed to load Role types",
        message: `${err?.message}. Please try again.`,
      });
    }
  }

  async function loadIdentificationTypes() {
    try {
      const resp = await fetch("/api/identification-types/", { method: "GET" });
      if (!resp.ok) throw new Error(`Failed to load Identification types`);
      const data = await resp.json();
      localStorage.setItem(
        "identification-types",
        data?.data?.map((x) => x.name)
      );
    } catch (err) {
      console.error(err);
      await window.showAlert?.({
        type: "error",
        title: "Failed to load Identification types",
        message: `${err?.message}. Please try again.`,
      });
    }
  }

  if (!isLayoutExempt) {
    Promise.all([loadVehicleBrands(), loadRoleType(), loadIdentificationTypes()]);
  }

  // ---------------------------
  // PAGE TEMPLATE
  // ---------------------------
  const appRoot = document.getElementById("app");
  if (!appRoot) return;

  const pageTemplate = document.getElementById("page-content");

  // ---------------------------
  // BUILD LAYOUT
  // ---------------------------
  const CURRENT_URL = window.location.pathname;
  const HAS_HTML = CURRENT_URL.endsWith(".html");

  if (isLayoutExempt) {
    appRoot.innerHTML = `
      <div class="auth-shell">
        <div id="page-container"></div>
      </div>

      <!-- Reusable global modal (still available for alerts/forms) -->
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
  } else {
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
          <div class="avatar" id="sidebar-user-avatar">
            <i class="fas fa-user"></i>
          </div>
          <div class="user-info">
            <p class="user-name" id="sidebar-user-name"></p>
            <p class="user-role" id="sidebar-user-role"></p>
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
            <div class="user-menu-avatar" id="user-menu-avatar">
              <i class="fas fa-user"></i>
            </div>
            <div class="user-menu-text">
              <div class="user-menu-name" id="user-menu-name"></div>
              <div class="user-menu-username" id="user-menu-username"></div>
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
  }

  // Inject page-specific content
  if (pageTemplate) {
    const clone = pageTemplate.content.cloneNode(true);
    document.getElementById("page-container")?.appendChild(clone);
    pageTemplate.remove();
  }

  // ---------------------------
  // Global helpers (available everywhere)
  // ---------------------------
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
      if (left < minMargin) left = minMargin;

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
      if (!val) return closeList();
      renderList(val);
    });

    inputEl.addEventListener("focus", () => {
      const val = inputEl.value.trim();
      if (val) renderList(val);
    });

    inputEl.addEventListener("blur", () => {
      setTimeout(() => closeList(), 150);
    });

    window.addEventListener("resize", () => {
      if (listEl.style.display === "block") positionList();
    });
    window.addEventListener(
      "scroll",
      () => {
        if (listEl.style.display === "block") positionList();
      },
      true
    );
  };

  // ---------------------------
  // Stop here if page is exempt
  // ---------------------------
  if (isLayoutExempt) return;

  // ---------------------------
  // Full layout-only logic below
  // ---------------------------
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

  const sidebarUserNameEl = document.getElementById("sidebar-user-name");
  const sidebarUserRoleEl = document.getElementById("sidebar-user-role");
  const sidebarUserAvatarEl = document.getElementById("sidebar-user-avatar");
  const userMenuNameEl = document.getElementById("user-menu-name");
  const userMenuUsernameEl = document.getElementById("user-menu-username");
  const userMenuAvatarEl = document.getElementById("user-menu-avatar");

  const isMobile = () => window.innerWidth <= 768;

  function applyUserToUI(user) {
    const name = String(user?.name || "").trim();
    const username = String(user?.username || "").trim();
    const initials = initialsFromName(name, username);

    if (sidebarUserNameEl) sidebarUserNameEl.textContent = name || username;
    if (userMenuNameEl) userMenuNameEl.textContent = name || username;
    if (userMenuUsernameEl) userMenuUsernameEl.textContent = username;

    if (sidebarUserRoleEl) sidebarUserRoleEl.textContent = "";

    if (sidebarUserAvatarEl) {
      sidebarUserAvatarEl.innerHTML = initials;
      sidebarUserAvatarEl.style.fontWeight = "700";
    }
    if (userMenuAvatarEl) {
      userMenuAvatarEl.innerHTML = initials;
      userMenuAvatarEl.style.fontWeight = "700";
    }
  }

  applyUserToUI(currentUser);

  // ----- user menu dropdown -----
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

  userProfile?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isUserMenuOpen) closeUserMenu();
    else openUserMenu();
  });

  document.addEventListener("click", (e) => {
    if (!isUserMenuOpen) return;
    if (
      userMenu.contains(e.target) ||
      (userProfile && userProfile.contains(e.target))
    )
      return;
    closeUserMenu();
  });

  // active menu title
  menuItems.forEach((item) => {
    const page = item.getAttribute("data-page");
    if (page === currentPage) {
      item.classList.add("active");
      if (pageTitleEl) pageTitleEl.textContent = item.textContent.trim();
    }
  });

  // Hamburger click
  hamburger?.addEventListener("click", () => {
    closeUserMenu();
    if (isMobile()) {
      const open = sidebar.classList.contains("open");
      if (open) {
        sidebar.classList.remove("open");
        overlay.classList.remove("active");
      } else {
        sidebar.classList.add("open");
        overlay.classList.add("active");
      }
    } else {
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

  overlay?.addEventListener("click", () => {
    if (!isMobile()) return;
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
  });

  window.addEventListener("resize", () => {
    if (isMobile()) {
      sidebar.classList.remove("collapsed");
      mainContent.classList.remove("collapsed");
      overlay.classList.remove("active");
    } else {
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
      sidebar.classList.remove("collapsed");
      mainContent.classList.remove("collapsed");
    }
    if (isUserMenuOpen) closeUserMenu();
  });

  // -------------------------------------------------------
  // Helper: init show/hide password toggles (users.css style)
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

  // Header click -> update user details modal (API + confirm)
  userMenuHeader?.addEventListener("click", async () => {
    closeUserMenu();

    currentUser = getUserFromStorage();
    if (!currentUser) {
      window.location.replace("/login");
      return;
    }

    const currentName = String(currentUser.name || "").trim();
    const currentUsername = String(currentUser.username || "").trim();
    const currentId = currentUser.id ?? null;

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
              Name
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
        const name =
          document.getElementById("profile-name-input")?.value.trim() || "";
        const username = document
          .getElementById("profile-username-input")
          ?.value.trim();

        if (!username) {
          await window.showAlert?.({
            type: "error",
            title: "Missing fields",
            message: "Username is required.",
            backdropClosable: true,
          });
          return;
        }

        const confirmResult = await window.showConfirm?.({
          title: "Confirm update",
          message:
            "Save these changes to your profile? This will update your account details.",
          yesText: "Save",
          cancelText: "Cancel",
          showNo: false,
          showCancel: true,
          variant: "confirm",
          backdropClosable: true,
        });

        if (confirmResult !== "yes") return;

        const payload = { id: currentId, username, name };

        try {
          const resp = await fetch("/api/users/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const result = await readJsonSafe(resp);

          if (!resp.ok || (result && result.success === false)) {
            await window.showAlert?.({
              type: "error",
              title: "Update failed",
              message:
                result?.message || "Unable to update user. Please try again.",
              backdropClosable: true,
            });
            return;
          }

          const updatedUser = result?.data;
          if (!updatedUser?.username) {
            await window.showAlert?.({
              type: "error",
              title: "Invalid response",
              message: "Update response is missing user data.",
              backdropClosable: true,
            });
            return;
          }

          saveUserToStorage(updatedUser);
          currentUser = getUserFromStorage();
          applyUserToUI(currentUser);

          await window.showAlert?.({
            type: "success",
            title: "Profile updated",
            message: "Your profile has been updated successfully.",
            backdropClosable: true,
          });

          close();
        } catch (err) {
          console.error("[profile update] error:", err);
          await window.showAlert?.({
            type: "error",
            title: "Network error",
            message: "Unable to reach the server. Please try again.",
            backdropClosable: true,
          });
        }
      },
    });
  });

  // Change password (uniform password-field layout + toggle-password-btn)
  userMenuChangePassword?.addEventListener("click", async () => {
    closeUserMenu();

    currentUser = getUserFromStorage();
    if (!currentUser) {
      window.location.replace("/login");
      return;
    }

    const userId = currentUser.id;

    if (!userId) {
      await window.showAlert?.({
        type: "error",
        title: "Missing user ID",
        message: "Cannot change password because your user ID is missing.",
        backdropClosable: true,
      });
      return;
    }

    if (typeof window.showFormModal !== "function") return;

    window.showFormModal({
      title: "Change password",
      variant: "info",
      submitText: "Update password",
      cancelText: "Cancel",
      render: (bodyEl) => {
        bodyEl.innerHTML = `
          <div class="modal-form">
            <label>
              Current password
              <div class="password-field">
                <input
                  type="password"
                  id="old-password-input"
                  placeholder="Enter current password"
                  autocomplete="current-password"
                />
                <button
                  type="button"
                  class="toggle-password-btn"
                  data-target-id="old-password-input"
                  title="Show/Hide password"
                  aria-label="Show password"
                >
                  <i class="fa-solid fa-eye"></i>
                </button>
              </div>
            </label>

            <label>
              New password
              <div class="password-field">
                <input
                  type="password"
                  id="new-password-input"
                  placeholder="Enter new password"
                  autocomplete="new-password"
                />
                <button
                  type="button"
                  class="toggle-password-btn"
                  data-target-id="new-password-input"
                  title="Show/Hide password"
                  aria-label="Show password"
                >
                  <i class="fa-solid fa-eye"></i>
                </button>
              </div>
            </label>

            <label>
              Confirm new password
              <div class="password-field">
                <input
                  type="password"
                  id="confirm-new-password-input"
                  placeholder="Confirm new password"
                  autocomplete="new-password"
                />
                <button
                  type="button"
                  class="toggle-password-btn"
                  data-target-id="confirm-new-password-input"
                  title="Show/Hide password"
                  aria-label="Show password"
                >
                  <i class="fa-solid fa-eye"></i>
                </button>
              </div>
            </label>
          </div>
        `;

        // Enable show/hide on these password fields (uses users.css behavior)
        initPasswordToggles(bodyEl);
      },
      onSubmit: async ({ close }) => {
        const oldPassword =
          document.getElementById("old-password-input")?.value.trim() || "";
        const password =
          document.getElementById("new-password-input")?.value.trim() || "";
        const confirmPassword =
          document
            .getElementById("confirm-new-password-input")
            ?.value.trim() || "";

        if (!oldPassword || !password || !confirmPassword) {
          await window.showAlert?.({
            type: "error",
            title: "Missing fields",
            message: "Please fill all password fields.",
            backdropClosable: true,
          });
          return;
        }

        if (password !== confirmPassword) {
          await window.showAlert?.({
            type: "error",
            title: "Passwords do not match",
            message: "Please ensure the new passwords are identical.",
            backdropClosable: true,
          });
          return;
        }

        const confirmResult = await window.showConfirm?.({
          title: "Confirm password change",
          message:
            "Are you sure you want to change your password? You will need to use the new password next time you sign in.",
          yesText: "Change password",
          cancelText: "Cancel",
          showNo: false,
          showCancel: true,
          variant: "confirm",
          backdropClosable: true,
        });

        if (confirmResult !== "yes") return;

        try {
          const resp = await fetch(
            `/api/users/${encodeURIComponent(userId)}/change-password`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ oldPassword, password }),
            }
          );

          const result = await readJsonSafe(resp);

          if (!resp.ok || (result && result.success === false)) {
            await window.showAlert?.({
              type: "error",
              title: "Change password failed",
              message:
                result?.message ||
                "Unable to change password. Please check your current password and try again.",
              backdropClosable: true,
            });
            return;
          }

          // response body = { success: true, data: { id, username, name } }
          const updatedUser = result?.data;

          if (!updatedUser?.username) {
            await window.showAlert?.({
              type: "error",
              title: "Invalid response",
              message: "Server response is missing user data.",
              backdropClosable: true,
            });
            return;
          }

          // keep storage/UI consistent
          saveUserToStorage(updatedUser);
          currentUser = getUserFromStorage();
          applyUserToUI(currentUser);

          await window.showAlert?.({
            type: "success",
            title: "Password updated",
            message: "Your password has been changed successfully.",
            backdropClosable: true,
          });

          close();
        } catch (err) {
          console.error("[change password] error:", err);
          await window.showAlert?.({
            type: "error",
            title: "Network error",
            message: "Unable to reach the server. Please try again.",
            backdropClosable: true,
          });
        }
      },
    });
  });

  // Logout (confirm)
  userMenuLogout?.addEventListener("click", async () => {
    closeUserMenu();

    const confirmResult = await window.showConfirm?.({
      title: "Confirm logout",
      message: "Are you sure you want to log out of SmartGateKeeper AI?",
      yesText: "Log out",
      noText: "Stay",
      cancelText: "Cancel",
      showNo: true,
      showCancel: true,
      variant: "confirm",
      backdropClosable: true,
    });

    if (confirmResult !== "yes") return;

    localStorage.removeItem("user");
    window.location.replace("/login");
  });
});
