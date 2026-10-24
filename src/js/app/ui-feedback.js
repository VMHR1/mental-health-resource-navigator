import { els } from './dom.js?v=1';

// showToast wrapper - uses const to avoid overwriting window.showToast
// Note: security.js should use window.showToast directly from render.js
const callShowToast = (message, type = 'success') => {
  const fn = window.showToast; // from render.js
  if (typeof fn === 'function') {
    fn(message, type, els.toast);
  } else {
    // Fallback
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = `toast ${type} show`;
  setTimeout(() => {
    els.toast.classList.remove('show');
  }, type === 'error' ? 5000 : 3000);
  }
};

// showModal wrapper - uses const to avoid overwriting window.showModal
const callShowModal = (modalEl) => {
  const fn = window.showModal; // from render.js
  if (typeof fn === 'function') {
    fn(modalEl);
  } else {
    console.error('showModal not available. Make sure js/modules/render.js is loaded.');
  }
};

// hideModal wrapper - uses const to avoid overwriting window.hideModal
const callHideModal = (modalEl) => {
  const fn = window.hideModal; // from render.js
  if (typeof fn === 'function') {
    fn(modalEl);
  } else {
    console.error('hideModal not available. Make sure js/modules/render.js is loaded.');
  }
};

export { callShowToast, callShowModal, callHideModal };
