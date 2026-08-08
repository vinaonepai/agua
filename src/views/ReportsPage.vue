<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <AppShell title="Relatorios" :show-period="false">
        <section class="report-hero">
          <div>
            <span>Relatorio institucional</span>
            <h2>Resumo pronto para apresentar, baixar e compartilhar.</h2>
            <p>{{ reportSummary }}</p>
          </div>
          <button class="download-button" type="button" :disabled="isLoading" @click="downloadPdf">
            <ion-icon :icon="downloadOutline" />
            Baixar PDF
          </button>
        </section>

        <section class="kpi-grid">
          <article v-for="metric in reportMetrics" :key="metric.label" class="kpi-card">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <p>{{ metric.detail }}</p>
          </article>
        </section>

        <section class="report-grid">
          <article class="panel-card analysis-card">
            <div class="card-title">
              <div>
                <h2>Analise do periodo</h2>
                <p>Conclusao automatica com base nos dados atuais.</p>
              </div>
              <span>{{ simulationBadge }}</span>
            </div>
            <strong>{{ report?.insight || 'Carregando analise...' }}</strong>
            <div class="analysis-details">
              <div>
                <span>Status dos dispositivos</span>
                <p>{{ report?.deviceStatusSummary || 'Aguardando dispositivos' }}</p>
              </div>
              <div>
                <span>Ultima leitura</span>
                <p>{{ report?.lastReadingLabel || 'Sem leituras' }}</p>
              </div>
            </div>
          </article>

          <article class="panel-card">
            <div class="card-title">
              <div>
                <h2>Distribuicao semanal</h2>
                <p>Volume por dia no periodo do relatorio.</p>
              </div>
            </div>
            <div class="mini-chart" aria-label="Grafico de consumo usado no relatorio">
              <div v-for="bar in weeklyBars" :key="bar.day" class="mini-bar">
                <strong>{{ bar.liters }}</strong>
                <span :style="{ height: bar.value ? bar.value + '%' : '2%' }" />
                <small>{{ bar.day }}</small>
              </div>
            </div>
          </article>
        </section>

        <section class="report-grid bottom-grid">
          <article class="panel-card">
            <div class="card-title">
              <div>
                <h2>Dispositivos no relatorio</h2>
                <p>Equipamentos que alimentam os indicadores.</p>
              </div>
              <router-link to="/dispositivos">Gerenciar</router-link>
            </div>

            <div v-if="devices.length" class="device-list">
              <div v-for="device in visibleDevices" :key="device.id" class="device-row">
                <span><ion-icon :icon="hardwareChipOutline" /></span>
                <div>
                  <strong>{{ device.name || 'Dispositivo' }}</strong>
                  <small>{{ device.deviceCode || 'Sem codigo' }}</small>
                </div>
                <em :class="statusClass(device.status)">{{ device.status || 'Sem status' }}</em>
              </div>
            </div>

            <div v-else class="empty-state">
              <strong>Nenhum dispositivo cadastrado</strong>
              <p>Quando um ESP32 for vinculado, ele aparecera automaticamente nos relatorios.</p>
            </div>
          </article>

          <article class="panel-card">
            <div class="card-title">
              <div>
                <h2>Alertas do periodo</h2>
                <p>Ocorrencias tecnicas consideradas no PDF.</p>
              </div>
              <span>{{ alerts.length }}</span>
            </div>

            <div v-if="alerts.length" class="alert-list">
              <div v-for="alert in visibleAlerts" :key="alert.id" class="alert-row" :class="alert.severity">
                <ion-icon :icon="alert.severity === 'critical' ? warningOutline : alertCircleOutline" />
                <div>
                  <strong>{{ alert.title }}</strong>
                  <small>{{ alert.deviceCode || alert.deviceName }} - {{ alert.message }}</small>
                </div>
              </div>
            </div>

            <div v-else class="empty-state">
              <strong>Nenhum alerta ativo</strong>
              <p>O relatorio indicara anomalias assim que o app detectar risco operacional.</p>
            </div>
          </article>
        </section>
      </AppShell>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { IonContent, IonIcon, IonPage, onIonViewWillEnter } from '@ionic/vue';
import { alertCircleOutline, downloadOutline, hardwareChipOutline, warningOutline } from 'ionicons/icons';
import AppShell from '../components/AppShell.vue';
import { onSettingsChange } from '../data/settings-store.js';
import { buildOperationalReport, downloadReportPdf } from '../services/report-service.js';

const report = ref(null);
const isLoading = ref(false);
let stopSettingsListener = null;

const loadReport = async () => {
  isLoading.value = true;

  try {
    report.value = await buildOperationalReport();
  } finally {
    isLoading.value = false;
  }
};

const downloadPdf = async () => {
  const currentReport = report.value || await buildOperationalReport();
  downloadReportPdf(currentReport);
};

const reportSummary = computed(() => {
  if (!report.value) {
    return 'Preparando dados de consumo, dispositivos e alertas.';
  }

  return `${report.value.totalLabel} registrados na semana, ${report.value.devices.length} dispositivo(s) e ${report.value.alerts.length} alerta(s) tecnico(s).`;
});

const reportMetrics = computed(() => [
  { label: 'Consumo total', value: report.value?.totalLabel || '0 L', detail: 'Periodo semanal' },
  { label: 'Media diaria', value: report.value?.averageLabel || '0 L', detail: 'Calculada por dia' },
  { label: 'Pico registrado', value: report.value?.peakLabel || '0 L', detail: 'Maior leitura' },
  { label: 'Alertas', value: String(report.value?.alerts.length || 0), detail: 'Ocorrencias tecnicas' },
]);

const weeklyBars = computed(() => report.value?.consumption.weeklyBars || []);
const devices = computed(() => report.value?.devices || []);
const alerts = computed(() => report.value?.alerts || []);
const visibleDevices = computed(() => devices.value.slice(0, 4));
const visibleAlerts = computed(() => alerts.value.slice(0, 4));
const simulationBadge = computed(() => (report.value?.settings.simulationMode ? 'Dados simulados' : 'Dados reais'));

const statusClass = (status) => ({
  Ativo: 'active',
  Offline: 'offline',
  Manutencao: 'maintenance',
}[status] || 'waiting');

onIonViewWillEnter(loadReport);

onMounted(() => {
  loadReport();
  stopSettingsListener = onSettingsChange(loadReport);
});

onUnmounted(() => {
  stopSettingsListener?.();
});
</script>

<style scoped>
.report-hero {
  align-items: center;
  background: linear-gradient(135deg, #37c9c3, #0d6d80);
  border-radius: 20px;
  color: #ffffff;
  display: flex;
  gap: 24px;
  justify-content: space-between;
  margin-bottom: 20px;
  overflow: hidden;
  padding: 28px;
  position: relative;
}

.report-hero::after {
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 50%;
  content: '';
  height: 180px;
  position: absolute;
  right: -58px;
  top: -62px;
  width: 180px;
}

.report-hero span,
.report-hero p {
  color: rgba(255, 255, 255, 0.84);
  font-size: 12px;
  margin: 0;
}

.report-hero h2 {
  color: #ffffff;
  font-size: clamp(26px, 4vw, 40px);
  line-height: 1.05;
  margin: 8px 0 12px;
  max-width: 660px;
}

.download-button {
  align-items: center;
  background: rgba(255, 255, 255, 0.92);
  border: 0;
  border-radius: 14px;
  color: #0d4b5e;
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font: 800 13px Poppins, sans-serif;
  gap: 8px;
  min-height: 48px;
  padding: 0 18px;
  position: relative;
  z-index: 1;
}

.download-button:disabled {
  cursor: wait;
  opacity: 0.75;
}

.kpi-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 20px;
}

.kpi-card,
.panel-card {
  background: var(--agua-branco);
  border: 1px solid var(--agua-borda);
  border-radius: 18px;
  box-shadow: var(--agua-shadow);
}

.kpi-card {
  display: grid;
  gap: 7px;
  padding: 18px;
}

.kpi-card span,
.kpi-card p {
  color: var(--agua-suave);
  font-size: 12px;
  margin: 0;
}

.kpi-card strong {
  color: var(--agua-petroleo);
  font-size: clamp(22px, 3vw, 30px);
  line-height: 1;
}

.report-grid {
  align-items: stretch;
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.75fr);
}

.bottom-grid {
  margin-top: 20px;
}

.panel-card {
  padding: 20px;
}

.card-title {
  align-items: flex-start;
  display: flex;
  gap: 14px;
  justify-content: space-between;
  margin-bottom: 18px;
}

.card-title h2 {
  color: var(--agua-petroleo);
  font-size: 17px;
  margin: 0 0 4px;
}

.card-title p {
  color: var(--agua-suave);
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}

.card-title span,
.card-title a {
  color: #188b84;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
}

.analysis-card > strong {
  color: var(--agua-petroleo);
  display: block;
  font-size: clamp(20px, 3vw, 30px);
  line-height: 1.15;
  margin-bottom: 22px;
  max-width: 760px;
}

.analysis-details {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.analysis-details div,
.device-row,
.alert-row,
.empty-state {
  background: color-mix(in srgb, var(--agua-branco) 92%, var(--agua-agua));
  border: 1px solid var(--agua-borda);
  border-radius: 14px;
}

.analysis-details div {
  padding: 14px;
}

.analysis-details span {
  color: var(--agua-suave);
  display: block;
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 5px;
}

.analysis-details p {
  color: var(--agua-petroleo);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.35;
  margin: 0;
}

.mini-chart {
  align-items: end;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(7, 1fr);
  height: 240px;
  padding-top: 18px;
}

.mini-bar {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-rows: auto 1fr auto;
  height: 100%;
  justify-items: center;
  min-width: 0;
}

.mini-bar strong {
  color: var(--agua-suave);
  font-size: 10px;
  opacity: 0.85;
}

.mini-bar span {
  align-self: end;
  background: linear-gradient(180deg, #37c9c3, #1b8795);
  border-radius: 999px 999px 4px 4px;
  min-height: 3px;
  width: min(30px, 80%);
}

.mini-bar small {
  color: var(--agua-petroleo);
  font-size: 11px;
  font-weight: 800;
}

.device-list,
.alert-list {
  display: grid;
  gap: 10px;
}

.device-row,
.alert-row {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 12px;
}

.device-row > span {
  background: rgba(28, 167, 160, 0.12);
  border-radius: 12px;
  color: var(--agua-agua);
  display: grid;
  height: 38px;
  place-items: center;
  width: 38px;
}

.device-row strong,
.alert-row strong,
.empty-state strong {
  color: var(--agua-petroleo);
  display: block;
  font-size: 13px;
}

.device-row small,
.alert-row small,
.empty-state p {
  color: var(--agua-suave);
  font-size: 11px;
  line-height: 1.45;
}

.device-row em {
  border-radius: 999px;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
  padding: 7px 9px;
  white-space: nowrap;
}

.device-row em.active {
  background: #e8fff1;
  color: #148c4f;
}

.device-row em.offline,
.alert-row.critical ion-icon {
  color: var(--agua-erro);
}

.device-row em.maintenance,
.device-row em.waiting {
  background: #effafa;
  color: #188b84;
}

.alert-row {
  grid-template-columns: auto minmax(0, 1fr);
}

.alert-row ion-icon {
  color: #188b84;
  font-size: 22px;
}

.empty-state {
  padding: 18px;
}

.empty-state p {
  margin: 6px 0 0;
}

@media (max-width: 980px) {
  .report-hero,
  .card-title {
    align-items: stretch;
    flex-direction: column;
  }

  .download-button {
    justify-content: center;
    width: 100%;
  }

  .kpi-grid,
  .report-grid,
  .analysis-details {
    grid-template-columns: 1fr;
  }

  .device-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .device-row em {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
