import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PointerEvent } from 'react';
vi.mock('react', () => ({
  useRef: (value: unknown) => ({ current: value }),
  useEffect: () => {},
}));
import usePhoneSelection from '@features/territories/components/usePhoneSelection';
const event = (x = 0, interactive = false) => ({
  isPrimary: true, button: 0, clientX: x, clientY: 0,
  target: { closest: () => interactive ? {} : null },
}) as unknown as PointerEvent<HTMLElement>;
afterEach(() => vi.useRealTimers());
describe('phone long-press selection', () => {
  test('selects after holding and consumes only the release click', () => {
    vi.useFakeTimers();
    const select = vi.fn();
    const press = usePhoneSelection(true, select);
    const handlers = press.handlers('M15');
    handlers.onPointerDown?.(event());
    vi.advanceTimersByTime(499);
    expect(select).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    handlers.onPointerUp?.();
    expect(select).toHaveBeenCalledExactlyOnceWith('M15');
    expect(press.consumeClick('M15')).toBe(true);
    expect(press.consumeClick('M15')).toBe(false);
  });
  test.each(['move', 'release', 'cancel'])('%s cancels the hold', (cancel) => {
    vi.useFakeTimers();
      const select = vi.fn();
      const handlers = usePhoneSelection(true, select).handlers('M15');
      handlers.onPointerDown?.(event());
      if (cancel === 'move') handlers.onPointerMove?.(event(20));
      if (cancel === 'release') handlers.onPointerUp?.();
      if (cancel === 'cancel') handlers.onPointerCancel?.();
      vi.advanceTimersByTime(600);
      expect(select).not.toHaveBeenCalled();
  });
  test('does not intercept nested controls or larger-screen rows', () => {
    vi.useFakeTimers();
    const select = vi.fn();
    usePhoneSelection(true, select).handlers('M15').onPointerDown?.(event(0, true));
    vi.advanceTimersByTime(600);
    expect(select).not.toHaveBeenCalled();
    expect(usePhoneSelection(false, select).handlers('M15')).toEqual({});
  });
});
