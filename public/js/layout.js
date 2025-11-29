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
        <li data-page="role">Role</li>
        <li data-page="id-category">ID Category</li>
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
        Smart Gate Keeper AI &nbsp;&copy;&nbsp;2025
      </div>
    </div>

    <div class="overlay" id="overlay"></div>
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
        case "id-category":
          href = "/id-category.html";
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
      // sidebar hidden by default; overlay off
      overlay.classList.remove("active");
    } else {
      // entering desktop mode
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
      // show sidebar by default, content offset
      sidebar.classList.remove("collapsed"); // or keep if you want collapsed state to persist
      mainContent.classList.remove("collapsed");
    }
  });
});
