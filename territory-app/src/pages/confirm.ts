export type Ask = {
  title: string;
  description: string;
  action: string;
  resolve: (ok: boolean) => void;
};

let show: ((ask: Ask) => void) | undefined;

/**
 * The app's own dialog for a yes/no question. The WebView's window.confirm
 * draws Android's oldest dialog style.
 */
export const confirm = (question: Omit<Ask, 'resolve'>) =>
  new Promise<boolean>((resolve) => {
    if (!show) return resolve(window.confirm(question.description));
    show({ ...question, resolve });
  });

export const subscribeConfirmation = (listener: (ask: Ask) => void) => {
  show = listener;
  return () => {
    show = undefined;
  };
};
