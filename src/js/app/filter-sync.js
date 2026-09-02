import { els } from './dom.js?v=1';

function syncTopToggles(){
  if (els.showCrisis && els.showCrisisTop) {
    els.showCrisisTop.checked = els.showCrisis.checked;
  }
  if (els.onlyVirtual && els.onlyVirtualTop) {
    els.onlyVirtualTop.checked = els.onlyVirtual.checked;
  }
}

// Sync chip checkboxes to match select state
function syncChipsToSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const chipContainer = document.querySelector(`[data-sync-select="${selectId}"]`);
  if (!chipContainer) return;
  
  const selectedValues = Array.from(select.selectedOptions).map(opt => opt.value);
  const checkboxes = chipContainer.querySelectorAll('input[type="checkbox"]');
  
  checkboxes.forEach(checkbox => {
    checkbox.checked = selectedValues.includes(checkbox.value);
  });
  
  // Show/hide clear button
  const clearBtn = document.querySelector(`[data-clear-select="${selectId}"]`);
  if (clearBtn) {
    clearBtn.style.display = selectedValues.length > 0 ? 'block' : 'none';
  }
}

// Sync select to match chip checkbox state
function syncSelectToChips(selectId, checkboxValue, isChecked) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const option = Array.from(select.options).find(opt => opt.value === checkboxValue);
  if (option) {
    option.selected = isChecked;
    // Dispatch change event so existing handlers run
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// Initialize chip-based multi-selects
function initChipMultiSelects() {
  const chipContainers = document.querySelectorAll('[data-sync-select]');
  
  chipContainers.forEach(container => {
    const selectId = container.dataset.syncSelect;
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Initial sync from select to chips
    syncChipsToSelect(selectId);
    
    // Handle chip checkbox changes
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        syncSelectToChips(selectId, checkbox.value, e.target.checked);
      });
    });
    
    // Handle clear button
    const clearBtn = document.querySelector(`[data-clear-select="${selectId}"]`);
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        // Clear all options
        Array.from(select.options).forEach(opt => opt.selected = false);
        // Dispatch change event
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  });
}

export { syncTopToggles, syncChipsToSelect, syncSelectToChips, initChipMultiSelects };
