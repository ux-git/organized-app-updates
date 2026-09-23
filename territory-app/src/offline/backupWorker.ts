// The main app's server backup runs in this worker; here there is no server.
const worker = {
  postMessage: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  terminate: () => {},
  onmessage: null,
} as unknown as Worker;

export default worker;
