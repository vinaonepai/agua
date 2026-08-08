import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getCurrentUser, getFirestoreDb, isFirebaseReady, waitForCurrentUser } from './firebase.js';
import { getSimulatedReadingsForDevice, normalizeReadingPayload, READING_PAYLOAD_VERSION } from './reading-service.js';
import { getSettings } from '../data/settings-store.js';

const DEVICES_KEY = 'agua-plus-devices';

export const DEVICE_STATUSES = ['Aguardando conexao', 'Ativo', 'Offline', 'Manutencao'];
export const SENSOR_MODELS = ['YF-S201', 'YF-B1', 'Sensor Hall generico', 'Medidor com saida de pulso', 'Outro'];
export const SENSOR_TYPES = ['Fluxo de agua por pulso'];

const simulatedDevice = {
  name: 'ESP32 Protótipo',
  deviceCode: 'ESP32-FLOW-001',
  location: 'Bancada de testes',
  unit: '',
  status: 'Aguardando conexao',
  sensor: {
    name: 'YF-S201',
    sensorCode: 'FLOW-YF-S201-001',
    type: 'Fluxo de agua por pulso',
    calibrationFactor: 7.5,
  },
  readingInterval: 10,
  totalConsumption: 0,
  lastReadingLiters: 0,
  lastFlowRate: 0,
  lastPulseCount: 0,
  lastReadingAt: null,
};

const normalizeDevice = (device = {}) => ({
  id: device.id || `local-${Date.now()}`,
  name: device.name || '',
  deviceCode: device.deviceCode || '',
  location: device.location || '',
  unit: device.unit || '',
  status: device.status || 'Aguardando conexao',
  sensor: {
    name: device.sensor?.name || 'YF-S201',
    sensorCode: device.sensor?.sensorCode || '',
    type: device.sensor?.type || 'Fluxo de agua por pulso',
    calibrationFactor: Number(device.sensor?.calibrationFactor || 7.5),
  },
  readingInterval: Number(device.readingInterval || 10),
  totalConsumption: Number(device.totalConsumption || 0),
  lastReadingLiters: Number(device.lastReadingLiters || 0),
  lastFlowRate: Number(device.lastFlowRate || 0),
  lastPulseCount: Number(device.lastPulseCount || 0),
  lastReadingAt: device.lastReadingAt || null,
  createdAt: device.createdAt || null,
  updatedAt: device.updatedAt || null,
});

const withoutDeviceId = (device) => {
  const payload = { ...device };
  delete payload.id;

  if (!payload.createdAt) {
    delete payload.createdAt;
  }

  if (!payload.updatedAt) {
    delete payload.updatedAt;
  }

  return payload;
};

const getLocalDevices = () => {
  try {
    const raw = localStorage.getItem(DEVICES_KEY);
    return raw ? JSON.parse(raw).map(normalizeDevice) : [];
  } catch (error) {
    return [];
  }
};

const saveLocalDevices = (devices) => {
  const normalized = devices.map(normalizeDevice);
  localStorage.setItem(DEVICES_KEY, JSON.stringify(normalized));
  return normalized;
};

const getUserDevicesCollection = () => {
  const db = getFirestoreDb();
  const currentUser = getCurrentUser();

  if (!db || !currentUser) {
    return null;
  }

  return collection(db, 'users', currentUser.uid, 'devices');
};

const resolveDeviceUser = async () => {
  if (!isFirebaseReady()) {
    return null;
  }

  return getCurrentUser() || await waitForCurrentUser();
};

const shouldUseLocalDevices = () => !isFirebaseReady();

const sortDevicesByCreatedAt = (devices) =>
  devices.slice().sort((first, second) => {
    const firstDate = first.createdAt?.toDate?.() || new Date(first.createdAt || 0);
    const secondDate = second.createdAt?.toDate?.() || new Date(second.createdAt || 0);
    return secondDate.getTime() - firstDate.getTime();
  });

const deleteSubcollectionDocs = async (deviceRef, subcollectionName) => {
  const snapshot = await getDocs(collection(deviceRef, subcollectionName));
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
};

const tryDeleteSubcollectionDocs = async (deviceRef, subcollectionName) => {
  try {
    await deleteSubcollectionDocs(deviceRef, subcollectionName);
  } catch (error) {
    // The parent device deletion is the important operation for the current UI.
  }
};

export const listDevices = async () => {
  if (shouldUseLocalDevices()) {
    return getLocalDevices();
  }

  const user = await resolveDeviceUser();

  if (!user) {
    return [];
  }

  const devicesRef = getUserDevicesCollection();
  const snapshot = await getDocs(query(devicesRef));
  return sortDevicesByCreatedAt(snapshot.docs.map((item) => normalizeDevice({ ...item.data(), id: item.id })));
};

export const getDeviceById = async (deviceId) => {
  if (!deviceId) {
    return null;
  }

  if (shouldUseLocalDevices()) {
    return getLocalDevices().find((device) => device.id === deviceId) || null;
  }

  const user = await resolveDeviceUser();

  if (!user) {
    return null;
  }

  const devicesRef = getUserDevicesCollection();
  const snapshot = await getDoc(doc(devicesRef, deviceId));
  return snapshot.exists() ? normalizeDevice({ ...snapshot.data(), id: snapshot.id }) : null;
};

const buildLocalDeviceReadings = (device) => {
  const settings = getSettings();

  if (!settings.simulationMode || !device) {
    return [];
  }

  return getSimulatedReadingsForDevice(device, settings).filter(
    (reading) => reading.liters > 0 || reading.flowRate > 0 || reading.status === 'anomaly' || settings.presentationMode,
  );
};

const normalizeFirestoreDate = (value) => {
  if (value?.toDate) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value || new Date().toISOString();
};

export const listDeviceReadings = async (deviceId) => {
  const device = await getDeviceById(deviceId);

  if (!device) {
    return [];
  }

  if (shouldUseLocalDevices()) {
    return buildLocalDeviceReadings(device);
  }

  const devicesRef = getUserDevicesCollection();
  const snapshot = await getDocs(query(collection(devicesRef, deviceId, 'readings')));
  const readings = snapshot.docs.map((item) =>
    normalizeReadingPayload({
      ...item.data(),
      id: item.id,
      timestamp: normalizeFirestoreDate(item.data().timestamp),
      receivedAt: normalizeFirestoreDate(item.data().receivedAt),
    }),
  );

  const hasUsefulReadings = readings.some((reading) => reading.liters > 0 || reading.flowRate > 0 || reading.status === 'anomaly');
  return hasUsefulReadings || !getSettings().simulationMode ? readings : buildLocalDeviceReadings(device);
};

export const listDeviceAlerts = async (deviceId) => {
  const device = await getDeviceById(deviceId);

  if (!device) {
    return [];
  }

  if (shouldUseLocalDevices()) {
    return [
      {
        id: `${device.id}-waiting`,
        title: 'Dispositivo aguardando conexao',
        message: 'Pronto para receber leituras reais quando o ESP32 for conectado.',
        status: device.status === 'Ativo' ? 'Resolvido' : 'Aberto',
      },
    ];
  }

  const devicesRef = getUserDevicesCollection();
  const snapshot = await getDocs(query(collection(devicesRef, deviceId, 'alerts')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const listDeviceMaintenanceOrders = async (deviceId) => {
  const device = await getDeviceById(deviceId);

  if (!device) {
    return [];
  }

  if (shouldUseLocalDevices()) {
    return [
      {
        id: `${device.id}-installation-check`,
        title: 'Validar instalacao do sensor',
        description: 'Conferir posicao do YF-S201, sentido do fluxo e vedacao antes das leituras reais.',
        status: 'Planejada',
      },
    ];
  }

  const devicesRef = getUserDevicesCollection();
  const snapshot = await getDocs(query(collection(devicesRef, deviceId, 'maintenanceOrders')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const createDevice = async (device) => {
  const nextDevice = normalizeDevice({
    ...device,
    totalConsumption: 0,
    lastReadingLiters: 0,
    lastFlowRate: 0,
    lastPulseCount: 0,
    lastReadingAt: null,
  });

  if (shouldUseLocalDevices()) {
    const devices = saveLocalDevices([{ ...nextDevice, id: `local-${Date.now()}` }, ...getLocalDevices()]);
    return devices[0];
  }

  const user = await resolveDeviceUser();

  if (!user) {
    throw new Error('Entre na conta antes de cadastrar dispositivos.');
  }

  const devicesRef = getUserDevicesCollection();
  const devicePayload = withoutDeviceId(nextDevice);
  const created = await addDoc(devicesRef, {
    ...devicePayload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(doc(devicesRef, created.id, 'sensors', nextDevice.sensor.sensorCode || 'flow-sensor'), {
    ...nextDevice.sensor,
    deviceId: created.id,
    status: nextDevice.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(devicesRef, created.id, 'readings'), {
    ...normalizeReadingPayload({
      deviceId: created.id,
      deviceCode: nextDevice.deviceCode,
      sensorId: nextDevice.sensor.sensorCode || 'flow-sensor',
      sensorCode: nextDevice.sensor.sensorCode || 'flow-sensor',
      calibrationFactor: nextDevice.sensor.calibrationFactor,
      intervalSeconds: nextDevice.readingInterval,
      status: 'waiting',
      source: 'simulated',
    }),
    schemaVersion: READING_PAYLOAD_VERSION,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(devicesRef, created.id, 'alerts'), {
    type: 'device-waiting',
    title: 'Dispositivo aguardando conexao',
    message: 'Este dispositivo simulado esta pronto para receber leituras do ESP32 futuramente.',
    status: 'Aberto',
    createdAt: serverTimestamp(),
  });

  await addDoc(collection(devicesRef, created.id, 'maintenanceOrders'), {
    title: 'Validar instalacao do sensor',
    description: 'Ordem simulada para registrar a futura verificacao fisica do sensor de vazao.',
    status: 'Planejada',
    createdAt: serverTimestamp(),
  });

  return { ...nextDevice, id: created.id };
};

export const createSimulatedDevice = (unit = '') => {
  return createDevice({
    ...simulatedDevice,
    unit,
  });
};

export const linkDeviceByCode = async ({
  deviceCode,
  name = '',
  location = '',
  unit = '',
  sensorModel = 'YF-S201',
  sensorCode = '',
  calibrationFactor = 7.5,
  readingInterval = 10,
}) => {
  const normalizedCode = String(deviceCode || '').trim().toUpperCase();

  if (!normalizedCode) {
    throw new Error('Informe o codigo do dispositivo.');
  }

  const alreadyLinked = (await listDevices()).some(
    (device) => String(device.deviceCode || '').trim().toUpperCase() === normalizedCode,
  );

  if (alreadyLinked) {
    throw new Error('Este dispositivo ja esta vinculado a sua conta.');
  }

  return createDevice({
    name: name || `Dispositivo ${normalizedCode}`,
    deviceCode: normalizedCode,
    location,
    unit,
    status: 'Aguardando conexao',
    sensor: {
      name: sensorModel,
      sensorCode: sensorCode || `${normalizedCode}-FLOW`,
      type: 'Fluxo de agua por pulso',
      calibrationFactor,
    },
    readingInterval,
  });
};

export const updateDeviceStatus = async (deviceId, status) => {
  if (!DEVICE_STATUSES.includes(status)) {
    return;
  }

  if (shouldUseLocalDevices()) {
    saveLocalDevices(getLocalDevices().map((device) => (device.id === deviceId ? { ...device, status } : device)));
    return;
  }

  const user = await resolveDeviceUser();

  if (!user) {
    throw new Error('Entre na conta antes de atualizar dispositivos.');
  }

  const devicesRef = getUserDevicesCollection();
  await setDoc(
    doc(devicesRef, deviceId),
    {
      status,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const updateDevice = async (deviceId, updates) => {
  if (shouldUseLocalDevices()) {
    saveLocalDevices(getLocalDevices().map((device) => (device.id === deviceId ? normalizeDevice({ ...device, ...updates }) : device)));
    return;
  }

  const user = await resolveDeviceUser();

  if (!user) {
    throw new Error('Entre na conta antes de atualizar dispositivos.');
  }

  const currentDevice = await getDeviceById(deviceId);

  if (!currentDevice) {
    throw new Error('Dispositivo nao encontrado.');
  }

  const nextUpdates = normalizeDevice({
    ...currentDevice,
    ...updates,
    sensor: {
      ...currentDevice.sensor,
      ...updates.sensor,
    },
    id: deviceId,
  });
  const payload = withoutDeviceId(nextUpdates);

  const devicesRef = getUserDevicesCollection();
  await setDoc(
    doc(devicesRef, deviceId),
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    doc(devicesRef, deviceId, 'sensors', payload.sensor.sensorCode || 'flow-sensor'),
    {
      ...payload.sensor,
      deviceId,
      status: payload.status,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const removeDevice = async (deviceId) => {
  if (shouldUseLocalDevices()) {
    saveLocalDevices(getLocalDevices().filter((device) => device.id !== deviceId));
    return;
  }

  const user = await resolveDeviceUser();

  if (!user) {
    throw new Error('Entre na conta antes de remover dispositivos.');
  }

  const devicesRef = getUserDevicesCollection();
  const deviceRef = doc(devicesRef, deviceId);

  await Promise.all([
    tryDeleteSubcollectionDocs(deviceRef, 'sensors'),
    tryDeleteSubcollectionDocs(deviceRef, 'readings'),
    tryDeleteSubcollectionDocs(deviceRef, 'alerts'),
    tryDeleteSubcollectionDocs(deviceRef, 'maintenanceOrders'),
  ]);
  await deleteDoc(deviceRef);
};
