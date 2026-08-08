import { createRouter, createWebHashHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import LoginPage from '../views/LoginPage.vue';
import DashboardPage from '../views/DashboardPage.vue';
import CadastroPage from '../views/CadastroPage.vue';
import ForgotPasswordPage from '../views/ForgotPasswordPage.vue';
import ConsumptionPage from '../views/ConsumptionPage.vue';
import ConsumptionPeriodPage from '../views/ConsumptionPeriodPage.vue';
import GoalsPage from '../views/GoalsPage.vue';
import DevicesPage from '../views/DevicesPage.vue';
import DeviceDetailPage from '../views/DeviceDetailPage.vue';
import ReportsPage from '../views/ReportsPage.vue';
import ProfilePage from '../views/ProfilePage.vue';
import SettingsPage from '../views/SettingsPage.vue';
import TermsPage from '../views/TermsPage.vue';

const routes: Array<RouteRecordRaw> = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'Login', component: LoginPage },
  { path: '/cadastro', name: 'Cadastro', component: CadastroPage },
  { path: '/termos', name: 'Termos', component: TermsPage },
  { path: '/esqueci-senha', name: 'EsqueciSenha', component: ForgotPasswordPage },
  { path: '/dashboard', name: 'Dashboard', component: DashboardPage },
  { path: '/consumo', name: 'Consumo', component: ConsumptionPage },
  {
    path: '/consumo/semana-passada',
    name: 'ConsumoSemanaPassada',
    component: ConsumptionPeriodPage,
    props: {
      periodLabel: 'Semana passada',
      chartTitle: 'Historico da semana passada',
      chartBadge: 'Semana passada',
      days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'],
    },
  },
  {
    path: '/consumo/mes-passado',
    name: 'ConsumoMesPassado',
    component: ConsumptionPeriodPage,
    props: {
      periodLabel: 'Mes passado',
      chartTitle: 'Historico do mes passado',
      chartBadge: 'Mes passado',
      days: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Sem 6', 'Sem 7'],
    },
  },
  { path: '/metas', name: 'Metas', component: GoalsPage },
  { path: '/dispositivos', name: 'Dispositivos', component: DevicesPage },
  { path: '/dispositivos/:id', name: 'DetalheDispositivo', component: DeviceDetailPage },
  { path: '/relatorios', name: 'Relatorios', component: ReportsPage },
  { path: '/perfil', name: 'Perfil', component: ProfilePage },
  { path: '/configuracoes', name: 'Configuracoes', component: SettingsPage },
];

export default createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});
