import { state, syncStateToManager } from './state.js?v=1';

// ========== Card Management ==========
function getCardProgramName(cardEl) {
  const pname = cardEl.querySelector('.pname');
  return pname?.textContent?.trim() || 'Program';
}

function setExpandBtnA11y(expandBtn, isOpen, programName) {
  if (!expandBtn) return;
  const name = programName || 'Program';
  expandBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  expandBtn.setAttribute('title', isOpen ? 'Collapse details' : 'View details');
  expandBtn.setAttribute(
    'aria-label',
    isOpen ? `Collapse details for ${name}` : `View details for ${name}`
  );
}

function setCardOpen(cardEl, isOpen){
  cardEl.dataset.open = isOpen ? "true" : "false";
  const btn = cardEl.querySelector(".expandBtn");
  setExpandBtnA11y(btn, isOpen, getCardProgramName(cardEl));
  const panel = cardEl.querySelector('.panel');
  if (panel) {
    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    // Keep collapsed panel content out of keyboard/AT flow.
    if ('inert' in panel) panel.inert = !isOpen;
  }
}

// Toggle modal-local card details (self-contained, doesn't affect main page)
function toggleModalCardDetails(cardEl) {
  if (!cardEl) return;
  
  const details = cardEl.querySelector('.card-details');
  if (!details) return;
  
  const isOpen = !details.hasAttribute('hidden');
  const expandBtn = cardEl.querySelector('.expandBtn');
  
  if (isOpen) {
    // Collapse
    details.setAttribute('hidden', '');
    cardEl.dataset.open = 'false';
    if (expandBtn) {
      setExpandBtnA11y(expandBtn, false, getCardProgramName(cardEl));
    }
  } else {
    // Expand
    details.removeAttribute('hidden');
    cardEl.dataset.open = 'true';
    if (expandBtn) {
      setExpandBtnA11y(expandBtn, true, getCardProgramName(cardEl));
    }
  }
}

function toggleOpen(id){
  if (!id) return;
  
  const nextOpenId = (state.openId === id) ? null : id;

  // Close previously open card
  if (state.openId && state.openId !== nextOpenId){
    const prev = document.querySelector(`.card[data-id="${CSS.escape(state.openId)}"]`);
    if (prev) {
      setCardOpen(prev, false);
    }
  }

  state.openId = nextOpenId;
  syncStateToManager(); // Sync with StateManager

  // Open new card if needed
  if (state.openId){
    const cur = document.querySelector(`.card[data-id="${CSS.escape(state.openId)}"]`);
    if (cur) {
      // Only scroll on main page cards, not inside modals
      const isInModal = cur.closest('.modal');
      
      setCardOpen(cur, true);

      // Scroll expanded panel into view (only for main page, not modals)
      if (!isInModal) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          const panel = cur.querySelector('.panel');
          if (panel) {
            panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        });
      }
    }
  }
}

export { getCardProgramName, setExpandBtnA11y, setCardOpen, toggleModalCardDetails, toggleOpen };
