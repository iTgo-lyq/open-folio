/** @param {Document & { featurePolicy?: { features(): string[] } }} document */
export function prototypePermissions(document) {
  // Discover every supported directive so new browser capabilities are delegated too.
  const features = document.featurePolicy?.features() ?? [
    "autoplay", "camera", "clipboard-read", "clipboard-write", "display-capture",
    "encrypted-media", "fullscreen", "geolocation", "gyroscope", "accelerometer",
    "magnetometer", "microphone", "midi", "payment", "picture-in-picture",
    "screen-wake-lock", "serial", "usb", "web-share", "xr-spatial-tracking",
  ];
  return features.map((feature) => `${feature} *`).join("; ");
}
