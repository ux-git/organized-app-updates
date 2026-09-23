import {
  Children,
  cloneElement,
  isValidElement,
  ReactElement,
  ReactNode,
} from 'react';
import NavBarButton from '@components/nav_bar_button';
import { NavBarButtonProps } from '@components/nav_bar_button/index.types';

export const markLastNavBarButton = (children: ReactNode): ReactNode => {
  const flat = Children.toArray(children);

  let lastParentIndex = -1;
  let lastChildIndex: number | null = null;

  for (let i = 0; i < flat.length; i++) {
    const child = flat[i];

    if (!isValidElement(child)) continue;

    if (child.type === NavBarButton) {
      lastParentIndex = i;
      lastChildIndex = null;
      continue;
    }

    const nested = Children.toArray(
      (child.props as { children?: ReactNode }).children
    );
    for (let j = 0; j < nested.length; j++) {
      const nestedChild = nested[j];
      if (isValidElement(nestedChild) && nestedChild.type === NavBarButton) {
        lastParentIndex = i;
        lastChildIndex = j;
      }
    }
  }

  if (lastParentIndex === -1) return children;

  return flat.map((child, i) => {
    if (!isValidElement(child)) return child;

    if (i !== lastParentIndex) return child;

    if (lastChildIndex === null && child.type === NavBarButton) {
      return cloneElement(child as ReactElement<NavBarButtonProps>, {
        main: true,
      });
    }

    if (lastChildIndex !== null) {
      const nested = Children.toArray(
        (child.props as { children?: ReactNode }).children
      );
      const updatedNested = nested.map((nestedChild, j) =>
        isValidElement(nestedChild) &&
        nestedChild.type === NavBarButton &&
        j === lastChildIndex
          ? cloneElement(nestedChild as ReactElement<NavBarButtonProps>, {
              main: true,
            })
          : nestedChild
      );
      return cloneElement(child as ReactElement<{ children?: ReactNode }>, {
        children: updatedNested,
      });
    }

    return child;
  });
};
