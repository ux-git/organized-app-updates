import { PropsWithChildren } from 'react';

// No error reporting: nothing about this app's data leaves the phone.
const Sentry = {
  init: () => {},
  captureException: () => {},
  reactErrorHandler: () => () => {},
  ErrorBoundary: ({ children }: PropsWithChildren) => children,
};

export default Sentry;
