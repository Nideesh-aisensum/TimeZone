# Kiosk Configuration

Each kiosk can be configured to display only offers assigned to specific venues.

## Configuration

Add these variables to your `.env` file:

```env
# Kiosk Identification
KIOSK_ID=K1              # Unique identifier for this kiosk (for logging/tracking)
KIOSK_VENUE=Jakarta-Central  # Venue filter - only show offers assigned to this venue
```

## How It Works

1. **In Offer Builder**: When creating an offer, add venue(s) to the "Venue" field
   - Example: `["K1", "K2"]` or `["Jakarta-Central"]`
   
2. **In Kiosk**: Set `KIOSK_VENUE` in `.env` to match one of the venue values

3. **Offer Display Logic**:
   - Offers with matching venue → **Shown**
   - Offers with empty venue (global offers) → **Shown**
   - Offers with different venue → **Hidden**

## Examples

### Kiosk K1 (Jakarta Central)
```env
KIOSK_ID=K1
KIOSK_VENUE=Jakarta-Central
```

### Kiosk K2 (Bali)
```env
KIOSK_ID=K2
KIOSK_VENUE=Bali
```

### Show All Offers (No Filter)
```env
# Leave KIOSK_VENUE empty or unset
KIOSK_ID=K1
# KIOSK_VENUE=
```

## Verification

When server starts, you'll see:
```
🏪 Kiosk Config:
   ID: K1
   Venue: Jakarta-Central
```
