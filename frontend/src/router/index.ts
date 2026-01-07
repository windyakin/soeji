import { createRouter, createWebHistory } from "vue-router";
import HomePage from "../pages/HomePage.vue";
import SettingsPage from "../pages/SettingsPage.vue";
import AdminPage from "../pages/AdminPage.vue";
import LoginPage from "../pages/LoginPage.vue";
import SetupPage from "../pages/SetupPage.vue";
import { useAuth } from "../composables/useAuth";

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    requiresAdmin?: boolean;
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: LoginPage,
      meta: { requiresAuth: false },
    },
    {
      path: "/setup",
      name: "setup",
      component: SetupPage,
      meta: { requiresAuth: false },
    },
    {
      path: "/",
      name: "home",
      component: HomePage,
      meta: { requiresAuth: true },
    },
    {
      path: "/gallery/:id",
      name: "gallery",
      component: HomePage,
      meta: { requiresAuth: true },
    },
    {
      path: "/settings",
      name: "settings",
      component: SettingsPage,
      meta: { requiresAuth: true },
    },
    {
      path: "/admin",
      name: "admin",
      component: AdminPage,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
  ],
});

// Navigation guard
router.beforeEach(async (to, _from, next) => {
  const {
    authEnabled,
    isLoggedIn,
    needsSetup,
    authInitialized,
    canManageUsers,
    initialize,
  } = useAuth();

  // Wait for auth to initialize on first navigation
  if (!authInitialized.value) {
    await initialize();
  }

  // If auth is disabled, allow all routes except admin page
  if (!authEnabled.value) {
    // Redirect login/setup/admin pages to home since they're not needed
    if (to.name === "login" || to.name === "setup" || to.name === "admin") {
      return next({ name: "home" });
    }
    return next();
  }

  // Redirect to setup if no users exist
  if (needsSetup.value) {
    if (to.name !== "setup") {
      return next({ name: "setup" });
    }
    return next();
  }

  // Check if route requires auth
  if (to.meta.requiresAuth !== false && !isLoggedIn.value) {
    return next({ name: "login", query: { redirect: to.fullPath } });
  }

  // Check if route requires admin
  if (to.meta.requiresAdmin && !canManageUsers.value) {
    return next({ name: "home" });
  }

  // Don't allow logged-in users to access login/setup pages
  if ((to.name === "login" || to.name === "setup") && isLoggedIn.value) {
    return next({ name: "home" });
  }

  next();
});

export default router;
