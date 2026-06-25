export function useIosInstall(): { eligible: boolean } {
  if (typeof window === 'undefined') return { eligible: false };

  const ua = navigator.userAgent;

  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ se identifica como MacIntel con touch
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isSafari =
    /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

  // navigator.standalone no es estándar; lo casteamos para evitar el error de TS.
  const isStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  return { eligible: isIos && isSafari && !isStandalone };
}
