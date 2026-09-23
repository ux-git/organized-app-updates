import React from 'react';
import { createRoot } from 'react-dom/client';
import { getCSSPropertyValue } from '@utils/common';
import App from './App';

const saved = (key: string, fallback: string) => {
  const value = localStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as string;
  } catch {
    return value;
  }
};

document.documentElement.setAttribute(
  'data-theme',
  `${saved('color', 'blue')}-${saved('theme', 'light')}`
);
document
  .querySelector("meta[name='theme-color']")
  ?.setAttribute('content', getCSSPropertyValue('--accent-100'));

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
