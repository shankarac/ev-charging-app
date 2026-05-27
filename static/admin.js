function money(value){
    return `Rs ${Number(value || 0).toFixed(2)}`
}

function formatTime(value){
    if(!value){
        return "—"
    }
    const parsed = new Date(value)
    if(Number.isNaN(parsed.getTime())){
        return String(value).replace("T", " ")
    }
    return parsed.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    })
}

async function adminFetch(url, options){
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options
    })
    const data = await response.json().catch(function(){
        return {}
    })
    if(!response.ok){
        let detail = data.detail
        if(Array.isArray(detail)){
            detail = detail.map(function(item){
                return item.msg || String(item)
            }).join(", ")
        }
        throw new Error(detail || data.message || "Request failed")
    }
    return data
}

async function ensureAdmin(){
    const response = await fetch("/admin/session", { credentials: "same-origin" })
    if(!response.ok){
        window.location.href = "/admin/login.html?denied=1"
        return null
    }
    return response.json()
}

function activateTab(tabName){
    document.querySelectorAll(".admin-tab").forEach(function(button){
        button.classList.toggle("active", button.dataset.tab === tabName)
    })
    document.querySelectorAll(".admin-panel").forEach(function(panel){
        panel.classList.toggle("active", panel.id === `panel_${tabName}`)
    })
}

function fillConfigForm(config){
    document.getElementById("cfg_slot_limit").value = config.station_slot_limit
    document.getElementById("cfg_open_hour").value = config.booking_open_hour
    document.getElementById("cfg_close_hour").value = config.booking_close_hour
    document.getElementById("cfg_interval").value = config.booking_slot_interval_minutes
    document.getElementById("cfg_max_days").value = config.max_booking_days_ahead || config.defaults?.max_booking_days_ahead || 30
    document.getElementById("cfg_max_date").value = config.max_booking_date || ""
    document.getElementById("cfg_default_service_charge").value = config.default_service_charge ?? config.defaults?.default_service_charge ?? 20
    document.getElementById("cfg_station_service_charges").value = config.station_service_charges || "{}"
}

async function loadConfig(){
    const data = await adminFetch("/admin/stations/config")
    fillConfigForm(data)
}

function activeManagedStations(stations){
    return (stations || []).filter(function(row){
        return row.is_active === 1 || row.is_active === true
    })
}

function fillRemoveStationSelect(stations){
    const select = document.getElementById("ms_remove_pick")
    const active = activeManagedStations(stations)
    const previous = select.value
    select.innerHTML = `<option value="">— Select a station —</option>` + active.map(function(row){
        return `<option value="${row.id}">${row.station_name}</option>`
    }).join("")
    if(previous && active.some(function(row){ return String(row.id) === previous })){
        select.value = previous
    }
}

function renderManagedStationsTable(stations){
    const body = document.querySelector("#managed_stations_table tbody")
    const active = activeManagedStations(stations)
    fillRemoveStationSelect(stations)
    body.innerHTML = active.map(function(row){
        return `
            <tr>
                <td>${row.station_name}</td>
                <td>${row.station_address}</td>
                <td>${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}</td>
            </tr>`
    }).join("") || `<tr><td colspan="3">No stations yet. Use Add station above.</td></tr>`
}

async function loadManagedStations(){
    const data = await adminFetch("/admin/managed-stations")
    renderManagedStationsTable(data.stations || [])
}

async function addManagedStation(event){
    event.preventDefault()
    const status = document.getElementById("managed_station_status")
    status.className = "message"
    status.innerText = "Adding…"
    const payload = {
        station_name: document.getElementById("ms_name").value.trim(),
        station_address: document.getElementById("ms_address").value.trim(),
        city: document.getElementById("ms_city").value.trim() || null
    }
    try{
        const data = await adminFetch("/admin/managed-stations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        status.className = "message success"
        status.innerText = data.message || "Station added"
        document.getElementById("managed_station_form").reset()
        await loadManagedStations()
    }
    catch(error){
        status.innerText = error.message
    }
}

function removeSelectedStation(){
    const stationId = document.getElementById("ms_remove_pick").value
    return removeManagedStation(stationId)
}

async function removeManagedStation(stationId){
    if(!stationId){
        throw new Error("Select a station to remove.")
    }
    if(!window.confirm("Remove this station from customer search results?")){
        return
    }
    const status = document.getElementById("managed_station_status")
    status.className = "message"
    status.innerText = "Removing…"
    try{
        await adminFetch(`/admin/managed-stations/${stationId}`, { method: "DELETE" })
        status.className = "message success"
        status.innerText = "Station removed"
        document.getElementById("ms_remove_pick").value = ""
        await loadManagedStations()
    }
    catch(error){
        status.innerText = error.message
        throw error
    }
}

async function saveConfig(event){
    event.preventDefault()
    const status = document.getElementById("config_status")
    status.className = "message"
    status.innerText = "Saving…"
    try{
        const payload = {
            station_slot_limit: Number(document.getElementById("cfg_slot_limit").value),
            booking_open_hour: Number(document.getElementById("cfg_open_hour").value),
            booking_close_hour: Number(document.getElementById("cfg_close_hour").value),
            booking_slot_interval_minutes: Number(document.getElementById("cfg_interval").value),
            max_booking_days_ahead: Number(document.getElementById("cfg_max_days").value),
            default_service_charge: Number(document.getElementById("cfg_default_service_charge").value),
            station_service_charges: document.getElementById("cfg_station_service_charges").value.trim() || "{}"
        }
        const data = await adminFetch("/admin/stations/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        fillConfigForm(data.config)
        status.className = "message success"
        status.innerText = data.message || "Configuration saved"
    }
    catch(error){
        status.innerText = error.message
    }
}

function renderReportTables(summary){
    const totals = summary.totals || {}
    document.getElementById("stat_total").innerText = totals.total_bookings || 0
    document.getElementById("stat_active").innerText = totals.active_bookings || 0
    document.getElementById("stat_paid").innerText = money(totals.paid_revenue)
    document.getElementById("stat_pending").innerText = money(totals.pending_revenue)

    const stationBody = document.querySelector("#station_report_table tbody")
    stationBody.innerHTML = (summary.by_station || []).map(function(row){
        return `
            <tr>
                <td>${row.station_name}</td>
                <td>${row.total_bookings}</td>
                <td>${row.active_bookings}</td>
                <td>${money(row.total_revenue)}</td>
                <td>${money(row.paid_revenue)}</td>
            </tr>`
    }).join("") || `<tr><td colspan="5">No station data yet.</td></tr>`

    const recentBody = document.querySelector("#recent_bookings_table tbody")
    recentBody.innerHTML = (summary.recent_bookings || []).map(function(row){
        return `
            <tr>
                <td>${row.id}</td>
                <td>${row.username}</td>
                <td>${row.station_name}</td>
                <td>${formatTime(row.booking_time)}</td>
                <td>${money(row.price)}</td>
                <td>${row.status}</td>
                <td>${row.payment_status}</td>
            </tr>`
    }).join("") || `<tr><td colspan="7">No bookings yet.</td></tr>`
}

async function loadReports(){
    const summary = await adminFetch("/admin/reports/summary")
    renderReportTables(summary)
}

function renderUsersTable(users){
    const body = document.querySelector("#users_table tbody")
    body.innerHTML = users.map(function(user){
        const isAdmin = user.role === "admin"
        const action = isAdmin
            ? `<button type="button" class="outline-button" data-role="user" data-username="${user.username}">Make user</button>`
            : `<button type="button" class="search-btn" data-role="admin" data-username="${user.username}">Make admin</button>`
        return `
            <tr>
                <td>${user.username}</td>
                <td>${user.email || "—"}</td>
                <td><span class="admin-role-badge ${isAdmin ? "admin" : "user"}">${user.role}</span></td>
                <td>${formatTime(user.created_at)}</td>
                <td>${action}</td>
            </tr>`
    }).join("")
}

async function loadUsers(){
    const data = await adminFetch("/admin/users")
    renderUsersTable(data.users || [])
}

async function createAdminUser(event){
    event.preventDefault()
    const status = document.getElementById("admin_user_status")
    status.className = "message"
    status.innerText = "Saving…"
    try{
        const payload = {
            email: document.getElementById("admin_user_email").value.trim(),
            password: document.getElementById("admin_user_password").value
        }
        const data = await adminFetch("/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        status.className = "message success"
        status.innerText = data.message || "Admin saved"
        document.getElementById("admin_user_form").reset()
        await loadUsers()
    }
    catch(error){
        status.innerText = error.message
    }
}

async function updateUserRole(username, role){
    await adminFetch(`/admin/users/${encodeURIComponent(username)}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: role })
    })
    await loadUsers()
}

async function logoutAdmin(){
    await fetch("/logout", { method: "POST", credentials: "same-origin" })
    window.location.href = "/admin/login.html?logout=1"
}

document.querySelectorAll(".admin-tab").forEach(function(button){
    button.addEventListener("click", function(){
        activateTab(button.dataset.tab)
        if(button.dataset.tab === "stations"){
            loadManagedStations()
        }
        if(button.dataset.tab === "reports"){
            loadReports()
        }
        if(button.dataset.tab === "users"){
            loadUsers()
        }
    })
})

document.getElementById("config_form").addEventListener("submit", saveConfig)
document.getElementById("managed_station_form").addEventListener("submit", addManagedStation)
document.getElementById("ms_remove_btn").addEventListener("click", function(){
    removeSelectedStation().catch(function(error){
        window.alert(error.message)
    })
})
document.getElementById("admin_user_form").addEventListener("submit", createAdminUser)
document.getElementById("users_table").addEventListener("click", function(event){
    const button = event.target.closest("button[data-username]")
    if(!button){
        return
    }
    updateUserRole(button.dataset.username, button.dataset.role).catch(function(error){
        window.alert(error.message)
    })
})

ensureAdmin().then(function(){
    loadConfig()
}).catch(function(){
    window.location.href = "/admin/login.html?denied=1"
})
