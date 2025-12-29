/**
 * Currency Formatter Utility
 * Converts RB (Ribu/Thousand) values to Jt (Juta/Million) when >= 1000
 * 
 * Examples:
 * - 500 RB -> "500 RB"
 * - 1000 RB -> "1.000 Jt"
 * - 1200 RB -> "1.200 Jt"
 * - 1470 RB -> "1.470 Jt"
 * - 2000 RB -> "2.000 Jt"
 */

function formatRbValue(rbValue) {
    const numValue = parseFloat(rbValue);

    if (isNaN(numValue)) {
        return { value: rbValue.toString(), unit: 'RB' };
    }

    if (numValue >= 1000) {
        // Convert to Jt and remove trailing zeros
        // e.g., 1500 RB -> 1.5 Jt, 1000 RB -> 1 Jt, 1550 RB -> 1.55 Jt
        const jtValue = numValue / 1000;
        // Use parseFloat to remove trailing zeros from the string
        const formattedValue = parseFloat(jtValue.toFixed(3)).toString();
        return { value: formattedValue, unit: 'JT' };
    }

    return { value: numValue.toString(), unit: 'RB' };
}

/**
 * Format and update an element with RB value
 * @param {HTMLElement} valueEl - Element containing the numeric value
 * @param {HTMLElement} unitEl - Element containing the unit (RB/Jt)
 * @param {number} rbValue - The value in RB
 */
function formatAndUpdateRbDisplay(valueEl, unitEl, rbValue) {
    const formatted = formatRbValue(rbValue);
    if (valueEl) {
        valueEl.textContent = formatted.value;
    }
    if (unitEl) {
        unitEl.textContent = formatted.unit;
    }
    return formatted;
}

// Export for use in other scripts (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatRbValue, formatAndUpdateRbDisplay };
}
