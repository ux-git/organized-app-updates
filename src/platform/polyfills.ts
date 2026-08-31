/**
 * Fills in the web APIs the native shell withholds.
 *
 * Android WebView serves the bundle from `http://tauri.localhost`, which it
 * does not treat as a secure context, and a growing set of APIs is gated on
 * that. Anything imported here must therefore run before the first line of
 * app code, and must never assume it is running in a browser.
 */

/**
 * `crypto.randomUUID` is secure-context only, and the app calls it from
 * roughly a hundred places — seeding test data, creating a person, filing a
 * report. Without it the very first call throws and takes the boot with it.
 *
 * `crypto.getRandomValues` has no such restriction, so the identifiers stay
 * cryptographically random; only the convenience wrapper is missing.
 */
const installRandomUUID = () => {
  if (typeof crypto === 'undefined') return;
  if (typeof crypto.randomUUID === 'function') return;

  const uuid = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // RFC 4122 section 4.4: version 4, variant 1
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex: string[] = [];
    for (const byte of bytes) hex.push(byte.toString(16).padStart(2, '0'));

    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-') as ReturnType<Crypto['randomUUID']>;
  };

  Object.defineProperty(crypto, 'randomUUID', {
    value: uuid,
    configurable: true,
    writable: true,
  });
};

installRandomUUID();
