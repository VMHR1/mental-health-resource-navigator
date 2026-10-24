import { els } from './dom.js?v=1';

function buildLocationOptions(list){
  const set = new Set();
  list.forEach(p => {
    (p.locations || []).forEach(l => {
      const c = safeStr(l.city);
      if (c && c.toLowerCase() !== "virtual" && c.toLowerCase() !== "multiple" && c.toLowerCase() !== "n/a") set.add(c);
    });
  });
  const cities = Array.from(set).sort((a,b)=>a.localeCompare(b));
  
  // Clear existing options (preserve the select element)
  if (els.loc) {
    els.loc.innerHTML = '<option value="">Any</option>';
    
    // Add options using DOM methods (safe from XSS)
    cities.forEach(city => {
      const option = document.createElement('option');
      option.value = city; // Browser automatically escapes attribute values
      option.textContent = city; // textContent is safe from XSS
      els.loc.appendChild(option);
    });
  }
}

function buildSearchCities(list) {
  const set = new Set(
    (window.CITIES || []).map((c) => c.toLowerCase())
  );
  list.forEach((p) => {
    (p.locations || []).forEach((l) => {
      const c = safeStr(l.city);
      const key = c.toLowerCase();
      if (
        c &&
        key !== 'virtual' &&
        key !== 'multiple' &&
        key !== 'national' &&
        key !== 'n/a'
      ) {
        set.add(key);
      }
    });
  });
  const cities = Array.from(set).sort((a, b) => a.localeCompare(b));
  window.getSearchCities = () => cities;
  return cities;
}

function buildInsuranceOptions(list){
  const typesSet = new Set();
  const plansSet = new Set();
  
  list.forEach(p => {
    const insurance = p.accepted_insurance || {};
    
    // Extract insurance types
    if (Array.isArray(insurance.types)) {
      insurance.types.forEach(type => {
        const cleanType = safeStr(type).trim();
        if (cleanType) {
          // Normalize common variations
          const normalized = cleanType
            .replace(/\(many\)/gi, '')
            .replace(/\(some\)/gi, '')
            .replace(/\(varies\)/gi, '')
            .replace(/\(listed\)/gi, '')
            .replace(/\(most major\)/gi, '')
            .trim();
          if (normalized) typesSet.add(normalized);
        }
      });
    }
    
    // Extract insurance plans
    if (Array.isArray(insurance.plans)) {
      insurance.plans.forEach(plan => {
        const cleanPlan = safeStr(plan).trim();
        if (cleanPlan) plansSet.add(cleanPlan);
      });
    }
  });
  
  const types = Array.from(typesSet).sort((a,b)=>a.localeCompare(b));
  const plans = Array.from(plansSet).sort((a,b)=>a.localeCompare(b));
  
  if (els.insurance) {
    // Clear existing options
    els.insurance.innerHTML = '';
    
    // Add default "Any insurance" option (static, safe)
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Any insurance';
    els.insurance.appendChild(defaultOption);

    const buckets = window.INSURANCE_BUCKETS || {};
    const bucketOrder = [
      'bucket:medicaid',
      'bucket:medicare',
      'bucket:tricare',
      'bucket:commercial',
      'bucket:self_pay',
      'bucket:contact',
    ];
    const bucketsGroup = document.createElement('optgroup');
    bucketsGroup.label = 'Common coverage';
    bucketOrder.forEach((key) => {
      const meta = buckets[key];
      if (!meta) return;
      const option = document.createElement('option');
      option.value = key;
      option.textContent = meta.label;
      bucketsGroup.appendChild(option);
    });
    if (bucketsGroup.children.length > 0) {
      els.insurance.appendChild(bucketsGroup);
    }
    
    // Add insurance types section with optgroup
    if (types.length > 0) {
      const typesGroup = document.createElement('optgroup');
      typesGroup.label = 'Insurance Types'; // Static label, safe
      
      types.forEach(type => {
        const option = document.createElement('option');
        // Value format must be exactly "type:${type}" for filtering logic to work
        option.value = `type:${type}`; // Browser automatically escapes attribute values
        option.textContent = type; // textContent is safe from XSS
        typesGroup.appendChild(option);
      });
      
      els.insurance.appendChild(typesGroup);
    }
    
    // Add insurance plans section with optgroup
    if (plans.length > 0) {
      const plansGroup = document.createElement('optgroup');
      plansGroup.label = 'Insurance Plans'; // Static label, safe
      
      plans.forEach(plan => {
        const option = document.createElement('option');
        // Value format must be exactly "plan:${plan}" for filtering logic to work
        option.value = `plan:${plan}`; // Browser automatically escapes attribute values
        option.textContent = plan; // textContent is safe from XSS
        plansGroup.appendChild(option);
      });
      
      els.insurance.appendChild(plansGroup);
    }
  }
}

export { buildLocationOptions, buildSearchCities, buildInsuranceOptions };
