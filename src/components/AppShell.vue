<template>
  <main class="app-shell" :class="{ 'mobile-nav-open': isMobileNavOpen }">
    <aside class="sidebar" aria-label="Navegacao principal">
      <router-link class="brand" to="/dashboard" aria-label="Agua+ dashboard">
        <span><ion-icon :icon="waterOutline" /></span>
        Agua<b>+</b>
      </router-link>

      <nav class="side-nav">
        <router-link v-for="item in navItems" :key="item.to" :to="item.to" :class="{ active: isActive(item.to) }">
          <ion-icon :icon="item.icon" />
          {{ item.label }}
        </router-link>
      </nav>

      <router-link class="settings" to="/configuracoes" :class="{ active: isActive('/configuracoes') }">
        <ion-icon :icon="settingsOutline" />
        Configuracoes
      </router-link>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <button
          class="icon-button mobile-only"
          type="button"
          :aria-expanded="isMobileNavOpen"
          aria-controls="mobile-navigation"
          aria-label="Abrir menu"
          @click="toggleMobileNav"
        >
          <ion-icon :icon="menuOutline" />
        </button>
        <div>
          <p>{{ displayedEyebrow }}</p>
          <h1>{{ title }}</h1>
        </div>
        <div v-if="showPeriod" class="period-menu">
          <button class="period" type="button" :aria-expanded="isPeriodMenuOpen" aria-haspopup="menu" @click="togglePeriodMenu">
            {{ periodLabel }}
            <ion-icon :icon="chevronDownOutline" />
          </button>
          <div v-if="isPeriodMenuOpen" class="period-card" role="menu">
            <router-link v-for="option in periodOptions" :key="option.to" :to="option.to" role="menuitem" @click="closePeriodMenu">
              <span>{{ option.label }}</span>
              <small>{{ option.detail }}</small>
            </router-link>
          </div>
        </div>
        <div class="notification-menu">
          <button
            class="icon-button"
            type="button"
            :aria-expanded="isNotificationsOpen"
            aria-haspopup="menu"
            aria-label="Notificacoes"
            @click="toggleNotifications"
          >
            <ion-icon :icon="notificationsOutline" />
            <i v-if="unreadCount" />
          </button>
          <div v-if="isNotificationsOpen" class="notification-card" role="menu">
            <div class="notification-head">
              <strong>Notificacoes</strong>
              <button v-if="unreadCount" type="button" @click="readAllNotifications">Marcar lidas</button>
            </div>
            <button
              v-for="notification in notifications"
              :key="notification.id"
              class="notification-item"
              :class="{ unread: !notification.read, success: notification.type === 'success' }"
              type="button"
              role="menuitem"
              @click="openNotification(notification)"
            >
              <span />
              <div>
                <strong>{{ notification.title }}</strong>
                <small>{{ notification.message }}</small>
              </div>
            </button>
            <p v-if="!notifications.length" class="empty-notifications">Nada novo por aqui.</p>
          </div>
        </div>
      </header>

      <slot />
    </section>

    <nav id="mobile-navigation" class="bottom-nav" :class="{ open: isMobileNavOpen }" aria-label="Navegacao mobile">
      <router-link v-for="item in bottomNavItems" :key="item.to" :to="item.to" :class="{ active: isActive(item.to) }" @click="closeMobileNav">
        <ion-icon :icon="item.icon" />
        <span>{{ item.shortLabel }}</span>
      </router-link>
    </nav>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonIcon } from '@ionic/vue';
import {
  barChartOutline,
  chevronDownOutline,
  documentTextOutline,
  hardwareChipOutline,
  homeOutline,
  menuOutline,
  notificationsOutline,
  personOutline,
  pieChartOutline,
  settingsOutline,
  waterOutline,
} from 'ionicons/icons';
import { getAccount, onAccountChange, saveAccount } from '../data/account-store.js';
import { resolveAccountTheme } from '../data/theme-store.js';
import { getCurrentUser, getUserProfile, watchAuthUser } from '../services/firebase.js';
import { getNotifications, markAllNotificationsRead, markNotificationRead, onNotificationsChange } from '../data/notifications-store.js';

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  eyebrow: {
    type: String,
    default: '',
  },
  periodLabel: {
    type: String,
    default: 'Hoje',
  },
  showPeriod: {
    type: Boolean,
    default: true,
  },
});

const route = useRoute();
const router = useRouter();
const isPeriodMenuOpen = ref(false);
const isNotificationsOpen = ref(false);
const isMobileNavOpen = ref(false);
const notifications = ref(getNotifications());
const account = ref(getAccount());
let stopNotificationsListener = null;
let stopAccountListener = null;
let stopAuthListener = null;

const navItems = [
  { label: 'Inicio', shortLabel: 'Inicio', to: '/dashboard', icon: homeOutline },
  { label: 'Consumo', shortLabel: 'Consumo', to: '/consumo', icon: barChartOutline },
  { label: 'Metas', shortLabel: 'Metas', to: '/metas', icon: pieChartOutline },
  { label: 'Dispositivos', shortLabel: 'Disp.', to: '/dispositivos', icon: hardwareChipOutline },
  { label: 'Relatorios', shortLabel: 'Relat.', to: '/relatorios', icon: documentTextOutline },
  { label: 'Perfil', shortLabel: 'Perfil', to: '/perfil', icon: personOutline },
];

const bottomNavItems = [
  ...navItems,
  { label: 'Configuracoes', shortLabel: 'Config.', to: '/configuracoes', icon: settingsOutline },
];

const periodOptions = [
  { label: 'Esta semana', detail: 'Resumo da semana atual', to: '/consumo' },
  { label: 'Semana passada', detail: 'Resumo dos ultimos 7 dias fechados', to: '/consumo/semana-passada' },
  { label: 'Mes passado', detail: 'Resumo do ciclo mensal anterior', to: '/consumo/mes-passado' },
];

const firstName = computed(() => String(account.value.name || '').trim().split(/\s+/).filter(Boolean)[0] || '');
const displayedEyebrow = computed(() => props.eyebrow || (firstName.value ? `Ola, ${firstName.value}` : 'Ola'));

const refreshAccountName = async (user = getCurrentUser()) => {
  if (!user) {
    account.value = getAccount();
    return;
  }

  try {
    const remoteProfile = await getUserProfile(user.uid);
    const localAccount = getAccount({ uid: user.uid, email: user.email });
    const hasMatchingLocalAccount = Boolean(localAccount.uid && localAccount.uid === user.uid);
    const resolvedTheme = resolveAccountTheme({
      remoteTheme: remoteProfile?.theme,
      themeConfigured: remoteProfile?.themeConfigured,
      localTheme: hasMatchingLocalAccount ? localAccount.theme : '',
    });
    account.value = saveAccount({
      ...(hasMatchingLocalAccount ? localAccount : {}),
      ...(remoteProfile || {}),
      uid: user.uid,
      email: user.email || remoteProfile?.email || '',
      name: remoteProfile?.name || user.displayName || '',
      avatarImage: remoteProfile?.avatarImage || user.photoURL || '',
      theme: resolvedTheme || 'light',
    });
  } catch (error) {
    account.value = {
      ...getAccount({ uid: user.uid, email: user.email }),
      name: getAccount({ uid: user.uid, email: user.email }).name || user.displayName || '',
    };
  }
};
const togglePeriodMenu = () => {
  isPeriodMenuOpen.value = !isPeriodMenuOpen.value;
};

const closePeriodMenu = () => {
  isPeriodMenuOpen.value = false;
};

const unreadCount = computed(() => notifications.value.filter((notification) => !notification.read).length);

const refreshNotifications = () => {
  notifications.value = getNotifications();
};

const toggleNotifications = () => {
  closeMobileNav();
  closePeriodMenu();
  isNotificationsOpen.value = !isNotificationsOpen.value;
};

const toggleMobileNav = () => {
  isNotificationsOpen.value = false;
  closePeriodMenu();
  isMobileNavOpen.value = !isMobileNavOpen.value;
};

const closeMobileNav = () => {
  isMobileNavOpen.value = false;
};

const openNotification = (notification) => {
  notifications.value = markNotificationRead(notification.id);
  isNotificationsOpen.value = false;
  closeMobileNav();
  router.push(notification.to || '/perfil');
};

const readAllNotifications = () => {
  notifications.value = markAllNotificationsRead();
};

const isActive = (path) => {
  if (path === '/consumo' || path === '/dispositivos') {
    return route.path.startsWith(path);
  }

  return route.path === path;
};

onMounted(() => {
  stopNotificationsListener = onNotificationsChange(refreshNotifications);
  stopAccountListener = onAccountChange((nextAccount) => {
    account.value = nextAccount;
  });
  refreshAccountName();
  stopAuthListener = watchAuthUser((user) => {
    refreshAccountName(user);
  });
});

onUnmounted(() => {
  stopNotificationsListener?.();
  stopAccountListener?.();
  stopAuthListener?.();
});
</script>

<style scoped>
.app-shell {
  background: var(--agua-claro);
  color: var(--agua-texto);
  font-family: Poppins, sans-serif;
  min-height: 100%;
  padding-left: 248px;
}

.sidebar {
  background: linear-gradient(180deg, #08242c, #0a323b);
  color: var(--agua-branco);
  display: flex;
  flex-direction: column;
  bottom: 0;
  left: 0;
  min-height: 100vh;
  padding: 28px 18px;
  position: fixed;
  top: 0;
  width: 248px;
  z-index: 4;
}

.brand {
  align-items: center;
  color: #7de2d9;
  display: inline-flex;
  font-size: 23px;
  font-weight: 700;
  gap: 9px;
  text-decoration: none;
}

.brand span {
  background: rgba(255, 255, 255, 0.13);
  border-radius: 13px;
  color: #7de2d9;
  display: grid;
  height: 40px;
  place-items: center;
  width: 40px;
}

.brand b {
  color: #7de2d9;
}

.side-nav {
  display: grid;
  gap: 6px;
  margin-top: 42px;
}

.side-nav a,
.settings {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  display: flex;
  font: 600 13px Poppins, sans-serif;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  text-align: left;
  text-decoration: none;
}

.side-nav a.active,
.side-nav a:hover,
.settings.active,
.settings:hover {
  background: rgba(255, 255, 255, 0.14);
  color: var(--agua-branco);
}

.side-nav ion-icon,
.settings ion-icon {
  font-size: 19px;
}

.settings {
  margin-top: 6px;
}

.workspace {
  margin: 0 auto;
  max-width: 1180px;
  padding: 28px clamp(18px, 4vw, 44px) 34px;
  width: 100%;
}

.topbar {
  align-items: center;
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr auto auto;
  margin-bottom: 24px;
}

.topbar p {
  color: var(--agua-suave);
  font-size: 13px;
  margin: 0 0 2px;
}

.topbar h1 {
  color: var(--agua-petroleo);
  font-size: clamp(28px, 4vw, 38px);
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.1;
  margin: 0;
}

.icon-button,
.period {
  background: var(--agua-branco);
  border: 1px solid var(--agua-borda);
  border-radius: 14px;
  color: var(--agua-petroleo);
  cursor: pointer;
  min-height: 44px;
}

.icon-button {
  display: grid;
  font-size: 21px;
  place-items: center;
  position: relative;
  width: 44px;
}

.icon-button i {
  background: var(--agua-erro);
  border: 2px solid var(--agua-branco);
  border-radius: 50%;
  height: 9px;
  position: absolute;
  right: 10px;
  top: 10px;
  width: 9px;
}

.period {
  align-items: center;
  display: inline-flex;
  font: 600 13px Poppins, sans-serif;
  gap: 6px;
  padding: 0 14px;
}

.period-menu,
.notification-menu {
  position: relative;
}

.period-card,
.notification-card {
  background: var(--agua-branco);
  border: 1px solid var(--agua-borda);
  border-radius: 16px;
  box-shadow: var(--agua-shadow);
  display: grid;
  gap: 4px;
  min-width: 230px;
  padding: 8px;
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  z-index: 5;
}

.notification-card {
  gap: 8px;
  min-width: 310px;
}

.notification-head {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  padding: 6px 8px 2px;
}

.notification-head strong {
  color: var(--agua-petroleo);
  font-size: 13px;
}

.notification-head button {
  background: transparent;
  border: 0;
  color: var(--agua-agua);
  cursor: pointer;
  font: 700 11px Poppins, sans-serif;
  padding: 0;
}

.period-card a {
  border-radius: 12px;
  color: var(--agua-petroleo);
  display: grid;
  gap: 3px;
  padding: 11px 12px;
  text-decoration: none;
}

.period-card a:hover,
.period-card a.router-link-active {
  background: #f0fbfa;
}

.period-card span {
  font-size: 13px;
  font-weight: 700;
}

.period-card small {
  color: var(--agua-suave);
  font-size: 11px;
  line-height: 1.35;
}

.notification-item {
  align-items: start;
  background: transparent;
  border: 0;
  border-radius: 12px;
  color: var(--agua-texto);
  cursor: pointer;
  display: grid;
  gap: 10px;
  grid-template-columns: auto 1fr;
  padding: 11px 12px;
  text-align: left;
  width: 100%;
}

.notification-item:hover,
.notification-item.unread {
  background: #f0fbfa;
}

.notification-item > span {
  background: var(--agua-erro);
  border-radius: 999px;
  height: 10px;
  margin-top: 4px;
  width: 10px;
}

.notification-item.success > span {
  background: var(--agua-sucesso);
}

.notification-item:not(.unread) > span {
  opacity: 0.28;
}

.notification-item strong {
  color: var(--agua-petroleo);
  display: block;
  font-size: 12px;
  margin-bottom: 3px;
}

.notification-item small,
.empty-notifications {
  color: var(--agua-suave);
  font-size: 11px;
  line-height: 1.45;
}

.empty-notifications {
  margin: 0;
  padding: 10px 12px;
}

.mobile-only,
.bottom-nav {
  display: none;
}

@media (max-width: 980px) {
  .app-shell {
    display: block;
    padding-bottom: 18px;
    padding-left: 0;
  }

  .sidebar {
    display: none;
  }

  .workspace {
    padding: 22px 18px;
  }

  .topbar {
    align-items: start;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    position: relative;
    z-index: 7;
  }

  .mobile-only {
    display: grid;
    grid-column: 1;
    grid-row: 1;
    position: relative;
    z-index: 8;
  }

  .topbar > div:first-of-type {
    grid-column: 2;
    grid-row: 1;
    min-width: 0;
  }

  .period-menu {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-self: start;
  }

  .app-shell.mobile-nav-open .period-menu {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }

  .notification-menu {
    grid-column: 3;
    grid-row: 1;
    justify-self: end;
  }

  .bottom-nav {
    background: color-mix(in srgb, var(--agua-branco) 94%, var(--agua-agua));
    border-right: 1px solid var(--agua-borda);
    bottom: 0;
    box-shadow: 18px 0 42px rgba(13, 75, 94, 0.16);
    display: flex;
    flex-direction: column;
    gap: 8px;
    justify-content: flex-start;
    left: 0;
    padding: 88px 16px 22px;
    position: fixed;
    top: 0;
    transform: translateX(-104%);
    pointer-events: none;
    transition: transform 220ms ease, visibility 220ms ease;
    visibility: hidden;
    width: min(72vw, 252px);
    z-index: 6;
  }

  .bottom-nav.open {
    pointer-events: auto;
    transform: translateX(0);
    visibility: visible;
  }

  .bottom-nav a {
    align-items: center;
    border-radius: 12px;
    color: var(--agua-suave);
    display: flex;
    font: 600 13px Poppins, sans-serif;
    gap: 10px;
    min-height: 44px;
    padding: 0 12px;
    text-decoration: none;
  }

  .bottom-nav ion-icon {
    font-size: 19px;
  }

  .bottom-nav .active {
    background: color-mix(in srgb, var(--agua-agua) 14%, transparent);
    color: var(--agua-petroleo);
    font-weight: 700;
  }
}

@media (max-width: 560px) {
  .workspace {
    padding: 18px 14px;
  }

  .topbar {
    gap: 10px;
  }

  .period-card,
  .notification-card {
    left: 0;
    right: auto;
  }

  .notification-menu {
    grid-column: 3;
    grid-row: 1;
    justify-self: end;
  }

  .notification-card {
    left: auto;
    min-width: min(300px, calc(100vw - 28px));
    right: 0;
  }
}
</style>



