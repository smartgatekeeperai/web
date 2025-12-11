// public/js/layout.js

document.addEventListener("DOMContentLoaded", async () => {
  
    const isProd = ![
      "localhost",
      "127.",
      "192.168.",
      "10."
    ].some(prefix => location.hostname.startsWith(prefix));

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
      await window.showAlert({
        type: "error",
        title: "Failed to load Role types",
        message: `${err?.message}. Please try again.`,
      });
    }
  }
  /* end */
  
  /* Load Role type and Identification type */
  async function loadRoleType() {
    try {
      const resp = await fetch("/api/role-types/", { method: "GET" });

      if (!resp.ok) {
        throw new Error(`Failed to load Role types`);
      }
      const data = await resp.json();
      localStorage.setItem("role-types", data?.data?.map((x) => x.name));
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
      localStorage.setItem("identification-types", data?.data?.map((x) => x.name));
    } catch (err) {
      console.error(err);
      await window.showAlert({
        type: "error",
        title: "Failed to load Identification types",
        message: `${err?.message}. Please try again.`,
      });
    }
  }
  /* end */
  Promise.all([
    loadVehicleBrands(),
    loadRoleType(), 
    loadIdentificationTypes(),
  ]);

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
        <li data-page="dashboard"><a href="${HAS_HTML ? '/dashboard.html' : 'dashboard' }">Dashboard</a></li>
        <li data-page="camera"><a>Camera</a></li>
        <li data-page="logs"><a>Logs</a></li>
        <li data-page="drivers"><a href="${HAS_HTML ? '/drivers.html' : 'drivers' }">Drivers</a></li>
        <li data-page="vehicles"><a href="${HAS_HTML ? '/vehicles.html' : 'vehicles' }">Vehicles</a></li>
        <li data-page="role-types"><a href="${HAS_HTML ? '/role-types.html' : 'role-types' }">Role Types</a></li>
        <li data-page="identification-types"><a href="${HAS_HTML ? '/identification-types.html' : 'identification-types' }">Identification Types</a></li>
        <li data-page="users"><a href="${HAS_HTML ? '/users.html' : 'users' }">Users</a></li>
        <li data-page="system-config"><a>System Config</a></li>
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


  //data helpers
  window.getAIURL = () => {
    return `${isProd ? 'https://smartgatekeeperai-vehicle-detector.hf.space' : 'http://10.182.54.46:8000'}`;
  }
  window.getRoleTypes = function () {
    return (localStorage.getItem("role-types") ?? "")?.split(",")?.map(x=> x.trim()) ?? [];
  }

  window.getIdentificationTypes = function () {
    return (localStorage.getItem("identification-types") ?? "")?.split(",")?.map(x=> x.trim()) ?? [];
  }
  
  window.getVehicleBrands = function () {
    return (localStorage.getItem("vehicle-brands") ?? "")
      ?.split(",")
      ?.map((x) => x.trim())
      ?.filter(Boolean) ?? [];
  };
  //util helpers
  window.createSelectOptions = function (array = [], selectedValue = null) {
    if (!Array.isArray(array)) return '';

    return array
      .map(value => {
        const selected = value === selectedValue ? 'selected' : '';
        return `<option value="${value}" ${selected}>${value}</option>`;
      })
      .join('');
  }

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

      const desiredHeight = 180; // same as CSS max-height
      const minMargin = 8;

      // base width & horizontal position
      const width = rect.width;
      let left = rect.left;

      // Clamp left so dropdown doesn't go off-screen horizontally
      if (left + width + minMargin > viewportWidth) {
        left = Math.max(minMargin, viewportWidth - width - minMargin);
      }
      if (left < minMargin) {
        left = minMargin;
      }

      listEl.style.minWidth = width + "px";
      listEl.style.left = left + "px";

      // Decide whether to show above or below
      listEl.classList.remove("above");
      listEl.style.top = "auto";
      listEl.style.bottom = "auto";

      if (spaceBelow >= desiredHeight || spaceBelow >= spaceAbove) {
        // show below
        listEl.style.top = rect.bottom + "px";
      } else {
        // show above
        listEl.classList.add("above");
        listEl.style.bottom = viewportHeight - rect.top + "px";
      }
    }

    function renderList(filterText) {
      const q = (filterText || "").toLowerCase();
      const matches = currentItems
        .filter((b) => b.toLowerCase().includes(q))
        .slice(0, 8); // limit suggestions

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
          e.preventDefault(); // avoid blur before click
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
      // small delay so click can register
      setTimeout(() => closeList(), 150);
    });

    // Reposition on window resize / scroll (viewport or modal)
    const modalBody = document.querySelector(".modal-body");

    function handleReposition() {
      if (listEl.style.display === "block") {
        positionList();
      }
    }

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true); // capture scrolls
    modalBody && modalBody.addEventListener("scroll", handleReposition);
  }
});
