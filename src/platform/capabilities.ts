import { platform } from './detect';

/**
 * Things the current host can do. UI must branch on a capability, never on a
 * platform name — that keeps feature code honest when a capability later
 * arrives on a platform that did not have it.
 */
export type Capability =
  /** Physical haptic feedback (not the crude vibration API). */
  | 'haptics'
  /** Scheduled local notifications with action buttons. */
  | 'notification-actions'
  /** Fingerprint / Face ID unlock through the OS. */
  | 'biometric'
  /** Writing an event straight into the system calendar. */
  | 'calendar-write'
  /** Handing a generated file to the OS rather than downloading it. */
  | 'file-share'
  /** A service worker can be registered and will control the page. */
  | 'service-worker'
  /** The app updates itself over the web; false when a store owns updates. */
  | 'web-update';

const WEB: Capability[] = ['service-worker', 'web-update'];
const NATIVE_MOBILE: Capability[] = [
  'haptics',
  'notification-actions',
  'biometric',
  'calendar-write',
  'file-share',
];
const NATIVE_DESKTOP: Capability[] = ['file-share'];

const forPlatform = (): Capability[] => {
  switch (platform()) {
    case 'android':
    case 'ios':
      return NATIVE_MOBILE;
    case 'desktop':
      return NATIVE_DESKTOP;
    default:
      return WEB;
  }
};

let cached: Set<Capability> | undefined;

/** Whether the current host supports a given capability. */
export const can = (capability: Capability): boolean =>
  (cached ??= new Set(forPlatform())).has(capability);
