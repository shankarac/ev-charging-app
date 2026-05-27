const DEFAULT_CHARGER_SLOT_RATES = {
    "AC Charger": 12,
    "Fast DC": 18,
    "Ultra Fast": 22
}

const MIN_BOOKING_UNITS = 1
const MAX_BOOKING_UNITS = 200
const DEFAULT_BOOKING_UNITS = 10
const DEFAULT_HOUR_SLOT_UNIT_RATE_MULTIPLIER = 1.5

let chargerSlotRates = { ...DEFAULT_CHARGER_SLOT_RATES }
let bookingSlotIntervalMinutes = 30
let hourSlotUnitRateMultiplier = DEFAULT_HOUR_SLOT_UNIT_RATE_MULTIPLIER

function applyBookingPricingConfig(config){
    if(!config){
        return
    }
    bookingSlotIntervalMinutes = Number(config.booking_slot_interval_minutes) || 30
    if(config.charger_slot_rates && typeof config.charger_slot_rates === "object"){
        chargerSlotRates = { ...DEFAULT_CHARGER_SLOT_RATES, ...config.charger_slot_rates }
    }
    if(config.hour_slot_unit_rate_multiplier != null){
        const multiplier = Number(config.hour_slot_unit_rate_multiplier)
        if(Number.isFinite(multiplier) && multiplier >= 1){
            hourSlotUnitRateMultiplier = multiplier
        }
    }
}

function getBookingSlotCount(value){
    return Number(value) === 2 ? 2 : 1
}

function getBookingUnits(value){
    const count = Math.round(Number(value))
    if(!Number.isFinite(count)){
        return DEFAULT_BOOKING_UNITS
    }
    return Math.max(MIN_BOOKING_UNITS, Math.min(MAX_BOOKING_UNITS, count))
}

function normalizeChargingUnits(units, slotCount){
    const count = getBookingUnits(units)
    const slots = getBookingSlotCount(slotCount != null ? slotCount : 1)
    if(slots >= 2 && count <= 2){
        return DEFAULT_BOOKING_UNITS
    }
    if(slots >= 2 && count === slots){
        return DEFAULT_BOOKING_UNITS
    }
    return count
}

function slotRateForCharger(chargerType){
    return chargerSlotRates[chargerType] || chargerSlotRates["Fast DC"]
}

function unitRateForCharger(chargerType, slotCount){
    const base = slotRateForCharger(chargerType)
    const slots = getBookingSlotCount(slotCount)
    if(slots >= 2){
        return Math.round(base * hourSlotUnitRateMultiplier * 100) / 100
    }
    return base
}

function bookingDurationMinutes(slotCount){
    const count = getBookingSlotCount(slotCount)
    return count * bookingSlotIntervalMinutes
}

function formatBookingDurationLabel(slotCount){
    const count = getBookingSlotCount(slotCount)
    const minutes = bookingDurationMinutes(count)
    if(count === 2 && minutes === 60){
        return "1 hour (2 slots)"
    }
    if(count === 2){
        return `${minutes} min (2 slots)`
    }
    return `${bookingSlotIntervalMinutes} min (1 slot)`
}

function calculateUnitsBreakdown(units, chargerType, serviceCharge, slotCount){
    const slots = getBookingSlotCount(slotCount != null ? slotCount : 1)
    const unitCount = normalizeChargingUnits(units, slots)
    const rate = unitRateForCharger(chargerType, slots)
    const subtotal = Math.round(unitCount * rate * 100) / 100
    const fee = Math.max(0, Number(serviceCharge) || 0)
    const total = Math.round((subtotal + fee) * 100) / 100
    return {
        units: unitCount,
        slot_count: slots,
        rate_per_unit: rate,
        base_rate_per_unit: unitRateForCharger(chargerType, 1),
        hour_slot_multiplier: slots >= 2 ? hourSlotUnitRateMultiplier : 1,
        subtotal: subtotal,
        service_charge: fee,
        total: total
    }
}

function calculateTimeBasedBreakdown(slotCount, chargerType, serviceCharge){
    return calculateUnitsBreakdown(slotCount, chargerType, serviceCharge, slotCount)
}

function formatUnitsLineLabel(units, chargerType, slotCount){
    const count = getBookingUnits(units)
    const slots = getBookingSlotCount(slotCount != null ? slotCount : 1)
    const rate = unitRateForCharger(chargerType, slots)
    const duration = slots >= 2 ? "1 hr rate" : "30 min rate"
    return `${count} units × Rs ${rate.toFixed(2)}/unit (${duration}) · ${chargerType}`
}

function formatChargingLineLabel(slotCount, chargerType, units){
    if(units != null){
        return formatUnitsLineLabel(units, chargerType, slotCount)
    }
    const count = getBookingSlotCount(slotCount)
    const rate = slotRateForCharger(chargerType)
    const duration = formatBookingDurationLabel(count)
    return `${duration} · ${chargerType} · Rs ${rate.toFixed(2)}/slot`
}
