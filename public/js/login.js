// public/js/login.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  if (!form) return;

  // ------------------------------------
  // Show/Hide password
  // ------------------------------------
  const passInput = document.getElementById("login-password");
  const toggleBtn = document.getElementById("toggle-password");

  function setPasswordVisible(visible) {
    if (!passInput || !toggleBtn) return;

    passInput.type = visible ? "text" : "password";
    toggleBtn.setAttribute(
      "aria-label",
      visible ? "Hide password" : "Show password"
    );
    toggleBtn.title = visible ? "Hide password" : "Show password";

    const icon = toggleBtn.querySelector("i");
    if (icon) {
      icon.className = visible ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    }
  }

  let isVisible = false;
  toggleBtn?.addEventListener("click", () => {
    isVisible = !isVisible;
    setPasswordVisible(isVisible);
  });

  // Optional: press ESC while focused to hide again
  passInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isVisible) {
      isVisible = false;
      setPasswordVisible(false);
    }
  });

  // ------------------------------------
  // If already logged in → redirect
  // ------------------------------------
  try {
    const existing = JSON.parse(localStorage.getItem("user"));
    if (existing?.username) {
      window.location.href = "/dashboard";
      return;
    }
  } catch {
    /* ignore */
  }

  // ------------------------------------
  // Submit handler
  // ------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("login-username")?.value.trim();
    const password = document.getElementById("login-password")?.value.trim();

    if (!username || !password) {
      await window.showAlert?.({
        type: "error",
        title: "Missing fields",
        message: "Please enter both username and password.",
      });
      return;
    }

    try {
      const resp = await fetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!resp.ok) {
        let msg = "Login failed. Please try again.";
        try {
          const errData = await resp.json();
          msg = errData?.message || msg;
        } catch {}
        await window.showAlert?.({
          type: "error",
          title: "Login failed",
          message: msg,
        });
        return;
      }

      const result = await resp.json();

      if (!result || result.success === false) {
        await window.showAlert?.({
          type: "error",
          title: "Login failed",
          message: result?.message || "Invalid username or password.",
        });
        return;
      }

      const user = result?.data;
      if (!user?.id || !user?.username) {
        await window.showAlert?.({
          type: "error",
          title: "Invalid response",
          message: "Login response is missing user data.",
        });
        return;
      }

      localStorage.setItem("user", JSON.stringify(user));
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("[login] error:", err);
      await window.showAlert?.({
        type: "error",
        title: "Network error",
        message: "Unable to reach the server. Please try again.",
      });
    }
  });
});
