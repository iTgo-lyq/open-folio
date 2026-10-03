import type { Device, PreviewEntry } from "./model";

export const DEVICE_VIEWPORTS = {
  "pc-web": { width: 1440, height: 900 },
  ipad: { width: 834, height: 1194 },
  mobile: { width: 390, height: 844 },
};
export function previewViewport(entry: PreviewEntry, requested?: string) {
  const device = entry.devices?.includes(requested as Device)
    ? (requested as Device)
    : entry.devices?.[0];
  return {
    device,
    viewport: entry.viewport ?? DEVICE_VIEWPORTS[device!],
  };
}
