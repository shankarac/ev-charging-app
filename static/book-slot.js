let bookingDraft = null
let bookingOpenHour = 6
let bookingCloseHour = 22
let maxBookingDate = ""

function getServiceCharge(){
    return Math.max(0, Number(bookingDraft?.service_charge || 0))
}

function getDraftSlotCount(){
    return getBookingSlotCount(bookingDraft?.slot_count)
}

function getDraftUnits(){
    const unitsInput = document.getElementById("book_slot_units")
    if(unitsInput){
        return getBookingUnits(unitsInput.value)
    }
    return getBookingUnits(bookingDraft?.units)
}

function money(value){
    return `Rs ${Number(value).toFixed(2)}`
}

function getPendingDraft(){
    const stored = localStorage.getItem("pendingBookingDraft")
    return stored ? JSON.parse(stored) : null
}

function readFormPayload(){
    const chargerType = document.getElementById("book_slot_charger").value
    const units = getDraftUnits()
    const slotCount = getDraftSlotCount()
    const pricing = calculateUnitsBreakdown(units, chargerType, getServiceCharge(), slotCount)
    return {
        username: bookingDraft.username,
        station_name: bookingDraft.station_name,
        station_address: bookingDraft.station_address,
        google_maps_url: bookingDraft.google_maps_url,
        latitude: bookingDraft.latitude,
        longitude: bookingDraft.longitude,
        distance: bookingDraft.distance,
        booking_time: document.getElementById("book_slot_time").value,
        charger_type: chargerType,
        units: pricing.units,
        slot_count: slotCount,
        subtotal: pricing.subtotal,
        service_charge: pricing.service_charge,
        price: pricing.total
    }
}

function updateTotals(){
    const chargerType = document.getElementById("book_slot_charger").value
    const units = getDraftUnits()
    const slotCount = getDraftSlotCount()
    const pricing = calculateUnitsBreakdown(units, chargerType, getServiceCharge(), slotCount)
    const rateLine = document.getElementById("book_slot_rate_line")
    if(rateLine){
        rateLine.innerText = `${formatUnitsLineLabel(units, chargerType, slotCount)} · ${formatBookingDurationLabel(slotCount)}`
    }
    document.getElementById("book_slot_total").innerText = money(pricing.total)
    document.getElementById("book_slot_total_side").innerText = money(pricing.total)
    document.getElementById("book_slot_charger_label").innerText = chargerType
}

function unitsLookLikeSlotCount(units, slotCount){
    const unitCount = getBookingUnits(units)
    const slots = getBookingSlotCount(slotCount)
    return normalizeChargingUnits(unitCount, slots) !== unitCount
}

function renderDraft(){
    bookingDraft = getPendingDraft()
    const shell = document.getElementById("book_slot_shell")
    const empty = document.getElementById("book_slot_empty")
    if(!bookingDraft){
        shell.hidden = true
        empty.hidden = false
        return
    }

    bookingDraft.units = normalizeChargingUnits(
        bookingDraft.units,
        bookingDraft.slot_count
    )

    shell.hidden = false
    empty.hidden = true
    document.getElementById("book_slot_station").innerText = bookingDraft.station_name || "EV Charging Station"
    document.getElementById("book_slot_address").innerText = bookingDraft.station_address || "Address unavailable"
    document.getElementById("book_slot_distance").innerText = bookingDraft.distance || "—"
    document.getElementById("book_slot_time").value = bookingDraft.booking_time || ""
    document.getElementById("book_slot_charger").value = bookingDraft.charger_type || "Fast DC"
    const unitsInput = document.getElementById("book_slot_units")
    if(unitsInput){
        unitsInput.value = String(getBookingUnits(bookingDraft.units))
    }
    const durationEl = document.getElementById("book_slot_duration")
    if(durationEl){
        const timeLabel = typeof formatBookingTimeEnglish === "function"
            ? formatBookingTimeEnglish(
                bookingDraft.booking_time,
                bookingDraft.slot_count,
                bookingSlotIntervalMinutes
            )
            : bookingDraft.booking_time
        durationEl.innerText = `${formatBookingDurationLabel(getDraftSlotCount())} · ${timeLabel}`
    }
    updateTotals()
}

async function loadBookingConfig(){
    try{
        const response = await fetch("/stations/config", { credentials: "same-origin" })
        if(!response.ok){
            return
        }
        const data = await response.json()
        maxBookingDate = data.max_booking_date || ""
        applyBookingPricingConfig(data)
        bookingOpenHour = Number(data.booking_open_hour) || bookingOpenHour
        bookingCloseHour = Number(data.booking_close_hour) || bookingCloseHour
        const timeInput = document.getElementById("book_slot_time")
        if(timeInput && maxBookingDate){
            timeInput.max = `${maxBookingDate}T23:59`
        }
    }
    catch(error){
        console.log(error)
    }
}

async function ensureAuthenticated(){
    try{
        const response = await fetch("/auth/session", { credentials: "same-origin" })
        if(!response.ok){
            window.location.replace("/login.html")
            return null
        }
        const data = await response.json()
        if(!data.authenticated || !data.username){
            window.location.replace("/login.html")
            return null
        }
        return data
    }
    catch(error){
        window.location.replace("/login.html")
        return null
    }
}

function notifyOpenerRefresh(){
    if(!window.opener || window.opener.closed){
        return
    }
    try{
        if(typeof window.opener.refreshUserActiveBookings === "function"){
            window.opener.refreshUserActiveBookings()
        }
        if(typeof window.opener.refreshStationSlotAvailability === "function"){
            window.opener.refreshStationSlotAvailability()
        }
    }
    catch(error){
        console.log(error)
    }
}

function openCheckoutWindow(payload){
    localStorage.setItem("tempBooking", JSON.stringify(payload))
    localStorage.removeItem("pendingBookingDraft")
    window.open("/payment.html", "_blank", "noopener,noreferrer")
}

function closeBookSlotWindow(){
    window.close()
}

async function submitBooking(event){
    event.preventDefault()
    if(!bookingDraft){
        return
    }

    const status = document.getElementById("book_slot_status")
    const button = document.getElementById("book_slot_confirm_btn")
    const payload = readFormPayload()
    if(unitsLookLikeSlotCount(payload.units, payload.slot_count)){
        status.className = "message checkout-status"
        button.disabled = false
        status.innerText = "Enter charging units (e.g. 10) — not the same as time slots (2)."
        return
    }
    status.className = "message checkout-status"
    button.disabled = true
    status.innerText = "Saving your booking…"

    try{
        const response = await fetch("/book", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload)
        })
        const data = await response.json()
        button.disabled = false

        if(!data.booking_id){
            status.innerText = data.message || "Booking could not be saved."
            return
        }

        payload.booking_id = data.booking_id
        status.className = "message checkout-status success"
        status.innerText = "Booking saved. Opening checkout in a new window…"
        notifyOpenerRefresh()
        openCheckoutWindow(payload)
        window.setTimeout(closeBookSlotWindow, 700)
    }
    catch(error){
        button.disabled = false
        status.innerText = "Booking could not be saved."
        console.log(error)
    }
}

function wireEvents(){
    document.getElementById("book_slot_form").addEventListener("submit", submitBooking)
    document.getElementById("book_slot_close_btn").addEventListener("click", closeBookSlotWindow)
    document.getElementById("book_slot_empty_close").addEventListener("click", closeBookSlotWindow)
    document.getElementById("book_slot_charger").addEventListener("change", updateTotals)
    document.getElementById("book_slot_units").addEventListener("input", updateTotals)
}

window.onload = async function(){
    const sessionUser = await ensureAuthenticated()
    if(!sessionUser){
        return
    }
    wireEvents()
    await loadBookingConfig()
    renderDraft()
    if(bookingDraft && !bookingDraft.username){
        bookingDraft.username = sessionUser.username
    }
}
