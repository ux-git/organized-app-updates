/**
 * Makes a failed boot say so, on the device, without any tooling attached.
 *
 * A native build has no console to read: a thrown error or a promise that
 * simply never settles both look identical from the outside - a loading
 * screen that never leaves. This records how far the boot got and puts the
 * reason on screen.
 *
 * Deliberately plain DOM. It has to survive the very failures it reports, so
 * it cannot depend on React, the theme, or any stylesheet having loaded.
 */

const steps: string[] = [];
let shown = false;

/** Records a boot step, so a stalled boot can name where it stopped. */
export const bootStep = (name: string) => {
  steps.push(name);
};

const render = (title: string, detail: string) => {
  if (shown) return;
  shown = true;

  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:#1c1c25', 'color:#fff', 'overflow:auto',
    'padding:24px', 'font:13px/1.5 monospace', 'white-space:pre-wrap',
  ].join(';');

  const reached = steps.length
    ? `reached: ${steps.join(' -> ')}`
    : 'reached: nothing — failed before the first step';

  panel.textContent = `${title}\n\n${detail}\n\n${reached}`;
  document.body.append(panel);
};

export const installBootDiagnostics = () => {
  window.addEventListener('error', (event) => {
    render('Startup error', `${event.message}\n${event.filename}:${event.lineno}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    render(
      'Startup error (unhandled rejection)',
      reason instanceof Error ? `${reason.message}\n\n${reason.stack}` : String(reason)
    );
  });

  // Nothing above fires for a promise that never settles - a blocked
  // IndexedDB delete, an awaited plugin call that never returns - which is
  // exactly the failure that leaves a loading screen up forever.
  window.setTimeout(() => {
    if (document.querySelector('[data-app-ready]')) return;

    render(
      'Startup did not finish',
      'The app was still loading after 40 seconds. Nothing threw, so a step is waiting on something that never completes.'
    );
  }, 40_000);
};
