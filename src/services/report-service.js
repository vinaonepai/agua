import { getAccount } from '../data/account-store.js';
import { formatVolume, getSettings } from '../data/settings-store.js';
import { listDevices } from './device-service.js';
import { getConsumptionReadings } from './reading-service.js';
import { generateTechnicalAlerts } from './technical-alert-service.js';

const pdfWidth = 595;
const pdfHeight = 842;
const margin = 42;

const formatDate = (date = new Date()) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);

const formatDateTime = (date = new Date()) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

const onlyAscii = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '');

const escapePdfText = (value) => onlyAscii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const safeFileName = (value) =>
  onlyAscii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'agua-mais';

const parseVolumeNumber = (value) => {
  const normalized = String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildDeviceStatusSummary = (devices = []) => {
  const totals = {
    active: devices.filter((device) => device.status === 'Ativo').length,
    waiting: devices.filter((device) => device.status === 'Aguardando conexao').length,
    offline: devices.filter((device) => device.status === 'Offline').length,
    maintenance: devices.filter((device) => device.status === 'Manutencao').length,
  };

  if (!devices.length) {
    return 'Nenhum dispositivo cadastrado';
  }

  return `${totals.active} ativos, ${totals.waiting} aguardando, ${totals.offline} offline, ${totals.maintenance} em manutencao`;
};

const getMainInsight = ({ report, alerts }) => {
  if (!report.devices.length) {
    return 'O ambiente ainda nao possui dispositivos vinculados. A estrutura ja esta pronta para receber ESP32 e sensor de vazao.';
  }

  if (alerts.some((alert) => alert.severity === 'critical')) {
    return 'Ha alertas criticos no periodo. Recomenda-se verificar dispositivos e leituras com prioridade.';
  }

  if (report.totalLiters > 0) {
    return 'O monitoramento esta registrando consumo e pode ser usado para comparacao semanal, simulacao e apresentacao.';
  }

  return 'Os dispositivos estao cadastrados, mas ainda nao ha volume relevante registrado neste periodo.';
};

export const buildOperationalReport = async () => {
  const settings = getSettings();
  const account = getAccount();
  const devices = await listDevices();
  const consumption = getConsumptionReadings(settings, devices);
  const alerts = generateTechnicalAlerts({
    devices,
    readings: consumption.rawReadings,
    settings,
  });
  const totalLiters = consumption.rawReadings.reduce((sum, reading) => sum + Number(reading.liters || 0), 0);
  const peakReading = consumption.rawReadings.reduce((peak, reading) => Math.max(peak, Number(reading.liters || 0)), 0);
  const averageLiters = totalLiters / 7;
  const lastReading = consumption.rawReadings
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] || null;

  const report = {
    generatedAt: new Date(),
    account,
    settings,
    devices,
    consumption,
    alerts,
    totalLiters,
    totalLabel: formatVolume(totalLiters, settings),
    averageLabel: formatVolume(averageLiters, settings),
    peakLabel: formatVolume(peakReading, settings),
    lastReadingLabel: lastReading ? formatDateTime(new Date(lastReading.timestamp)) : 'Sem leituras',
    deviceStatusSummary: buildDeviceStatusSummary(devices),
  };

  return {
    ...report,
    insight: getMainInsight({ report, alerts }),
  };
};

const createPdfDocument = (contentStream) => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return pdf;
};

const pdfPainter = () => {
  const commands = [];
  const y = (top) => pdfHeight - top;

  const color = (hex) => {
    const value = hex.replace('#', '');
    const r = parseInt(value.slice(0, 2), 16) / 255;
    const g = parseInt(value.slice(2, 4), 16) / 255;
    const b = parseInt(value.slice(4, 6), 16) / 255;
    return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
  };

  const rect = (x, top, width, height, hex) => {
    commands.push(`${color(hex)} rg ${x} ${y(top + height)} ${width} ${height} re f`);
  };

  const strokeRect = (x, top, width, height, hex) => {
    commands.push(`${color(hex)} RG ${x} ${y(top + height)} ${width} ${height} re S`);
  };

  const text = (value, x, top, size = 10, hex = '#12343d', bold = false) => {
    commands.push(`BT ${color(hex)} rg /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y(top)} Td (${escapePdfText(value)}) Tj ET`);
  };

  const wrapText = (value, x, top, maxChars, lineHeight, size = 10, hex = '#12343d', bold = false) => {
    const words = onlyAscii(value).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';

    words.forEach((word) => {
      const nextLine = line ? `${line} ${word}` : word;
      if (nextLine.length > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = nextLine;
      }
    });

    if (line) {
      lines.push(line);
    }

    lines.slice(0, 4).forEach((item, index) => {
      text(item, x, top + index * lineHeight, size, hex, bold);
    });

    return top + Math.min(lines.length, 4) * lineHeight;
  };

  return {
    commands,
    rect,
    strokeRect,
    text,
    wrapText,
    output: () => commands.join('\n'),
  };
};

const drawMetric = (page, { x, y, width, label, value, detail }) => {
  page.rect(x, y, width, 68, '#eefafa');
  page.strokeRect(x, y, width, 68, '#b7dddd');
  page.text(label, x + 12, y + 21, 8, '#2c6f76', true);
  page.text(value, x + 12, y + 43, 18, '#0d4b5e', true);
  page.text(detail, x + 12, y + 58, 7, '#55737b');
};

export const downloadReportPdf = (report) => {
  const page = pdfPainter();
  const institution = report.account.company || 'Instituicao nao informada';
  const unit = report.account.unit || 'Unidade nao informada';
  const fileName = `relatorio-${safeFileName(institution)}-${formatDate(report.generatedAt).replace(/\//g, '-')}.pdf`;

  page.rect(0, 0, pdfWidth, pdfHeight, '#f4fbfb');
  page.rect(0, 0, pdfWidth, 132, '#0d4b5e');
  page.rect(0, 0, 180, 132, '#37c9c3');
  page.text('Agua+', margin, 44, 22, '#ffffff', true);
  page.text('Relatorio operacional de consumo', margin, 76, 20, '#ffffff', true);
  page.text(`Gerado em ${formatDateTime(report.generatedAt)}`, margin, 100, 10, '#ddfbf8');
  page.text(institution, 330, 48, 14, '#ffffff', true);
  page.text(unit, 330, 68, 10, '#ddfbf8');
  page.text(report.account.name || 'Usuario Agua+', 330, 88, 9, '#ddfbf8');

  drawMetric(page, {
    x: margin,
    y: 162,
    width: 118,
    label: 'Consumo total',
    value: report.totalLabel,
    detail: 'Periodo semanal',
  });
  drawMetric(page, {
    x: 172,
    y: 162,
    width: 118,
    label: 'Media diaria',
    value: report.averageLabel,
    detail: 'Calculada por dia',
  });
  drawMetric(page, {
    x: 302,
    y: 162,
    width: 118,
    label: 'Pico',
    value: report.peakLabel,
    detail: 'Maior leitura',
  });
  drawMetric(page, {
    x: 432,
    y: 162,
    width: 118,
    label: 'Dispositivos',
    value: String(report.devices.length),
    detail: report.devices.length === 1 ? 'Cadastrado' : 'Cadastrados',
  });

  page.text('Analise do periodo', margin, 270, 15, '#0d4b5e', true);
  page.wrapText(report.insight, margin, 292, 86, 13, 10, '#46656d');
  page.text(`Status dos dispositivos: ${report.deviceStatusSummary}`, margin, 348, 9, '#2c6f76', true);
  page.text(`Ultima leitura: ${report.lastReadingLabel}`, margin, 365, 9, '#46656d');
  page.text(`Modo: ${report.settings.simulationMode ? 'simulado' : 'real'} | Apresentacao: ${report.settings.presentationMode ? 'ativa' : 'inativa'}`, margin, 382, 9, '#46656d');

  page.text('Historico semanal', margin, 430, 15, '#0d4b5e', true);
  const bars = report.consumption.weeklyBars;
  const chartX = margin;
  const chartY = 464;
  const chartHeight = 108;
  const barGap = 14;
  const barWidth = 52;
  bars.forEach((bar, index) => {
    const value = parseVolumeNumber(bar.liters);
    const maxValue = Math.max(...bars.map((item) => parseVolumeNumber(item.liters)), 1);
    const height = Math.max(value ? 10 : 2, Math.round((value / maxValue) * chartHeight));
    const x = chartX + index * (barWidth + barGap);
    page.rect(x, chartY + chartHeight - height, barWidth, height, value ? '#37c9c3' : '#cfe6e7');
    page.text(bar.day, x + 17, chartY + chartHeight + 18, 8, '#46656d', true);
    page.text(bar.liters, x + 6, chartY + chartHeight - height - 8, 7, '#0d4b5e', true);
  });

  page.text('Dispositivos monitorados', margin, 632, 15, '#0d4b5e', true);
  const deviceLines = report.devices.length
    ? report.devices.slice(0, 4).map((device) => `${device.name || 'Dispositivo'} | ${device.deviceCode || 'Sem codigo'} | ${device.status || 'Sem status'} | ${device.sensor?.name || 'Sensor nao definido'}`)
    : ['Nenhum dispositivo cadastrado no painel.'];
  deviceLines.forEach((line, index) => {
    page.text(line, margin, 656 + index * 16, 9, '#46656d');
  });

  page.text('Alertas e ultimas leituras', margin, 735, 15, '#0d4b5e', true);
  const alertText = report.alerts.length
    ? `${report.alerts.length} alerta(s): ${report.alerts.slice(0, 2).map((alert) => alert.title).join(', ')}`
    : 'Nenhum alerta tecnico ativo no periodo.';
  page.wrapText(alertText, margin, 758, 92, 12, 9, '#46656d');
  page.text('Documento gerado pelo Agua+ para acompanhamento de consumo e preparacao da integracao com ESP32.', margin, 812, 7, '#7c9398');

  const pdf = createPdfDocument(page.output());
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
};
