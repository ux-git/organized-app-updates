// Use the visual viewport so the same behavior covers native WebViews and browsers.
export const focusScrollDelta = (
  top: number,
  bottom: number,
  visibleTop: number,
  visibleBottom: number
) => {
  if (visibleBottom <= visibleTop) return 0;
  if (bottom - top > visibleBottom - visibleTop || top < visibleTop)
    return top - visibleTop;
  return bottom > visibleBottom ? bottom - visibleBottom : 0;
};

export const observeKeyboardViewport = () => {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  let baseline = window.innerHeight;
  let width = window.innerWidth;
  let frame = 0;
  let stopped = false;

  const editable = () => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return undefined;
    if (active.isContentEditable) return active;
    if (active instanceof HTMLTextAreaElement)
      return active.readOnly || active.disabled ? undefined : active;
    if (
      active instanceof HTMLInputElement &&
      !active.disabled &&
      !active.readOnly &&
      ![
        'checkbox',
        'radio',
        'button',
        'submit',
        'reset',
        'range',
        'color',
        'file',
        'hidden',
      ].includes(active.type)
    )
      return active;
    return undefined;
  };

  const update = () => {
    frame = 0;
    if (stopped) return;
    const active = editable();
    const height = viewport?.height ?? window.innerHeight;
    const top = viewport?.offsetTop ?? 0;
    const scale = viewport?.scale ?? 1;
    if (width !== window.innerWidth || !active) {
      baseline = window.innerHeight;
      width = window.innerWidth;
    }
    const open = !!active && scale === 1 && baseline - height > 100;
    root.toggleAttribute('data-keyboard-open', open);
    root.style.setProperty('--keyboard-viewport-height', `${height}px`);
    root.style.setProperty('--keyboard-viewport-top', `${top}px`);
    root.style.setProperty(
      '--keyboard-overlap',
      `${open ? Math.max(0, window.innerHeight - height) : 0}px`
    );
    if (!active || scale !== 1) return;

    const margin =
      parseFloat(getComputedStyle(root).getPropertyValue('--radius-l')) || 0;
    const header = document.querySelector('header')?.getBoundingClientRect();
    const actions = active
      .closest('[role="dialog"]')
      ?.querySelector('[data-dialog-actions]')
      ?.getBoundingClientRect();
    const visibleTop =
      Math.max(
        top,
        header && header.bottom < top + height ? header.bottom : top
      ) + margin;
    const visibleBottom =
      Math.min(top + height, actions?.top ?? Infinity) - margin;
    if (visibleBottom <= visibleTop) return;
    // Only scroll ancestors that can move the focused input; never blur/refocus it.
    let parent = active.parentElement;
    while (parent && parent !== document.body && parent !== root) {
      const style = getComputedStyle(parent);
      if (
        /(auto|scroll)/.test(style.overflowY) &&
        parent.scrollHeight > parent.clientHeight
      ) {
        const bounds = parent.getBoundingClientRect();
        const field = active.getBoundingClientRect();
        parent.scrollTop += focusScrollDelta(
          field.top,
          field.bottom,
          Math.max(visibleTop, bounds.top),
          Math.min(visibleBottom, bounds.bottom)
        );
      }
      parent = parent.parentElement;
    }
    const field = active.getBoundingClientRect();
    const delta = focusScrollDelta(
      field.top,
      field.bottom,
      visibleTop,
      visibleBottom
    );
    if (delta && !active.closest('[role="dialog"]'))
      window.scrollBy({ top: delta, behavior: 'instant' });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  document.addEventListener('input', schedule);
  schedule();
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', schedule);
    document.removeEventListener('input', schedule);
    root.removeAttribute('data-keyboard-open');
    [
      '--keyboard-viewport-height',
      '--keyboard-viewport-top',
      '--keyboard-overlap',
    ].forEach((name) => root.style.removeProperty(name));
  };
};
