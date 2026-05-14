import { File } from './file.js';

const RE_DRM_CARD = /^card\d+$/;

const KnownPciIdsPaths = [
  '/run/current-system/sw/share/hwdata/pci.ids',
  '/run/current-system/sw/share/misc/pci.ids',
  '/usr/share/hwdata/pci.ids',
  '/usr/share/misc/pci.ids',
  '/var/lib/pciutils/pci.ids',
];

export interface GpuDeviceChoice {
  id: string;
  label: string;
}

let cachedPciIdsPath: string | null | undefined;
let cachedPciNames: Map<string, string> | null = null;

export function listUsableGpuDevices(): GpuDeviceChoice[] {
  const drm = new File('/sys/class/drm');
  const gpus = new Array<GpuDeviceChoice>();
  for (const entry of drm.listSync().sort()) {
    if (!entry.match(RE_DRM_CARD)) {
      continue;
    }

    const cardPath = `/sys/class/drm/${entry}`;
    if (!gpuCardIsUsable(cardPath)) {
      continue;
    }

    gpus.push({
      id: entry,
      label: getGpuDeviceLabel(entry),
    });
  }
  return gpus;
}

export function getGpuDeviceLabel(cardId: string): string {
  const cardPath = `/sys/class/drm/${cardId}`;
  const model = getPciDeviceName(cardPath);
  if (model) {
    return `${model} (${cardId})`;
  }

  const driver = new File(`${cardPath}/device/uevent`)
    .readSync(false)
    .split('\n')
    .find((line) => line.startsWith('DRIVER='))
    ?.replace('DRIVER=', '');
  if (driver) {
    return `${cardId} (${driver})`;
  }

  return cardId;
}

export function gpuCardIsUsable(cardPath: string): boolean {
  const base = `${cardPath}/device`;
  const busy = new File(`${base}/gpu_busy_percent`);
  const total = new File(`${base}/mem_info_vram_total`);
  const used = new File(`${base}/mem_info_vram_used`);
  return busy.exists() && total.exists() && used.exists();
}

function getPciDeviceName(cardPath: string): string {
  const vendorId = stripHexPrefix(
    new File(`${cardPath}/device/vendor`).readSync(false)
  );
  const deviceId = stripHexPrefix(
    new File(`${cardPath}/device/device`).readSync(false)
  );
  if (!vendorId || !deviceId) {
    return '';
  }

  const pciNames = loadPciNames();
  return pciNames.get(`${vendorId}:${deviceId}`) || '';
}

function stripHexPrefix(value: string): string {
  return value.toLowerCase().replace(/^0x/, '');
}

function loadPciNames(): Map<string, string> {
  if (cachedPciNames) {
    return cachedPciNames;
  }

  cachedPciNames = new Map<string, string>();
  const path = findPciIdsPath();
  if (!path) {
    return cachedPciNames;
  }

  const contents = new File(path).readSync(false);
  if (!contents) {
    return cachedPciNames;
  }

  let currentVendor = '';
  for (const line of contents.split('\n')) {
    if (!line || line.startsWith('#')) {
      continue;
    }

    const vendorMatch = line.match(/^([0-9a-f]{4})\s+(.+)$/i);
    if (vendorMatch) {
      currentVendor = vendorMatch[1].toLowerCase();
      continue;
    }

    const deviceMatch = line.match(/^\t([0-9a-f]{4})\s+(.+)$/i);
    if (deviceMatch && currentVendor) {
      cachedPciNames.set(
        `${currentVendor}:${deviceMatch[1].toLowerCase()}`,
        deviceMatch[2]
      );
    }
  }

  return cachedPciNames;
}

function findPciIdsPath(): string | null {
  if (cachedPciIdsPath !== undefined) {
    return cachedPciIdsPath;
  }

  for (const path of KnownPciIdsPaths) {
    if (new File(path).exists()) {
      cachedPciIdsPath = path;
      return cachedPciIdsPath;
    }
  }

  const nixStore = new File('/nix/store');
  for (const entry of nixStore.listSync()) {
    if (!entry.includes('-hwdata-')) {
      continue;
    }

    const path = `/nix/store/${entry}/share/hwdata/pci.ids`;
    if (new File(path).exists()) {
      cachedPciIdsPath = path;
      return cachedPciIdsPath;
    }
  }

  cachedPciIdsPath = null;
  return cachedPciIdsPath;
}
