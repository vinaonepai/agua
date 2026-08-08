import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index';

import { IonicVue } from '@ionic/vue';

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

/* Theme variables */
import './theme/variables.css';
import { checkForAppUpdate, startAppVersionMonitor } from './data/app-version.js';
import { clearStaleLocalCache } from './data/cache-store.js';
import { applySavedTheme } from './data/theme-store.js';
import { getSettings } from './data/settings-store.js';

const startApp = async () => {
  const updateFound = await checkForAppUpdate();

  if (updateFound) {
    return;
  }

  clearStaleLocalCache();
  applySavedTheme();
  getSettings();

  const app = createApp(App)
    .use(IonicVue)
    .use(router);

  await router.isReady();
  app.mount('#app');
  startAppVersionMonitor();
};

startApp();

