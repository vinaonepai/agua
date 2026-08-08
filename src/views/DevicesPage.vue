<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <AppShell title="Dispositivos" :show-period="false">
        <section class="devices-toolbar">
          <div>
            <span>Arquitetura preparada</span>
            <h2>ESP32 e sensor de vazao prontos para integracao futura.</h2>
            <p>Os dados abaixo continuam simulados, mas seguem o formato esperado para o hardware real.</p>
          </div>
          <div class="toolbar-actions">
            <button class="link-device-button" type="button" @click="openLinkModal">
              <ion-icon :icon="linkOutline" />
              Vincular por codigo
            </button>
            <button type="button" @click="addSimulatedDevice">
              <ion-icon :icon="addOutline" />
              Adicionar simulado
            </button>
          </div>
        </section>

        <section class="architecture-grid">
          <article v-for="item in architectureItems" :key="item.label">
            <ion-icon :icon="item.icon" />
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </section>

        <section v-if="technicalAlerts.length" class="technical-alerts-panel">
          <div class="panel-title">
            <div>
              <h2>Alertas tecnicos</h2>
              <p>Eventos simulados que o app ja esta preparado para tratar.</p>
            </div>
            <strong>{{ technicalAlerts.length }} ativo{{ technicalAlerts.length > 1 ? 's' : '' }}</strong>
          </div>

          <div class="technical-alerts-grid">
            <article v-for="alert in technicalAlerts" :key="alert.id" :class="['technical-alert-card', alert.severity]">
              <ion-icon :icon="alert.severity === 'critical' ? warningOutline : alertCircleOutline" />
              <div>
                <h3>{{ alert.title }}</h3>
                <p>{{ alert.deviceCode ? alert.deviceCode + ' - ' : '' }}{{ alert.message }}</p>
              </div>
            </article>
          </div>
        </section>

        <section v-if="devices.length" class="device-grid">
          <article v-for="device in displayedDevices" :key="device.id" class="device-card">
            <div class="device-head">
              <span class="device-icon"><ion-icon :icon="hardwareChipOutline" /></span>
              <div>
                <h2>{{ device.name }}</h2>
                <p>{{ device.location || 'Local nao informado' }}</p>
              </div>
              <strong :class="statusClass(device.status)">{{ device.status }}</strong>
            </div>

            <div class="device-meta">
              <div>
                <span>ID do dispositivo</span>
                <strong>{{ device.deviceCode }}</strong>
              </div>
              <div>
                <span>Unidade</span>
                <strong>{{ device.unit || 'Nao vinculada' }}</strong>
              </div>
              <div>
                <span>Modelo do sensor</span>
                <strong>{{ device.sensor.name }}</strong>
              </div>
              <div>
                <span>Calibracao</span>
                <strong>{{ device.sensor.calibrationFactor }} pulsos/s = 1 L/min</strong>
              </div>
              <div>
                <span>Intervalo de envio</span>
                <strong>{{ device.readingInterval }}s</strong>
              </div>
            </div>

            <div class="reading-row">
              <div>
                <span>Consumo acumulado</span>
                <strong>{{ device.totalConsumption }} L</strong>
              </div>
              <div>
                <span>Ultima vazao</span>
                <strong>{{ device.lastFlowRate }} L/min</strong>
              </div>
              <div>
                <span>Pulsos da ultima leitura</span>
                <strong>{{ device.lastPulseCount }} pulsos = {{ device.lastReadingLiters }} L</strong>
              </div>
            </div>

            <div class="device-actions">
              <router-link class="view-device" :to="`/dispositivos/${device.id}`">
                <ion-icon :icon="eyeOutline" />
                Visualizar
              </router-link>
              <select :value="device.status" @change="changeStatus(device.id, $event.target.value)">
                <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
              </select>
              <button class="edit-device" type="button" @click="openEditDevice(device)">
                <ion-icon :icon="createOutline" />
                Editar
              </button>
              <button type="button" @click="askDeleteDevice(device)">
                <ion-icon :icon="trashOutline" />
                Remover
              </button>
            </div>
          </article>
        </section>

        <p v-if="errorMessage" class="device-error">{{ errorMessage }}</p>

        <article v-if="!devices.length && !errorMessage" class="empty-devices">
          <span><ion-icon :icon="hardwareChipOutline" /></span>
          <h2>Nenhum dispositivo preparado ainda.</h2>
          <p>Vincule um codigo de dispositivo ou crie um simulado para preparar o Firestore para o ESP32 no futuro.</p>
        </article>

        <div v-if="isLinkModalOpen" class="modal-backdrop" role="presentation" @click.self="closeLinkModal">
          <section class="edit-modal" role="dialog" aria-modal="true" aria-labelledby="device-link-title">
            <div class="modal-title">
              <span class="modal-icon edit-icon"><ion-icon :icon="linkOutline" /></span>
              <div>
                <h2 id="device-link-title">Vincular dispositivo</h2>
                <p>Use o codigo que sera gravado no ESP32 para conectar este monitor a sua conta.</p>
              </div>
            </div>

            <form class="edit-form" @submit.prevent="saveLinkedDevice">
              <label>
                Codigo do dispositivo
                <input v-model="linkForm.deviceCode" type="text" placeholder="Ex: ESP32-FLOW-001" required @input="formatDeviceCode" />
              </label>
              <label>
                Nome do dispositivo
                <input v-model="linkForm.name" type="text" placeholder="Ex: Caixa d'agua principal" required />
              </label>
              <label>
                Local de instalacao
                <input v-model="linkForm.location" type="text" placeholder="Ex: Laboratorio 2" required />
              </label>
              <label>
                Unidade vinculada
                <input v-model="linkForm.unit" type="text" placeholder="Ex: Senac SC" />
              </label>
              <label>
                Modelo do sensor
                <select v-model="linkForm.sensorModel">
                  <option v-for="model in sensorModels" :key="model" :value="model">{{ model }}</option>
                </select>
              </label>
              <label>
                Codigo do sensor
                <input v-model="linkForm.sensorCode" type="text" placeholder="Ex: FLOW-YF-S201-001" @input="formatSensorCode" />
              </label>
              <label>
                Fator de calibracao
                <input v-model.number="linkForm.calibrationFactor" type="number" min="0.1" step="0.1" required />
              </label>
              <label>
                Intervalo de envio
                <select v-model.number="linkForm.readingInterval">
                  <option :value="5">5 segundos</option>
                  <option :value="10">10 segundos</option>
                  <option :value="30">30 segundos</option>
                  <option :value="60">60 segundos</option>
                </select>
              </label>

              <p v-if="linkError" class="modal-error">{{ linkError }}</p>

              <div class="modal-actions">
                <button class="cancel-delete" type="button" @click="closeLinkModal">Cancelar</button>
                <button class="save-edit" type="submit" :disabled="loading">
                  <ion-icon :icon="linkOutline" />
                  Vincular
                </button>
              </div>
            </form>
          </section>
        </div>

        <div v-if="deviceToDelete" class="modal-backdrop" role="presentation" @click.self="closeDeleteModal">
          <section class="delete-modal" role="dialog" aria-modal="true" aria-labelledby="device-delete-title">
            <span class="modal-icon"><ion-icon :icon="trashOutline" /></span>
            <h2 id="device-delete-title">Remover dispositivo?</h2>
            <p>
              O dispositivo {{ deviceToDelete.name }} e os dados simulados vinculados a ele serao removidos da sua conta.
            </p>
            <div class="modal-actions">
              <button class="cancel-delete" type="button" @click="closeDeleteModal">Cancelar</button>
              <button class="confirm-delete" type="button" @click="confirmDeleteDevice">
                <ion-icon :icon="trashOutline" />
                Remover
              </button>
            </div>
          </section>
        </div>

        <div v-if="deviceToEdit" class="modal-backdrop" role="presentation" @click.self="closeEditModal">
          <section class="edit-modal" role="dialog" aria-modal="true" aria-labelledby="device-edit-title">
            <div class="modal-title">
              <span class="modal-icon edit-icon"><ion-icon :icon="createOutline" /></span>
              <div>
                <h2 id="device-edit-title">Editar dispositivo</h2>
                <p>Ajustes que serao usados quando o ESP32 e o sensor forem conectados.</p>
              </div>
            </div>

            <form class="edit-form" @submit.prevent="saveDeviceEdition">
              <label>
                Nome do dispositivo
                <input v-model="editForm.name" type="text" required />
              </label>
              <label>
                Local de instalacao
                <input v-model="editForm.location" type="text" required />
              </label>
              <label>
                ID do dispositivo
                <input v-model="editForm.deviceCode" type="text" required />
              </label>
              <label>
                Unidade vinculada
                <input v-model="editForm.unit" type="text" placeholder="Ex: Senac SC" />
              </label>
              <label>
                Modelo do sensor
                <select v-model="editForm.sensor.name">
                  <option v-for="model in sensorModels" :key="model" :value="model">{{ model }}</option>
                </select>
              </label>
              <label>
                Codigo do sensor
                <input v-model="editForm.sensor.sensorCode" type="text" required />
              </label>
              <label>
                Fator de calibracao
                <input v-model.number="editForm.sensor.calibrationFactor" type="number" min="0.1" step="0.1" required />
              </label>
              <label>
                Intervalo de envio
                <select v-model.number="editForm.readingInterval">
                  <option :value="5">5 segundos</option>
                  <option :value="10">10 segundos</option>
                  <option :value="30">30 segundos</option>
                  <option :value="60">60 segundos</option>
                </select>
              </label>
              <label>
                Status
                <select v-model="editForm.status">
                  <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
                </select>
              </label>

              <div class="modal-actions">
                <button class="cancel-delete" type="button" @click="closeEditModal">Cancelar</button>
                <button class="save-edit" type="submit">
                  <ion-icon :icon="saveOutline" />
                  Salvar
                </button>
              </div>
            </form>
          </section>
        </div>
      </AppShell>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { IonContent, IonIcon, IonPage } from '@ionic/vue';
import {
  addOutline,
  alertCircleOutline,
  analyticsOutline,
  createOutline,
  eyeOutline,
  hardwareChipOutline,
  linkOutline,
  pulseOutline,
  radioOutline,
  saveOutline,
  trashOutline,
  warningOutline,
} from 'ionicons/icons';
import AppShell from '../components/AppShell.vue';
import { getAccount } from '../data/account-store.js';
import { getSettings } from '../data/settings-store.js';
import {
  createSimulatedDevice,
  DEVICE_STATUSES,
  SENSOR_MODELS,
  linkDeviceByCode,
  listDevices,
  removeDevice,
  updateDevice,
  updateDeviceStatus,
} from '../services/device-service.js';
import { getConsumptionReadings } from '../services/reading-service.js';
import { generateTechnicalAlerts, syncTechnicalAlertNotifications } from '../services/technical-alert-service.js';

const devices = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const linkError = ref('');
const deviceToDelete = ref(null);
const deviceToEdit = ref(null);
const isLinkModalOpen = ref(false);
const editForm = ref(null);
const account = getAccount();
const linkForm = ref({
  deviceCode: '',
  name: '',
  location: '',
  unit: account.unit || '',
  sensorModel: 'YF-S201',
  sensorCode: '',
  calibrationFactor: 7.5,
  readingInterval: 10,
});
const statuses = DEVICE_STATUSES;
const sensorModels = SENSOR_MODELS;
const settings = getSettings();
const consumptionData = computed(() => getConsumptionReadings(settings, devices.value));
const technicalAlerts = computed(() =>
  generateTechnicalAlerts({
    devices: devices.value,
    readings: consumptionData.value.rawReadings,
    settings,
  }),
);
const displayedDevices = computed(() =>
  devices.value.map((device) => {
    const deviceReadings = consumptionData.value.rawReadings.filter((reading) => reading.deviceId === device.id);
    const latestReading = deviceReadings
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    const totalConsumption = deviceReadings.reduce((sum, reading) => sum + Number(reading.liters || 0), 0);

    return {
      ...device,
      totalConsumption: totalConsumption || device.totalConsumption,
      lastReadingLiters: latestReading?.liters ?? device.lastReadingLiters,
      lastFlowRate: latestReading?.flowRate ?? device.lastFlowRate,
      lastPulseCount: latestReading?.pulseCount ?? device.lastPulseCount,
      lastReadingAt: latestReading?.timestamp ?? device.lastReadingAt,
    };
  }),
);

const architectureItems = computed(() => [
  { label: 'Dispositivos', value: `${devices.value.length} cadastrados`, icon: hardwareChipOutline },
  { label: 'Sensores', value: 'Modelos configuraveis', icon: pulseOutline },
  { label: 'Leituras', value: 'Simuladas', icon: analyticsOutline },
  { label: 'Status', value: 'Online/offline', icon: radioOutline },
  { label: 'Alertas', value: technicalAlerts.value.length ? `${technicalAlerts.value.length} ativos` : 'Preparados', icon: alertCircleOutline },
]);

const loadDevices = async () => {
  try {
    errorMessage.value = '';
    devices.value = await listDevices();
    syncTechnicalAlertNotifications(technicalAlerts.value);
  } catch (error) {
    errorMessage.value = 'Nao foi possivel carregar os dispositivos. Confira as permissoes do Firestore.';
    devices.value = [];
  }
};

const addSimulatedDevice = async () => {
  if (loading.value) {
    return;
  }

  loading.value = true;
  try {
    errorMessage.value = '';
    await createSimulatedDevice(account.unit);
    await loadDevices();
  } catch (error) {
    errorMessage.value = 'Nao foi possivel criar o dispositivo simulado agora.';
  }
  loading.value = false;
};

const resetLinkForm = () => {
  linkForm.value = {
    deviceCode: '',
    name: '',
    location: '',
    unit: account.unit || '',
    sensorModel: 'YF-S201',
    sensorCode: '',
    calibrationFactor: 7.5,
    readingInterval: 10,
  };
  linkError.value = '';
};

const openLinkModal = () => {
  resetLinkForm();
  isLinkModalOpen.value = true;
};

const closeLinkModal = () => {
  isLinkModalOpen.value = false;
  linkError.value = '';
};

const normalizeCodeInput = (value) => {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
};

const formatDeviceCode = () => {
  linkForm.value.deviceCode = normalizeCodeInput(linkForm.value.deviceCode);
};

const formatSensorCode = () => {
  linkForm.value.sensorCode = normalizeCodeInput(linkForm.value.sensorCode);
};

const saveLinkedDevice = async () => {
  if (loading.value) {
    return;
  }

  loading.value = true;
  try {
    errorMessage.value = '';
    linkError.value = '';
    await linkDeviceByCode(linkForm.value);
    closeLinkModal();
    await loadDevices();
  } catch (error) {
    linkError.value = error.message || 'Nao foi possivel vincular este dispositivo.';
  }
  loading.value = false;
};

const changeStatus = async (deviceId, status) => {
  try {
    errorMessage.value = '';
    await updateDeviceStatus(deviceId, status);
    await loadDevices();
  } catch (error) {
    errorMessage.value = 'Nao foi possivel atualizar o status.';
  }
};

const askDeleteDevice = (device) => {
  deviceToDelete.value = device;
};

const closeDeleteModal = () => {
  deviceToDelete.value = null;
};

const openEditDevice = (device) => {
  deviceToEdit.value = device;
  editForm.value = {
    name: device.name,
    deviceCode: device.deviceCode,
    location: device.location,
    unit: device.unit,
    status: device.status,
    readingInterval: device.readingInterval,
    sensor: {
      name: device.sensor.name,
      sensorCode: device.sensor.sensorCode,
      type: device.sensor.type,
      calibrationFactor: device.sensor.calibrationFactor,
    },
  };
};

const closeEditModal = () => {
  deviceToEdit.value = null;
  editForm.value = null;
};

const saveDeviceEdition = async () => {
  const deviceId = deviceToEdit.value?.id;

  if (!deviceId || !editForm.value) {
    return;
  }

  try {
    errorMessage.value = '';
    await updateDevice(deviceId, editForm.value);
    closeEditModal();
    await loadDevices();
  } catch (error) {
    errorMessage.value = 'Nao foi possivel salvar as alteracoes do dispositivo.';
  }
};

const confirmDeleteDevice = async () => {
  const deviceId = deviceToDelete.value?.id;

  if (!deviceId) {
    return;
  }

  try {
    errorMessage.value = '';
    devices.value = devices.value.filter((device) => device.id !== deviceId);
    await removeDevice(deviceId);
    deviceToDelete.value = null;
    await loadDevices();
  } catch (error) {
    errorMessage.value = 'Nao foi possivel remover o dispositivo.';
    await loadDevices();
  }
};

const statusClass = (status) => ({
  active: status === 'Ativo',
  offline: status === 'Offline',
  waiting: status === 'Aguardando conexao',
  maintenance: status === 'Manutencao',
});

onMounted(loadDevices);
</script>

<style scoped>
.devices-toolbar {
  align-items: center;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent 34%),
    var(--agua-feature-bg);
  border-radius: 22px;
  color: var(--agua-feature-text);
  display: grid;
  gap: 18px;
  grid-template-columns: 1fr auto;
  margin-bottom: 20px;
  padding: 26px;
}

.devices-toolbar > div {
  position: relative;
  z-index: 1;
}

.devices-toolbar span {
  color: #c9edf1 !important;
  display: block;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
}

.devices-toolbar h2 {
  color: var(--agua-feature-text) !important;
  font-size: clamp(22px, 4vw, 34px);
  line-height: 1.14;
  margin: 0;
  max-width: 720px;
}

.devices-toolbar p {
  color: #c9edf1 !important;
  font-size: 13px;
  line-height: 1.7;
  margin: 12px 0 0;
}

.devices-toolbar button,
.device-actions button,
.device-actions a {
  align-items: center;
  border-radius: 14px;
  cursor: pointer;
  display: inline-flex;
  font: 700 13px Poppins, sans-serif;
  gap: 8px;
  min-height: 46px;
  padding: 0 15px;
}

.devices-toolbar button {
  background: #7de2d9;
  border: 1px solid #7de2d9;
  color: #073039;
}

.toolbar-actions {
  align-items: end;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: end;
}

.devices-toolbar .link-device-button {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.26);
  color: #ffffff;
}

.architecture-grid,
.device-grid {
  display: grid;
  gap: 16px;
}

.technical-alerts-panel {
  background: var(--agua-branco);
  border: 1px solid var(--agua-borda);
  border-radius: 18px;
  box-shadow: var(--agua-shadow);
  display: grid;
  gap: 14px;
  margin-bottom: 20px;
  padding: 18px;
}

.panel-title {
  align-items: start;
  display: flex;
  gap: 14px;
  justify-content: space-between;
}

.panel-title h2 {
  color: var(--agua-petroleo);
  font-size: 17px;
  margin: 0 0 4px;
}

.panel-title p {
  color: var(--agua-suave);
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
}

.panel-title strong {
  background: var(--agua-danger-bg);
  border-radius: 999px;
  color: var(--agua-erro);
  font-size: 11px;
  padding: 7px 10px;
  white-space: nowrap;
}

.technical-alerts-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.technical-alert-card {
  align-items: start;
  border-radius: 14px;
  display: grid;
  gap: 10px;
  grid-template-columns: auto 1fr;
  padding: 13px;
}

.technical-alert-card.critical {
  background: var(--agua-danger-bg);
  border: 1px solid var(--agua-danger-border);
}

.technical-alert-card.warning {
  background: #fff7ed;
  border: 1px solid #fed7aa;
}

.technical-alert-card ion-icon {
  border-radius: 12px;
  font-size: 21px;
  padding: 8px;
}

.technical-alert-card.critical ion-icon {
  background: rgba(230, 57, 70, 0.12);
  color: var(--agua-erro);
}

.technical-alert-card.warning ion-icon {
  background: rgba(245, 158, 11, 0.14);
  color: var(--agua-alerta);
}

.technical-alert-card h3 {
  color: var(--agua-petroleo);
  font-size: 13px;
  margin: 0 0 4px;
}

.technical-alert-card p {
  color: var(--agua-suave);
  font-size: 11px;
  line-height: 1.55;
  margin: 0;
}

.architecture-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-bottom: 20px;
}

.architecture-grid article,
.device-card,
.empty-devices {
  background: var(--agua-branco);
  border: 1px solid var(--agua-borda);
  border-radius: 18px;
  box-shadow: var(--agua-shadow);
  padding: 18px;
}

.architecture-grid article {
  display: grid;
  gap: 7px;
}

.architecture-grid ion-icon {
  background: var(--agua-muted);
  border-radius: 12px;
  color: var(--agua-petroleo);
  font-size: 21px;
  padding: 9px;
}

.architecture-grid span,
.device-meta span,
.reading-row span {
  color: var(--agua-suave);
  font-size: 11px;
  font-weight: 700;
}

.architecture-grid strong,
.device-meta strong,
.reading-row strong {
  color: var(--agua-petroleo);
  font-size: 13px;
  line-height: 1.45;
}

.device-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.device-card {
  display: grid;
  gap: 16px;
}

.device-head {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: auto 1fr auto;
}

.device-icon,
.empty-devices span {
  background: rgba(28, 167, 160, 0.14);
  border-radius: 16px;
  color: var(--agua-petroleo);
  display: grid;
  font-size: 26px;
  height: 54px;
  place-items: center;
  width: 54px;
}

.device-head h2,
.empty-devices h2 {
  color: var(--agua-petroleo);
  font-size: 18px;
  margin: 0 0 5px;
}

.device-head p,
.empty-devices p {
  color: var(--agua-suave);
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
}

.device-head > strong {
  border-radius: 999px;
  font-size: 11px;
  padding: 7px 10px;
}

.device-head > strong.active {
  background: #eaf9ef;
  color: var(--agua-sucesso);
}

.device-head > strong.offline {
  background: var(--agua-danger-bg);
  color: var(--agua-erro);
}

.device-head > strong.waiting {
  background: #fff7ed;
  color: var(--agua-alerta);
}

.device-head > strong.maintenance {
  background: var(--agua-muted);
  color: var(--agua-petroleo);
}

.device-meta,
.reading-row {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.device-meta div,
.reading-row div {
  background: var(--agua-muted);
  border: 1px solid var(--agua-borda);
  border-radius: 14px;
  display: grid;
  gap: 4px;
  padding: 12px;
}

.reading-row {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.device-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.device-actions select {
  background: var(--agua-branco);
  border: 1px solid var(--agua-input-border);
  border-radius: 14px;
  color: var(--agua-texto);
  font: 600 13px Poppins, sans-serif;
  min-height: 46px;
  padding: 0 12px;
}

.device-actions button {
  background: var(--agua-danger-bg);
  border: 1px solid var(--agua-danger-border);
  color: var(--agua-erro);
}

.device-actions .view-device {
  background: var(--agua-petroleo);
  border: 1px solid var(--agua-petroleo);
  color: #ffffff;
  text-decoration: none;
}

.device-actions .edit-device {
  background: var(--agua-muted);
  border-color: var(--agua-borda);
  color: var(--agua-petroleo);
}

.empty-devices {
  display: grid;
  gap: 10px;
  max-width: 640px;
}

.device-error {
  background: var(--agua-danger-bg);
  border: 1px solid var(--agua-danger-border);
  border-radius: 14px;
  color: var(--agua-erro);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
  margin: 0 0 16px;
  padding: 12px 14px;
}

.modal-backdrop {
  align-items: center;
  background: rgba(3, 16, 20, 0.64);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 20;
}

.delete-modal,
.edit-modal {
  background: var(--agua-branco);
  border: 1px solid var(--agua-borda);
  border-radius: 22px;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
  color: var(--agua-texto);
  display: grid;
  gap: 14px;
  max-width: 430px;
  padding: 24px;
  width: min(100%, 430px);
}

.edit-modal {
  max-width: 720px;
  width: min(100%, 720px);
}

.modal-title {
  align-items: center;
  display: flex;
  gap: 14px;
}

.modal-icon {
  background: var(--agua-danger-bg);
  border: 1px solid var(--agua-danger-border);
  border-radius: 18px;
  color: var(--agua-erro);
  display: grid;
  font-size: 28px;
  height: 58px;
  place-items: center;
  width: 58px;
}

.edit-icon {
  background: rgba(28, 167, 160, 0.14);
  border-color: rgba(28, 167, 160, 0.24);
  color: var(--agua-petroleo);
}

.delete-modal h2,
.edit-modal h2 {
  color: var(--agua-petroleo);
  font-size: 22px;
  margin: 0;
}

.delete-modal p,
.edit-modal p {
  color: var(--agua-suave);
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
}

.edit-form {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.edit-form label {
  color: var(--agua-texto);
  display: grid;
  font-size: 12px;
  font-weight: 700;
  gap: 8px;
}

.edit-form input,
.edit-form select {
  background: var(--agua-branco);
  border: 1px solid var(--agua-input-border);
  border-radius: 14px;
  color: var(--agua-texto);
  font: 600 13px Poppins, sans-serif;
  min-height: 48px;
  outline: none;
  padding: 0 13px;
}

.edit-form .modal-actions {
  grid-column: 1 / -1;
}

.modal-error {
  background: var(--agua-danger-bg);
  border: 1px solid var(--agua-danger-border);
  border-radius: 14px;
  color: var(--agua-erro);
  font-size: 12px;
  font-weight: 700;
  grid-column: 1 / -1;
  line-height: 1.5;
  margin: 0;
  padding: 12px 14px;
}

.modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.cancel-delete,
.confirm-delete {
  align-items: center;
  border-radius: 14px;
  cursor: pointer;
  display: inline-flex;
  font: 700 13px Poppins, sans-serif;
  gap: 8px;
  min-height: 46px;
  padding: 0 16px;
}

.cancel-delete {
  background: var(--agua-muted);
  border: 1px solid var(--agua-borda);
  color: var(--agua-texto);
}

.confirm-delete {
  background: var(--agua-erro);
  border: 1px solid var(--agua-erro);
  color: #ffffff;
}

.save-edit {
  align-items: center;
  background: var(--agua-petroleo);
  border: 1px solid var(--agua-petroleo);
  border-radius: 14px;
  color: #ffffff;
  cursor: pointer;
  display: inline-flex;
  font: 700 13px Poppins, sans-serif;
  gap: 8px;
  min-height: 46px;
  padding: 0 16px;
}

.save-edit:disabled {
  cursor: wait;
  opacity: 0.7;
}

@media (max-width: 980px) {
  .devices-toolbar,
  .device-grid {
    grid-template-columns: 1fr;
  }

  .architecture-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .technical-alerts-grid {
    grid-template-columns: 1fr;
  }

  .toolbar-actions {
    justify-content: start;
  }
}

@media (max-width: 620px) {
  .architecture-grid,
  .device-meta,
  .reading-row {
    grid-template-columns: 1fr;
  }

  .device-head {
    align-items: start;
    grid-template-columns: auto 1fr;
  }

  .device-head > strong {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .edit-form {
    grid-template-columns: 1fr;
  }
}
</style>
