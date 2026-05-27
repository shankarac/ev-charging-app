let slotContext = null
let slotsData = null
let selectedSlotTime = null
let selectedSlotCount = 1
let slotIntervalMinutes = 30
let maxBookingDate = ""
let sessionUsername = ""

function defaultSlotDateString(){
    return new Date().toISOString().slice(0, 10)
}

function toDatetimeLocalFromSlot(slotTime){
    return String(slotTime || "").slice(0, 16)
}

function getSelectedSlotCount(){
    const selected = document.querySelector('input[name="slot_duration"]:checked')
    const count = Number(selected?.value || 1)
    return count === 2 ? 2 : 1
}

function getAvailableSlots(slots){
    if(!Array.isArray(slots)){
        return []
    }
    return slots.filter(function(slot){
        return slot.available
    })
}

function getPendingContext(){
    const stored = localStorage.getItem("pendingSlotPick")
    return stored ? JSON.parse(stored) : null
}

function renderSlotButtons(slots){
    const container = document.getElementById("pick_slot_times")
    if(!Array.isArray(slots) || slots.length === 0){
        container.innerHTML = `<p class="station-slot-empty">No times configured for this date.</p>`
        return
    }

    const available = getAvailableSlots(slots)
    if(available.length === 0){
        container.innerHTML = `<p class="station-slot-empty">No available times for this date. Try another date or choose a shorter duration.</p>`
        return
    }

    container.innerHTML = slots.map(function(slot){
        let slotClass = "slot-pick-button"
        if(!slot.available){
            slotClass += " unavailable"
            if(slot.booked){
                slotClass += " booked"
            }
            if(slot.past){
                slotClass += " past"
            }
        }
        else if(selectedSlotTime && selectedSlotTime === slot.time){
            slotClass += " selected"
        }

        const disabledAttr = slot.available ? "" : " disabled"
        const statusHint = slot.booked ? "Taken" : (slot.past ? "Past" : "")
        const statusMarkup = statusHint
            ? `<span class="slot-status-label">${statusHint}</span>`
            : ""
        return `<button type="button" class="${slotClass}" data-slot-time="${slot.time}"${disabledAttr}><span class="slot-time-label">${slot.label}</span>${statusMarkup}</button>`
    }).join("")
}

function updateDateSummary(){
    const dateValue = document.getElementById("pick_slot_date").value
    const summary = document.getElementById("pick_slot_date_summary")
    if(!dateValue){
        summary.innerText = "Choose a date to see available times."
        return
    }
    const availableCount = slotsData ? getAvailableSlots(slotsData.slots).length : 0
    const durationText = formatBookingDurationLabel(selectedSlotCount)
    summary.innerText = availableCount > 0
        ? `${availableCount} time${availableCount === 1 ? "" : "s"} available · ${durationText} · ${formatDateLabel(dateValue)}`
        : `No times available · ${durationText} · ${formatDateLabel(dateValue)}`
}

function formatDateLabel(dateValue){
    const parsed = new Date(`${dateValue}T12:00:00`)
    if(Number.isNaN(parsed.getTime())){
        return dateValue
    }
    return parsed.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric"
    })
}

function buildSlotPayload(slotTime){
    return {
        stationIndex: slotContext.stationIndex,
        stationKey: slotContext.stationKey,
        slotDate: document.getElementById("pick_slot_date").value,
        slotTime: slotTime,
        slot_count: selectedSlotCount
    }
}

function getBookingDefaultsFromOpener(){
    if(window.opener && !window.opener.closed){
        try{
            const chargerEl = window.opener.document.getElementById("booking_charger")
            const unitsEl = window.opener.document.getElementById("booking_units")
            const hiddenSlot = window.opener.document.getElementById("booking_slot_count_value")
            const durationEl = window.opener.document.querySelector('input[name="booking_slot_count"]:checked')
            const slotFromOpener = hiddenSlot?.value || durationEl?.value || selectedSlotCount
            return {
                chargerType: chargerEl?.value || "Fast DC",
                units: getBookingUnits(unitsEl?.value || DEFAULT_BOOKING_UNITS),
                slotCount: getBookingSlotCount(slotFromOpener)
            }
        }
        catch(error){
            console.log(error)
        }
    }
    return { chargerType: "Fast DC", units: DEFAULT_BOOKING_UNITS, slotCount: selectedSlotCount }
}

function syncOpenerSlotDuration(slotCount){
    if(!window.opener || window.opener.closed){
        return
    }
    try{
        if(typeof window.opener.setSelectedBookingSlotCount === "function"){
            window.opener.setSelectedBookingSlotCount(slotCount)
            return
        }
        const value = getBookingSlotCount(slotCount) === 2 ? "2" : "1"
        const hidden = window.opener.document.getElementById("booking_slot_count_value")
        if(hidden){
            hidden.value = value
            return
        }
        const durationRadio = window.opener.document.querySelector(
            `input[name="booking_slot_count"][value="${value}"]`
        )
        if(durationRadio){
            durationRadio.checked = true
        }
    }
    catch(error){
        console.log(error)
    }
}

function openBookingWindowDirect(payload){
    const station = slotContext.station
    const slotCount = getBookingSlotCount(payload.slot_count || selectedSlotCount)
    syncOpenerSlotDuration(slotCount)
    const defaults = getBookingDefaultsFromOpener()
    const chargerType = defaults.chargerType
    const units = normalizeChargingUnits(defaults.units, slotCount)
    const pricing = calculateUnitsBreakdown(units, chargerType, station.service_charge, slotCount)
    const bookingDraft = {
        username: sessionUsername,
        station_name: station.station_name,
        station_address: station.station_address,
        google_maps_url: station.google_maps_url,
        latitude: station.latitude,
        longitude: station.longitude,
        distance: station.distance,
        booking_time: toDatetimeLocalFromSlot(payload.slotTime),
        charger_type: chargerType,
        units: pricing.units,
        slot_count: slotCount,
        subtotal: pricing.subtotal,
        service_charge: pricing.service_charge,
        price: pricing.total
    }
    localStorage.setItem("pendingBookingDraft", JSON.stringify(bookingDraft))
    localStorage.removeItem("pendingSlotPick")

    const width = 520
    const height = 760
    const left = Math.max(0, Math.round((window.screen.width - width) / 2))
    const top = Math.max(0, Math.round((window.screen.height - height) / 2))
    const features = [
        "popup=yes",
        `width=${width}`,
        `height=${height}`,
        `left=${left}`,
        `top=${top}`,
        "resizable=yes",
        "scrollbars=yes"
    ].join(",")
    const bookingWindow = window.open("/book-slot.html", "evBookSlot", features)
    if(!bookingWindow){
        document.getElementById("pick_slot_status").innerText = "Allow pop-ups for this site to open the booking page."
        return false
    }
    return true
}

function proceedWithSlot(slotTime){
    if(!slotContext || !slotTime){
        return
    }

    selectedSlotTime = slotTime
    renderSlotButtons(slotsData ? slotsData.slots : [])

    const status = document.getElementById("pick_slot_status")
    status.className = "message checkout-status"
    status.innerText = "Opening booking page…"

    const payload = buildSlotPayload(slotTime)

    if(window.opener && !window.opener.closed){
        try{
            if(typeof window.opener.canUserBookStation === "function"){
                const allowed = window.opener.canUserBookStation(slotContext.station.station_name)
                if(!allowed.ok){
                    status.innerText = allowed.message || "You already have a booking at this station."
                    return
                }
            }
            if(typeof window.opener.applySlotSelectionFromWindow === "function"){
                window.opener.applySlotSelectionFromWindow(payload)
            }
        }
        catch(error){
            console.log(error)
        }
    }

    if(!openBookingWindowDirect(payload)){
        return
    }

    status.className = "message checkout-status success"
    status.innerText = "Booking page opened."
    window.setTimeout(closePickSlotWindow, 350)
}

async function loadSlotsForDate(dateValue){
    if(!slotContext?.station?.station_name){
        return
    }

    selectedSlotCount = getSelectedSlotCount()
    const container = document.getElementById("pick_slot_times")
    container.innerHTML = `<p class="station-slot-empty">Loading available times…</p>`
    selectedSlotTime = null
    updateDateSummary()

    const params = new URLSearchParams({
        station_name: slotContext.station.station_name,
        date: dateValue,
        slot_count: String(selectedSlotCount)
    })

    try{
        const response = await fetch(`/stations/availability?${params.toString()}`, {
            credentials: "same-origin"
        })
        if(!response.ok){
            container.innerHTML = `<p class="station-slot-empty">Could not load times. Please try again.</p>`
            slotsData = null
            updateDateSummary()
            return
        }
        slotsData = await response.json()
        renderSlotButtons(slotsData.slots)
        updateDateSummary()
    }
    catch(error){
        console.log(error)
        container.innerHTML = `<p class="station-slot-empty">Could not load times. Please try again.</p>`
        slotsData = null
        updateDateSummary()
    }
}

function renderContext(){
    slotContext = getPendingContext()
    const shell = document.getElementById("pick_slot_shell")
    const empty = document.getElementById("pick_slot_empty")
    if(!slotContext?.station){
        shell.hidden = true
        empty.hidden = false
        return
    }

    shell.hidden = false
    empty.hidden = true
    document.getElementById("pick_slot_station").innerText = slotContext.station.station_name || "EV Charging Station"
    document.getElementById("pick_slot_address").innerText = slotContext.station_address || slotContext.station.station_address || "Address unavailable"
    document.getElementById("pick_slot_distance").innerText = slotContext.station.distance || "—"

    const dateInput = document.getElementById("pick_slot_date")
    dateInput.value = slotContext.slotDate || defaultSlotDateString()
    dateInput.min = defaultSlotDateString()
    if(maxBookingDate){
        dateInput.max = maxBookingDate
    }

    const durationValue = String(slotContext.slot_count || 1) === "2" ? "2" : "1"
    const durationInput = document.querySelector(`input[name="slot_duration"][value="${durationValue}"]`)
    if(durationInput){
        durationInput.checked = true
    }
    selectedSlotCount = Number(durationValue)

    selectedSlotTime = slotContext.selectedTime || null
    loadSlotsForDate(dateInput.value)
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
        slotIntervalMinutes = bookingSlotIntervalMinutes
        document.querySelectorAll('input[name="slot_duration"]').forEach(function(input){
            const count = Number(input.value)
            const span = input.parentElement.querySelector("span")
            if(span){
                span.innerText = formatBookingDurationLabel(count)
            }
        })
        const dateInput = document.getElementById("pick_slot_date")
        if(dateInput && maxBookingDate){
            dateInput.max = maxBookingDate
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

function closePickSlotWindow(){
    window.close()
}

function wireEvents(){
    document.getElementById("pick_slot_close_btn").addEventListener("click", closePickSlotWindow)
    document.getElementById("pick_slot_empty_close").addEventListener("click", closePickSlotWindow)
    document.getElementById("pick_slot_date").addEventListener("change", function(event){
        loadSlotsForDate(event.target.value)
    })
    document.querySelectorAll('input[name="slot_duration"]').forEach(function(input){
        input.addEventListener("change", function(){
            selectedSlotCount = getSelectedSlotCount()
            const dateValue = document.getElementById("pick_slot_date").value
            if(dateValue){
                loadSlotsForDate(dateValue)
            }
        })
    })
    document.getElementById("pick_slot_times").addEventListener("click", function(event){
        const button = event.target.closest(".slot-pick-button")
        if(!button || button.disabled || button.classList.contains("unavailable")){
            return
        }
        proceedWithSlot(button.dataset.slotTime)
    })
}

window.onload = async function(){
    const sessionUser = await ensureAuthenticated()
    if(!sessionUser){
        return
    }
    sessionUsername = sessionUser.username
    wireEvents()
    await loadBookingConfig()
    renderContext()
}
