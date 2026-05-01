import { VENEZUELA_LOCATIONS, VENEZUELAN_STATES } from '../constants/venezuela-locations';

/**
 * Normalizes a string by removing accents, converting to lowercase, 
 * and stripping extra whitespace.
 */
export const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, ' ');
};

/**
 * Robustly detects Venezuelan state and city/municipality from an address string.
 * Handles cases where street names might conflict with state names.
 */
export const detectLocation = (address: string): { state: string | null, city: string | null } => {
  if (!address) return { state: null, city: null };

  const addressOriginal = address.toLowerCase();
  const addressLower = normalizeString(address);
  
  const foundStates: string[] = [];
  const foundCities: { city: string, state: string }[] = [];

  // 1. Identify all state candidates
  for (const state of VENEZUELAN_STATES) {
    const stateNormalized = normalizeString(state);
    const stateRegex = new RegExp(`\\b${stateNormalized}\\b`, 'i');
    if (stateRegex.test(addressLower)) {
      foundStates.push(state);
    }
  }

  // 2. Identify all city candidates
  for (const [state, cities] of Object.entries(VENEZUELA_LOCATIONS)) {
    for (const city of cities) {
      const cityNormalized = normalizeString(city);
      // We use word boundaries to avoid matching "Mara" inside "Maracaibo"
      const cityRegex = new RegExp(`\\b${cityNormalized}\\b`, 'i');
      if (cityRegex.test(addressLower)) {
        foundCities.push({ city, state });
      }
    }
  }

  // 3. Look for explicit "Estado X" pattern to prioritize
  let explicitState: string | null = null;
  const estadoMatch = addressLower.match(/estado\s+([a-z\s]+)/i);
  if (estadoMatch) {
    const candidate = normalizeString(estadoMatch[1]);
    for (const state of VENEZUELAN_STATES) {
      if (candidate.startsWith(normalizeString(state))) {
        explicitState = state;
        break;
      }
    }
  }

  // 4. Determine the best pair
  let finalState: string | null = explicitState;
  let finalCity: string | null = null;

  // Strategy A: Find a city that belongs to one of the found states (or the explicit state)
  // We prioritize the explicit state if found
  const statesToSearch = explicitState ? [explicitState, ...foundStates] : foundStates;
  
  for (const stateName of statesToSearch) {
    // Look for a city match within this specific state
    const cityMatch = foundCities.find(c => c.state === stateName);
    if (cityMatch) {
      finalState = stateName;
      finalCity = cityMatch.city;
      break;
    }
  }

  // Strategy B: If no paired city was found, but we have cities, pick the first one and its state
  if (!finalCity && foundCities.length > 0) {
    finalCity = foundCities[0].city;
    finalState = foundCities[0].state;
  }

  // Strategy C: If still no city, but we have a state candidate
  if (!finalState && foundStates.length > 0) {
    finalState = foundStates[0];
  }

  // Special Case: If we have an explicit state but no city was found yet, keep the explicit state
  if (explicitState && !finalState) {
    finalState = explicitState;
  }

  return { 
    state: finalState || null, 
    city: finalCity || null 
  };
};
