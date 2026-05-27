let currentLanguage = localStorage.getItem("language") || "english"
let latestStations = []
let selectedStation = null
let visibleStationCount = 5
let currentSearch = { lat: null, lon: null, distance: 25, maxResults: 25 }
let loadingMoreStations = false
let pendingBookingRequest = false
let assistantAwaitingStationPick = false
let assistantLastSearchLabel = ""
let assistantBookingDraft = null
let assistantCostDraft = null

const assistantChargerOptions = ["AC Charger", "Fast DC", "Ultra Fast"]

let username = ""
let userActiveBookings = []
let stationSlotLimit = 5
let maxBookingDate = ""
let bookingOpenHour = 6
let bookingCloseHour = 22
let selectedBookingSlot = null
const stationSlotPickerDates = {}
const stationSlotPickerTimes = {}
const stationSlotsCache = {}
function getSelectedBookingSlotCount(){
    const hidden = document.getElementById("booking_slot_count_value")
    if(hidden){
        return getBookingSlotCount(hidden.value || 1)
    }
    const el = document.querySelector('input[name="booking_slot_count"]:checked')
    return getBookingSlotCount(el?.value || 1)
}

function setSelectedBookingSlotCount(slotCount){
    const hidden = document.getElementById("booking_slot_count_value")
    if(hidden){
        hidden.value = String(getBookingSlotCount(slotCount))
    }
    const value = getBookingSlotCount(slotCount) === 2 ? "2" : "1"
    const radio = document.querySelector(`input[name="booking_slot_count"][value="${value}"]`)
    if(radio){
        radio.checked = true
    }
}

function getSelectedBookingUnits(){
    const el = document.getElementById("booking_units")
    return getBookingUnits(el?.value || DEFAULT_BOOKING_UNITS)
}

function setBookingStatus(message){
    const el = document.getElementById("booking_status")
    if(el){
        el.innerText = message || ""
    }
}

function unitsLookLikeSlotCount(units, slotCount){
    const unitCount = getBookingUnits(units)
    const slots = getBookingSlotCount(slotCount)
    return slots >= 2 && unitCount === slots
}

function bookingUnitsValidationMessage(){
    const units = getSelectedBookingUnits()
    const slotCount = getSelectedBookingSlotCount()
    if(unitsLookLikeSlotCount(units, slotCount)){
        return "Enter charging units (e.g. 10) — not the same as time slots (2)."
    }
    return ""
}

function getStationServiceCharge(station){
    return Math.max(0, Number(station?.service_charge || 0))
}

function calculateBookingBreakdown(station, units, chargerType, slotCount){
    return calculateUnitsBreakdown(
        units,
        chargerType,
        getStationServiceCharge(station),
        slotCount != null ? slotCount : getSelectedBookingSlotCount()
    )
}

function findStationByName(stationName){
    const target = String(stationName || "").trim().toLowerCase()
    if(!target){
        return null
    }
    return latestStations.find(function(station){
        return String(station?.station_name || "").trim().toLowerCase() === target
    }) || null
}

function getBookingDisplayBreakdown(booking){
    if(!booking){
        return { total: 0, subtotal: 0, service_charge: 0, rate_per_unit: 0, units: 0, slot_count: 1 }
    }
    const displayUnits = booking.display_units != null
        ? getBookingUnits(booking.display_units)
        : normalizeChargingUnits(booking.units, booking.slot_count)

    if(booking.display_price != null && booking.rate_per_unit != null){
        return {
            subtotal: Number(booking.subtotal) || 0,
            service_charge: Number(booking.service_charge) || 0,
            rate_per_unit: Number(booking.rate_per_unit) || 0,
            total: Number(booking.display_price) || 0,
            units: displayUnits,
            slot_count: getBookingSlotCount(booking.slot_count),
        }
    }
    const station = findStationByName(booking.station_name)
    return calculateUnitsBreakdown(
        displayUnits,
        booking.charger_type || "Fast DC",
        getStationServiceCharge(station),
        booking.slot_count
    )
}

function getBookingDisplayTotal(booking){
    return getBookingDisplayBreakdown(booking).total
}

const cityCoordinates = {
    chennai: { lat: 13.0827, lon: 80.2707 },
    coimbatore: { lat: 11.0168, lon: 76.9558 },
    madurai: { lat: 9.9252, lon: 78.1198 },
    salem: { lat: 11.6643, lon: 78.1460 },
    tiruchirappalli: { lat: 10.7905, lon: 78.7047 },
    trichy: { lat: 10.7905, lon: 78.7047 },
    vellore: { lat: 12.9165, lon: 79.1325 },
    hyderabad: { lat: 17.3850, lon: 78.4867 }
}

const supportedCities = ["chennai", "coimbatore", "madurai", "salem", "tiruchirappalli", "trichy", "vellore", "hyderabad"]

const cityAliasMap = {
    chennai: [
        "chennai", "madras",
        "சென்னை", "சென்னையில்",
        "चेन्नई", "चेन्नई में", "चेन्नै",
        "ചെന്നൈ", "ചെന്നൈയിൽ",
        "చెన్నై", "చెన్నైలో",
        "ಚೆನ್ನೈ", "ಚೆನ್ನೈನಲ್ಲಿ",
        "चेन्नै", "चेन्नायाम्"
    ],
    coimbatore: [
        "coimbatore",
        "கோயம்புத்தூர்", "கோயம்புத்தூரில்",
        "कोयंबटूर", "कोयम्बटूर", "कोयंबटूर में", "कॉयंबटोर",
        "കോയമ്പത്തൂർ", "കോയമ്പത്തൂരിൽ",
        "కోయంబత్తూరు", "కోయంబత్తూర్లో",
        "ಕೋಯಮಂಬಟೂರು", "ಕೋಯಮಂಬಟೂರಿನಲ್ಲಿ",
        "कोयम्बटूर", "कोयम्बटूरे", "कोयम्बटूरम्"
    ],
    madurai: [
        "madurai",
        "மதுரை", "மதுரையில்",
        "मदुरै", "मदुरै में", "मधुरा",
        "മധുര", "മധുരയിൽ",
        "మదురై", "మదురైలో",
        "ಮದುರೈ", "ಮದುರೈನಲ್ಲಿ",
        "मधुरा", "मधुरायाम्"
    ],
    salem: [
        "salem",
        "சேலம்", "சேலத்தில்",
        "सेलम", "सेलम में", "शालम्",
        "സേലം", "സേലത്തില്",
        "సేలం", "సేలంలో",
        "ಸೇಲಂ", "ಸೇಲಂನಲ್ಲಿ",
        "शाले", "शालेम्"
    ],
    tiruchirappalli: [
        "tiruchirappalli", "trichy",
        "திருச்சிராப்பள்ளி", "திருச்சி", "திருச்சியில்",
        "तिरुचिरापल्ली", "तिरुची", "तिरुचिरापल्ली में", "तिरुच्ची",
        "തിരുച്ചിറാപ്പള്ളി", "തിരുച്ചി", "തിരുച്ചിയിൽ",
        "తిరుచి", "తిరుచిరాపల్లి", "తిరుచిలో",
        "ತಿರುಚಿರಾಪಳ್ಳಿ", "ತಿರುಚಿ", "ತಿರುಚಿನಲ್ಲಿ",
        "तिरुचिरापल्ली", "तिरुचिः", "तिरुचिरापल्ल्याम्"
    ],
    vellore: [
        "vellore",
        "வேலூர்", "வேலூரில்",
        "वेल्लोर", "वेल्लोर में",
        "വെല്ലൂർ", "വെല്ലൂരിൽ",
        "వెల్లూరు", "వెల్లూరులో",
        "ವೆಲ್ಲೋರ್", "ವೆಲ್ಲೂರಿನಲ್ಲಿ",
        "वेल्लूर", "वेल्लूरे"
    ],
    hyderabad: [
        "hyderabad",
        "ஹைதராபாத்", "ஹைதராபாதில்",
        "हैदराबाद", "हैदराबाद में",
        "ഹൈദരാബാദ്", "ഹൈദരാബാദിൽ",
        "హైదరాబాద్", "హైదరాబాద్‌లో",
        "ಹೈದರಾಬಾದ್", "ಹೈದರಾಬಾದ್‌ನಲ್ಲಿ",
        "हैदराबादम्", "हैदराबादे"
    ]
}

const ASSISTANT_STATION_WORDS = [
    "station", "stations", "charging", "charger", "chargers", "ev station", "ev charging",
    "நிலையம்", "நிலையங்கள்", "சார்ஜிங்",
    "स्टेशन", "चार्जिंग", "स्थानक", "स्थानकानि",
    "സ്റ്റേഷൻ", "ചാർജിംഗ്",
    "స్టేషన్", "చార్జింగ్",
    "ಸ್ಟೇಷನ್", "ಚಾರ್ಜಿಂಗ್"
]

const ASSISTANT_LIST_WORDS = [
    "available", "availability", "list", "show", "find", "search", "nearby", "near me", "options",
    "show station", "show stations", "show charging", "stations in", "station in",
    "காட்டு", "காட்டுங்கள்", "கிடைக்கும்", "பட்டியல்", "தேடு", "நிலையங்கள்",
    "दिखाओ", "दिखाएं", "दिखाए", "खोज", "उपलब्ध", "लिस्ट",
    "കാണിക്ക", "കാണിക്കുക", "തിരയ", "ലഭ്യ",
    "చూపించ", "చూపించు", "శోధన", "అందుబాటు",
    "ತೋರಿಸ", "ತೋರಿಸಿ", "ಹುಡುಕ", "ಪಟ್ಟಿ",
    "दर्शय", "अन्वेषय", "अन्वेष", "पश्य", "उपलब्धानि"
]

const ASSISTANT_BOOK_WORDS = [
    "book", "reserve", "booking",
    "பதிவு", "முன்பதிவு",
    "बुक", "बुकिंग", "आरक्षण", "आरक्षित", "आरक्ष",
    "ബുക്ക്", "ബുക്കിംഗ്",
    "బుక్", "బుకింగ్",
    "ಬುಕ್", "ಬುಕಿಂಗ್"
]

const ASSISTANT_MY_BOOKINGS_TERMS = [
    "show my booking", "show my bookings", "my bookings", "my booking",
    "list my bookings", "list bookings", "view my bookings", "view bookings",
    "show bookings", "see my bookings", "see bookings", "check my bookings",
    "what are my bookings", "show booking", "show booking history",
    "என் முன்பதிவு", "என் முன்பதிவுகள்", "என் முன்பதிவுகளை காட்ட", "முன்பதிவுகளை காட்ட",
    "முன்பதிவுகள் காட்ட", "முன்பதிவுகளை காட்டு", "முன்பதிவு பட்டியல்", "முன்பதிவுகள்",
    "मेरी बुकिंग", "मेरी बुकिंग्स", "मेरी बुकिंग दिखाए", "मेरी बुकिंग दिखाओ",
    "बुकिंग दिखाए", "बुकिंग दिखाओ", "बुकिंग दिखाएं", "बुकिंग सूची", "बुकिंग लिस्ट",
    "എന്റെ ബുക്കിംഗ്", "എന്റെ ബുക്കിംഗുകൾ", "ബുക്കിംഗ് കാണുക", "ബുക്കിംഗുകൾ കാണിക്കുക",
    "എന്റെ ബുക്കിംഗ് കാണിക്ക്", "ബുക്കിംഗ് പട്ടിക",
    "నా బుకింగ్స్", "నా బుకింగ్", "బుకింగ్స్ చూపు", "బుకింగ్స్ చూపించు", "నా బుకింగ్స్ చూపించు",
    "ನನ್ನ ಬುಕಿಂಗ್", "ನನ್ನ ಬುಕಿಂಗ್‌ಗಳು", "ಬುಕಿಂಗ್ ತೋರಿಸಿ", "ನನ್ನ ಬುಕಿಂಗ್ ತೋರಿಸಿ", "ಬುಕಿಂಗ್ ಪಟ್ಟಿ",
    "मम आरक्षण", "मम आरक्षणानि", "आरक्षणानि दर्शय", "मम आरक्षणानि दर्शय", "आरक्षणानि पश्य", "आरक्षणसूची"
]

const ASSISTANT_MY_BOOKINGS_POSSESSIVE = [
    "my", "mine",
    "என்", "என்னுடைய",
    "मेरी", "मेरे", "मेरा", "मम",
    "എന്റെ",
    "నా",
    "ನನ್ನ"
]

const ASSISTANT_MY_BOOKINGS_NOUNS = [
    "booking", "bookings", "reservation", "reservations",
    "முன்பதிவு", "முன்பதிவுகள்",
    "बुकिंग", "बुकिंग्स",
    "ബുക്കിംഗ്", "ബുക്കിംഗുകൾ",
    "బుకింగ్", "బుకింగ్స్",
    "ಬುಕಿಂಗ್", "ಬುಕಿಂಗ್‌ಗಳು",
    "आरक्षण", "आरक्षणानि", "आरक्षणम्"
]

const SUPPORTED_LANGUAGES = [
    { id: "english", label: "English", nativeLabel: "English" },
    { id: "tamil", label: "Tamil", nativeLabel: "தமிழ்" },
    { id: "hindi", label: "Hindi", nativeLabel: "हिन्दी" },
    { id: "telugu", label: "Telugu", nativeLabel: "తెలుగు" },
    { id: "kannada", label: "Kannada", nativeLabel: "ಕನ್ನಡ" },
    { id: "malayalam", label: "Malayalam", nativeLabel: "മലയാളം" },
    { id: "sanskrit", label: "Sanskrit", nativeLabel: "संस्कृतम्" }
]

const translations = {
    english: {
        portal: "Operations portal", navStations: "EV Charging Stations", navBookings: "Bookings", navPayments: "Payments", navAssistant: "Assistant", navProfile: "Profile",
        dashboardEyebrow: "Dashboard", dashboard: "EV Charging Station Control", dashboardSubtitle: "Find nearby EV charging stations, reserve a slot, and track every booking from one panel.",
        findStations: "Find EV Charging Stations", findStationsHelp: "Use current location, or continue with nearest available EV charging stations.", findStation: "Use Current Location",
        locationChoiceTitle: "Location access is optional", locationChoiceText: "Enable location to load realtime stations near you. Without location, search by city or pincode below.", showNearest: "Show nearest stations", clearResults: "Clear results", searchStationsHint: "Search Coimbatore or pincode 678001 above, or tap Show nearest stations.",
        searchPromptEmpty: "Search a city or pincode to load EV charging stations.",
        stationsFound: "EV charging stations found", slotLimit: "slot limit per station", activeBookings: "active bookings", seeMore: "See 5 More EV Charging Stations",
        selectedStationLabel: "Selected station", chooseStation: "Choose a station", chooseStationHelp: "1. Pick date & time on a station · 2. Tap Book Slot · 3. Confirm in the panel on the right.",
        bookingTime: "Booking time", chargingUnits: "Charging units", chargingDuration: "Slot duration", duration30: "30 min (1 slot)", duration60: "1 hour (2 slots)", unitsLabel: "units", chargerType: "Charger type", estimatedTotal: "Estimated total", confirmBooking: "Confirm Booking",
        myBookings: "My Bookings", myBookingsHelp: "Review active bookings and past booking history.", showBookings: "Refresh Bookings",
        payments: "Payments", paymentsHelp: "Preview the expected charging cost before payment.", estimatedCharge: "Estimated charge", paymentHint: "Select a station, units, and charger type to generate a booking estimate.",
        assistantTitle: "EV Assistant", assistantHelp: "Chat in your language to find stations, book, check bookings, or estimate cost.", languagesSupportedHint: "Supported languages: English, Tamil, Hindi, Telugu, Kannada, Malayalam, Sanskrit.", chatLanguageLabel: "Language", promptBook: "Book a station", promptStations: "Show available stations", promptStationsQuery: "Show stations in Coimbatore", promptBookings: "Show my bookings", promptCost: "Estimate cost", chatPlaceholder: "Type in your language, e.g. Show stations in Coimbatore", send: "Send",
        slotsBadgeAvailable: "{available}/{total} today",
        slotsBadgeFull: "No slots today",
        pickDate: "Date",
        pickTime: "Time",
        pickTimeSlot: "Pick time",
        pickDateAndTime: "Pick date & time",
        tapToChangeTime: "Tap to change time",
        slotsFree: "{count} free",
        slotsAvailableOnDate: "{count} times free · {date}",
        noSlotsOnDate: "No times available · {date}",
        bookAtYourTime: "Pick a date and time on the station card, or set your preferred time below.",
        suggestedSlots: "Suggested times",
        availableSlots: "Available",
        availableSlotsBtn: "Available slots",
        dateSlotsBtn: "Pick date & time",
        openSlotPickerWindowHint: "Opens available times in a new window.",
        slotPickerTitle: "Choose a charging time",
        slotPickerHint: "Select a date, then tap an available time.",
        slotLegendAvailable: "Available",
        slotLegendTaken: "Taken",
        slotBooked: "Taken",
        slotPast: "Past",
        slotLoading: "Loading available times…",
        slotAlreadyBooked: "That time is already booked. Please pick another.",
        stationAlreadyBookedByYou: "You already have an active booking at this station. Cancel it before booking again.",
        alreadyBooked: "Already booked",
        selectSlotFirst: "Pick a date and time on the station first.",
        openBookSlotHint: "Open booking to confirm units and pay.",
        assistantBookingReadyBookSlot: "Ready: {summary}. Tap Book Slot to confirm and pay.",
        assistantBookSlotHint: "Reply in chat with units, charger type, slot length (30 min or 1 hour), then date & time.",
        assistantMissingUnits: "First, how many charging units? (e.g. 10)",
        assistantMissingCharger: "Next, which charger type?",
        assistantMissingSlotDuration: "Next, how long do you need the charger — 30 minutes or 1 hour?",
        assistantMissingTime: "Lastly, when would you like to charge?",
        askBookingSlotDuration: "How long do you need the charger at {station}?",
        slotDurationOptionLine: "{index}. {label}",
        invalidBookingSlotDuration: "Reply 1 for 30 minutes, 2 for 1 hour — or say \"30 min\" or \"1 hour\".",
        askCostUnits: "How many charging units should I estimate for? (e.g. 10)",
        openSlotPickerFirst: "Choose a charging time first — opening the time picker for you.",
        confirmBookingHint: "Time selected — review the details and tap Confirm Booking.",
        noSlotsForDate: "No times available for this date. Try another date.",
        bookingTimeOutOfHours: "Choose a time between {open}:00 and {close}:00.",
        bookingTimeMustBeFuture: "Booking time must be in the future.",
        assistantConfirmHint: "Complete units, charger type, slot length (30 min or 1 hour), and date & time in the chat first.",
        assistantBookingReady: "Ready to book: {summary}",
        stationFull: "{station} has no free slots on the selected date.",
        stationSelected: "Selected {station} ({distance}). Tap Book Slot on the station card to continue.", stationRangeInvalid: "Please choose a station between 1 and {max}.", stationListNear: " near {area}", stationListMore: "\n\nShowing {shown} of {total}. Name another city or pincode to search again.", stationListItem: "{index}. {name} — {distance}\n   {address}", activeBookingsLabel: "Active:", pastBookingsLabel: "Past:", pastBookingsMore: "...and {count} more past booking(s).", bookingsLoadFailed: "I could not load your bookings right now. Please try again in a moment.", languageChanged: "Conversation language set to {language}. You can type in that language.", chargerOptionLine: "{index}. {type} (Rs {rate}/unit)", paymentPending: "Payment Pending", paymentPaid: "Paid",
        welcome: "Hi! Chat in English, Tamil, Hindi, Telugu, Kannada, Malayalam, or Sanskrit. I can find EV stations, book slots, and estimate cost. Try: \"Show stations in Coimbatore\".",
        assistantHelpText: "I can help you with:\n• Available stations — \"Show stations in Hyderabad\" or \"Stations near pincode 678001\"\n• Booking — \"Book 1\" then units (e.g. 10), charger type, 30 min or 1 hour, then date & time\n• Your bookings — \"Show my bookings\"\n• Cost — \"Estimate cost\" then units, charger, and slot length",
        pickStation: "Which station should I book? Reply with 1–5 or the station name. I will ask charging units, charger type, 30 min or 1 hour, then date and time.",
        askBookingUnits: "How many charging units for {station}? (e.g. 10 — this is energy units, not 30 min / 1 hour slots)",
        askBookingDuration: "How many charging units for {station}? (e.g. 10)",
        askBookingCharger: "Which charger type for {station}? Reply with 1, 2, or 3, or the name below:",
        askBookingDateTime: "When would you like to charge? Say any time that suits you (e.g. 22nd at 2:30, tomorrow 10:00, 25/05/2026 15:30). Hours: {open}:00–{close}:00.",
        bookingSuccess: "Booked successfully! {station} on {time}. Total: {price}.",
        redirectingToPayment: "Opening checkout in a new window…",
        bookingWindowTitle: "Confirm your booking",
        bookingWindowEyebrow: "New booking",
        bookingWindowLead: "Review your slot details, then confirm to open checkout in a new window.",
        cancelBookingWindow: "Cancel",
        paymentSuccess: "Payment successful!",
        invalidBookingUnits: "Please enter units between 1 and 200 (for example: 10).",
        invalidBookingDuration: "Please enter units between 1 and 200 (for example: 10).",
        invalidBookingCharger: "Reply with 1, 2, or 3 — or say AC Charger, Fast DC, or Ultra Fast.",
        invalidBookingDateTime: "Please enter a valid future date and time (e.g. 22nd at 2:30, 25/05/2026 15:45, or tomorrow 9:30 AM).",
        stationListIntro: "Here are the available EV charging stations",
        noStationsToPick: "I do not have any stations loaded yet. Tell me a city or pincode first.",
        bookedConfirm: "Booked successfully! {station} on {time}. Total: {price}. Taking you to payment now…",
        bookingFailedAssistant: "I could not complete that booking: {reason}",
        profile: "Profile", profileHelp: "Your current signed-in session.", usernameLabel: "Username", logout: "Logout",
        estTotal: "Est. total",
        pricePerUnit: "Rs {rate}/unit",
        priceUnitsLine: "{units} units · {type}",
        perUnitShort: "/unit",
        book: "Book Slot", cancel: "Cancel Booking",
        noBookings: "No active bookings yet.", loading: "Loading realtime stations...", stationsLoadFailed: "Could not load stations. Ensure the app server is running, then refresh or search by city.", noStations: "No realtime stations available.", selectedRequired: "Select a station before confirming.", saving: "Saving booking...", bookingFailed: "Unable to save booking.",
        askLocation: "Which city or pincode should I search? For example: Coimbatore or 678001.", noStationsLocation: "I could not find realtime stations near {city}. Try another city or pincode.", bookedStation: "Booked {station} in {city}. Booking time: {time}. Estimated amount: {price}.", bookingListIntro: "Here are your bookings:", noActiveBooking: "You do not have an active booking yet.", costEstimate: "Current estimate is {price} ({units} units at Rs {rate}/unit).", cancelHelp: "Say \"show my bookings\" to see reservations. To cancel one, open Bookings from the menu and use Cancel Booking.", greeting: "Hello! Ask me about available stations, booking, or your active reservations.", fallback: "I can show available stations, book a charger, list your bookings, or estimate cost. Try \"Show stations in Coimbatore\" or \"Book station 1\".", nearestShown: "Showing realtime stations from the default service area. Use See More to browse more.", detectingLocation: "Detecting your location...", locationFound: "Location found. Showing realtime stations.", locationDenied: "Location permission was not enabled. Showing realtime stations from the default service area.", noMoreStations: "Searching a wider realtime area. If none appear, no more stations are available nearby."
    },
    tamil: {
        portal: "செயல்பாட்டு தளம்", navStations: "நிலையங்கள்", navBookings: "முன்பதிவுகள்", navPayments: "கட்டணம்", navAssistant: "உதவியாளர்", navProfile: "சுயவிவரம்",
        dashboardEyebrow: "டாஷ்போர்டு", dashboard: "சார்ஜிங் நிலைய கட்டுப்பாடு", dashboardSubtitle: "அருகிலுள்ள நிலையங்களை கண்டறிந்து, ஸ்லாட் பதிவு செய்து, முன்பதிவுகளை கண்காணிக்கவும்.",
        findStations: "நிலையங்களை கண்டறி", findStationsHelp: "இடத்தை பயன்படுத்தலாம் அல்லது அருகிலுள்ள நிலையங்களை பார்க்கலாம்.", findStation: "தற்போதைய இடத்தை பயன்படுத்து",
        locationChoiceTitle: "இட அனுமதி விருப்பமானது", locationChoiceText: "அனுமதி தராவிட்டால் அருகிலுள்ள இயல்புநிலை நிலையங்களை காட்டுவோம்.", showNearest: "அருகிலுள்ள நிலையங்கள்",
        stationsFound: "நிலையங்கள்", slotLimit: "ஒவ்வொரு நிலையத்திற்கான ஸ்லாட் வரம்பு", activeBookings: "செயலில் முன்பதிவுகள்", seeMore: "மேலும் 5 நிலையங்கள்",
        selectedStationLabel: "தேர்ந்தெடுத்த நிலையம்", chooseStation: "நிலையம் தேர்வு செய்", chooseStationHelp: "தொடங்க Book Slot அழுத்தவும்.",
        bookingTime: "முன்பதிவு நேரம்", chargingUnits: "சார்ஜிங் யூனிட்கள்", chargerType: "சார்ஜர் வகை", estimatedTotal: "மதிப்பீடு", confirmBooking: "முன்பதிவு உறுதி",
        myBookings: "என் முன்பதிவுகள்", myBookingsHelp: "செயலில் உள்ள முன்பதிவுகளையும் பழைய முன்பதிவு வரலாறையும் பார்க்கவும்.", showBookings: "முன்பதிவுகளை புதுப்பி",
        payments: "கட்டணங்கள்", paymentsHelp: "கட்டண மதிப்பீட்டை பார்க்கவும்.", estimatedCharge: "மதிப்பிடப்பட்ட கட்டணம்", paymentHint: "நிலையம் மற்றும் யூனிட்கள் தேர்வு செய்யவும்.",
        assistantTitle: "EV உதவியாளர்", assistantHelp: "முன்பதிவு, நிலைய தேடல், கட்டணம், ரத்து பற்றி கேளுங்கள்.", promptBook: "நிலையம் பதிவு", promptBookings: "என் முன்பதிவுகள்", promptCost: "செலவு மதிப்பீடு", chatPlaceholder: "EV உதவியாளரிடம் கேளுங்கள்...", send: "அனுப்பு",
        bookingListIntro: "உங்கள் முன்பதிவுகள்:", noActiveBooking: "செயலில் முன்பதிவு இல்லை.", activeBookingsLabel: "செயலில்:", pastBookingsLabel: "முடிந்தவை:", pastBookingsMore: "...மேலும் {count} பழைய முன்பதிவுகள்.", bookingsLoadFailed: "முன்பதிவுகளை இப்போது ஏற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.", paymentPending: "பணம் நிலுவையில்", paymentPaid: "செலுத்தப்பட்டது",
        profile: "சுயவிவரம்", profileHelp: "உங்கள் தற்போதைய அமர்வு.", usernameLabel: "பயனர் பெயர்", logout: "வெளியேறு",
        book: "ஸ்லாட் பதிவு", cancel: "ரத்து செய்", noBookings: "செயலில் முன்பதிவுகள் இல்லை.", loading: "ஏற்றுகிறது...", noStations: "நிலையங்கள் இல்லை.", selectedRequired: "முதலில் நிலையத்தைத் தேர்வு செய்யவும்.", saving: "சேமிக்கிறது...", bookingFailed: "முன்பதிவை சேமிக்க முடியவில்லை.",
        askLocation: "EV சார்ஜிங் நிலையம் பதிவு செய்ய வேண்டிய நகரம் அல்லது இடத்தை சொல்லுங்கள்.", noStationsLocation: "{city} இல் நிலையங்கள் இல்லை.", bookedStation: "{city} இல் {station} பதிவு செய்யப்பட்டது. நேரம்: {time}. தொகை: {price}.", bookingCount: "{count} செயலில் முன்பதிவுகள் உள்ளன. Bookings புதுப்பிக்கப்பட்டது.", noActiveBooking: "செயலில் முன்பதிவு இல்லை.", costEstimate: "மதிப்பீடு {price}, ஒரு யூனிட்டுக்கு Rs {rate}.", cancelHelp: "Bookings திறந்து Cancel Booking பயன்படுத்தவும்.", greeting: "வணக்கம். நிலையம் தேட, பதிவு செய்ய, செலவு கணக்கிட உதவுகிறேன்.", welcome: "வரவேற்கிறேன். EV நிலையம் பதிவு செய்ய நகரத்தை சொல்லுங்கள்.", fallback: "நிலைய தேடல், பதிவு, ரத்து, செலவு மதிப்பீட்டில் உதவ முடியும்.", nearestShown: "அருகிலுள்ள நிலையங்கள் காட்டப்படுகின்றன. மேலும் பார்க்க See More பயன்படுத்தவும்.", detectingLocation: "உங்கள் இடம் கண்டறியப்படுகிறது...", locationFound: "இடம் கிடைத்தது. அருகிலுள்ள நிலையங்கள் காட்டப்படுகின்றன.", locationDenied: "இட அனுமதி இயங்கவில்லை. அருகிலுள்ள நிலையங்கள் காட்டப்படுகின்றன."
    },
    hindi: {
        portal: "ऑपरेशन पोर्टल", navStations: "स्टेशन", navBookings: "बुकिंग", navPayments: "भुगतान", navAssistant: "सहायक", navProfile: "प्रोफाइल",
        dashboardEyebrow: "डैशबोर्ड", dashboard: "चार्जिंग स्टेशन नियंत्रण", dashboardSubtitle: "नजदीकी स्टेशन खोजें, स्लॉट बुक करें और बुकिंग ट्रैक करें.",
        findStations: "स्टेशन खोजें", findStationsHelp: "स्थान इस्तेमाल करें या नजदीकी स्टेशन देखें.", findStation: "वर्तमान स्थान इस्तेमाल करें",
        locationChoiceTitle: "स्थान अनुमति वैकल्पिक है", locationChoiceText: "अनुमति न देने पर नजदीकी डिफॉल्ट स्टेशन दिखेंगे.", showNearest: "नजदीकी स्टेशन दिखाएं",
        stationsFound: "स्टेशन मिले", slotLimit: "प्रति स्टेशन स्लॉट सीमा", activeBookings: "सक्रिय बुकिंग", seeMore: "5 और स्टेशन देखें",
        selectedStationLabel: "चुना स्टेशन", chooseStation: "स्टेशन चुनें", chooseStationHelp: "शुरू करने के लिए Book Slot दबाएं.",
        bookingTime: "बुकिंग समय", chargingUnits: "चार्जिंग यूनिट", chargerType: "चार्जर प्रकार", estimatedTotal: "अनुमानित कुल", confirmBooking: "बुकिंग पुष्टि",
        myBookings: "मेरी बुकिंग", myBookingsHelp: "सक्रिय बुकिंग और पुराना इतिहास देखें.", showBookings: "बुकिंग रीफ्रेश करें",
        payments: "भुगतान", paymentsHelp: "भुगतान से पहले लागत देखें.", estimatedCharge: "अनुमानित शुल्क", paymentHint: "स्टेशन और यूनिट चुनें.",
        assistantTitle: "EV सहायक", assistantHelp: "बुकिंग, स्टेशन, लागत या रद्दीकरण पूछें.", promptBook: "स्टेशन बुक करें", promptBookings: "मेरी बुकिंग दिखाएं", promptCost: "लागत अनुमान", chatPlaceholder: "EV सहायक से पूछें...", send: "भेजें",
        bookingListIntro: "आपकी बुकिंग:", noActiveBooking: "आपकी कोई सक्रिय बुकिंग नहीं है.", activeBookingsLabel: "सक्रिय:", pastBookingsLabel: "पिछली:", pastBookingsMore: "...और {count} पिछली बुकिंग।", bookingsLoadFailed: "बुकिंग अभी लोड नहीं हो सकीं। फिर कोशिश करें।", paymentPending: "भुगतान लंबित", paymentPaid: "भुगतान हो गया",
        profile: "प्रोफाइल", profileHelp: "आपका वर्तमान सत्र.", usernameLabel: "यूजरनेम", logout: "लॉगआउट",
        book: "स्लॉट बुक करें", cancel: "बुकिंग रद्द करें", noBookings: "कोई सक्रिय बुकिंग नहीं.", loading: "लोड हो रहा है...", noStations: "कोई स्टेशन उपलब्ध नहीं.", selectedRequired: "पहले स्टेशन चुनें.", saving: "बुकिंग सेव हो रही है...", bookingFailed: "बुकिंग सेव नहीं हो सकी.",
        askLocation: "कृपया EV चार्जिंग स्टेशन बुक करने का शहर या स्थान बताएं.", noStationsLocation: "{city} में कोई स्टेशन उपलब्ध नहीं है.", bookedStation: "{city} में {station} बुक हो गया. समय: {time}. राशि: {price}.", bookingCount: "{count} सक्रिय बुकिंग हैं. Bookings पैनल रीफ्रेश हुआ.", noActiveBooking: "आपकी कोई सक्रिय बुकिंग नहीं है.", costEstimate: "अनुमान {price}, Rs {rate} प्रति यूनिट.", cancelHelp: "Bookings खोलें और Cancel Booking इस्तेमाल करें.", greeting: "नमस्ते. मैं स्टेशन खोज, बुकिंग और लागत अनुमान में मदद कर सकता हूं.", welcome: "स्वागत है. EV स्टेशन बुक करने के लिए शहर बताएं.", fallback: "मैं स्टेशन खोज, बुकिंग, रद्दीकरण और लागत अनुमान में मदद कर सकता हूं.", nearestShown: "नजदीकी स्टेशन दिखाए जा रहे हैं. और विकल्पों के लिए See More दबाएं."
    },
    malayalam: {
        portal: "ഓപ്പറേഷൻ പോർട്ടൽ", navStations: "സ്റ്റേഷനുകൾ", navBookings: "ബുക്കിംഗ്", navPayments: "പേയ്മെന്റ്", navAssistant: "സഹായി", navProfile: "പ്രൊഫൈൽ",
        dashboardEyebrow: "ഡാഷ്ബോർഡ്", dashboard: "ചാർജിംഗ് സ്റ്റേഷൻ നിയന്ത്രണം", dashboardSubtitle: "അടുത്തുള്ള സ്റ്റേഷനുകൾ കണ്ടെത്തി സ്ലോട്ട് ബുക്ക് ചെയ്യുക.",
        findStations: "സ്റ്റേഷനുകൾ കണ്ടെത്തുക", findStationsHelp: "സ്ഥാനം ഉപയോഗിക്കാം അല്ലെങ്കിൽ അടുത്തുള്ള സ്റ്റേഷനുകൾ കാണാം.", findStation: "നിലവിലെ സ്ഥാനം ഉപയോഗിക്കുക",
        locationChoiceTitle: "സ്ഥലാനുമതി ഐച്ഛികമാണ്", locationChoiceText: "അനുമതി ഇല്ലെങ്കിൽ അടുത്തുള്ള ഡിഫോൾട്ട് സ്റ്റേഷനുകൾ കാണിക്കും.", showNearest: "അടുത്തുള്ള സ്റ്റേഷനുകൾ",
        stationsFound: "സ്റ്റേഷനുകൾ", slotLimit: "സ്റ്റേഷൻ സ്ലോട്ട് പരിധി", activeBookings: "സജീവ ബുക്കിംഗ്", seeMore: "കൂടുതൽ 5 സ്റ്റേഷനുകൾ",
        selectedStationLabel: "തിരഞ്ഞെടുത്ത സ്റ്റേഷൻ", chooseStation: "സ്റ്റേഷൻ തിരഞ്ഞെടുക്കുക", chooseStationHelp: "തുടങ്ങാൻ Book Slot അമർത്തുക.",
        bookingTime: "ബുക്കിംഗ് സമയം", chargingUnits: "ചാർജിംഗ് യൂണിറ്റുകൾ", chargerType: "ചാർജർ തരം", estimatedTotal: "കണക്കാക്കിയ തുക", confirmBooking: "ബുക്കിംഗ് സ്ഥിരീകരിക്കുക",
        myBookings: "എന്റെ ബുക്കിംഗ്", myBookingsHelp: "സജീവ ബുക്കിംഗുകളും പഴയ ബുക്കിംഗ് ചരിത്രവും കാണുക.", showBookings: "ബുക്കിംഗ് പുതുക്കുക",
        payments: "പേയ്മെന്റ്", paymentsHelp: "ചെലവ് മുൻകൂട്ടി കാണുക.", estimatedCharge: "കണക്കാക്കിയ ചാർജ്", paymentHint: "സ്റ്റേഷൻയും യൂണിറ്റും തിരഞ്ഞെടുക്കുക.",
        assistantTitle: "EV സഹായി", assistantHelp: "ബുക്കിംഗ്, സ്റ്റേഷൻ, ചെലവ്, റദ്ദാക്കൽ ചോദിക്കുക.", promptBook: "സ്റ്റേഷൻ ബുക്ക്", promptBookings: "എന്റെ ബുക്കിംഗ് കാണുക", promptCost: "ചെലവ് കണക്ക്", chatPlaceholder: "EV സഹായിയോട് ചോദിക്കുക...", send: "അയക്കുക",
        bookingListIntro: "നിങ്ങളുടെ ബുക്കിംഗുകൾ:", noActiveBooking: "സജീവ ബുക്കിംഗ് ഇല്ല.", activeBookingsLabel: "സജീവം:", pastBookingsLabel: "കഴിഞ്ഞത്:", pastBookingsMore: "...കൂടെ {count} പഴയ ബുക്കിംഗ്.", bookingsLoadFailed: "ബുക്കിംഗ് ലോഡ് ചെയ്യാനായില്ല. വീണ്ടും ശ്രമിക്കുക.", paymentPending: "പേയ്മെന്റ് ബാക്കി", paymentPaid: "പണം നൽകി",
        profile: "പ്രൊഫൈൽ", profileHelp: "നിലവിലെ സെഷൻ.", usernameLabel: "ഉപയോക്തൃനാമം", logout: "ലോഗൗട്ട്",
        book: "സ്ലോട്ട് ബുക്ക്", cancel: "ബുക്കിംഗ് റദ്ദാക്കുക", noBookings: "സജീവ ബുക്കിംഗ് ഇല്ല.", loading: "ലോഡ് ചെയ്യുന്നു...", noStations: "സ്റ്റേഷനുകൾ ലഭ്യമല്ല.", selectedRequired: "ആദ്യം സ്റ്റേഷൻ തിരഞ്ഞെടുക്കുക.", saving: "ബുക്കിംഗ് സംരക്ഷിക്കുന്നു...", bookingFailed: "ബുക്കിംഗ് സംരക്ഷിക്കാൻ കഴിഞ്ഞില്ല.",
        askLocation: "EV ചാർജിംഗ് സ്റ്റേഷൻ ബുക്ക് ചെയ്യേണ്ട നഗരം അല്ലെങ്കിൽ സ്ഥലം പറയുക.", noStationsLocation: "{city} ൽ സ്റ്റേഷനുകൾ ലഭ്യമല്ല.", bookedStation: "{city} ൽ {station} ബുക്ക് ചെയ്തു. സമയം: {time}. തുക: {price}.", bookingCount: "{count} സജീവ ബുക്കിംഗ് ഉണ്ട്. Bookings പുതുക്കി.", noActiveBooking: "സജീവ ബുക്കിംഗ് ഇല്ല.", costEstimate: "കണക്ക് {price}, യൂണിറ്റിന് Rs {rate}.", cancelHelp: "Bookings തുറന്ന് Cancel Booking ഉപയോഗിക്കുക.", greeting: "നമസ്കാരം. സ്റ്റേഷൻ കണ്ടെത്താനും ബുക്ക് ചെയ്യാനും സഹായിക്കാം.", welcome: "സ്വാഗതം. EV സ്റ്റേഷൻ ബുക്ക് ചെയ്യാൻ നഗരം പറയുക.", fallback: "സ്റ്റേഷൻ തിരയൽ, ബുക്കിംഗ്, റദ്ദാക്കൽ, ചെലവ് കണക്കിൽ സഹായിക്കാം.", nearestShown: "അടുത്തുള്ള സ്റ്റേഷനുകൾ കാണിക്കുന്നു. കൂടുതൽ കാണാൻ See More ഉപയോഗിക്കുക."
    },
    telugu: {
        portal: "ఆపరేషన్స్ పోర్టల్", navStations: "స్టేషన్లు", navBookings: "బుకింగ్స్", navPayments: "చెల్లింపులు", navAssistant: "సహాయకుడు", navProfile: "ప్రొఫైల్",
        dashboardEyebrow: "డాష్బోర్డ్", dashboard: "చార్జింగ్ స్టేషన్ నియంత్రణ", dashboardSubtitle: "దగ్గర్లోని స్టేషన్లు కనుగొని స్లాట్ బుక్ చేయండి.",
        findStations: "స్టేషన్లు కనుగొను", findStationsHelp: "స్థానం ఉపయోగించండి లేదా దగ్గర్లోని స్టేషన్లు చూడండి.", findStation: "ప్రస్తుత స్థానం ఉపయోగించండి",
        locationChoiceTitle: "స్థాన అనుమతి ఐచ్ఛికం", locationChoiceText: "అనుమతి ఇవ్వకపోతే దగ్గర్లోని డిఫాల్ట్ స్టేషన్లు చూపిస్తాం.", showNearest: "దగ్గర్లోని స్టేషన్లు",
        stationsFound: "స్టేషన్లు", slotLimit: "స్టేషన్ స్లాట్ పరిమితి", activeBookings: "సక్రియ బుకింగ్స్", seeMore: "ఇంకా 5 స్టేషన్లు",
        selectedStationLabel: "ఎంచుకున్న స్టేషన్", chooseStation: "స్టేషన్ ఎంచుకోండి", chooseStationHelp: "ప్రారంభించడానికి Book Slot నొక్కండి.",
        bookingTime: "బుకింగ్ సమయం", chargingUnits: "చార్జింగ్ యూనిట్లు", chargerType: "చార్జర్ రకం", estimatedTotal: "అంచనా మొత్తం", confirmBooking: "బుకింగ్ నిర్ధారించు",
        myBookings: "నా బుకింగ్స్", myBookingsHelp: "సక్రియ బుకింగ్స్ మరియు పాత బుకింగ్ చరిత్రను చూడండి.", showBookings: "బుకింగ్స్ రిఫ్రెష్",
        payments: "చెల్లింపులు", paymentsHelp: "చెల్లింపుకు ముందు ఖర్చు చూడండి.", estimatedCharge: "అంచనా చార్జ్", paymentHint: "స్టేషన్ మరియు యూనిట్లు ఎంచుకోండి.",
        assistantTitle: "EV సహాయకుడు", assistantHelp: "బుకింగ్, స్టేషన్, ఖర్చు, రద్దు గురించి అడగండి.", promptBook: "స్టేషన్ బుక్", promptBookings: "నా బుకింగ్స్ చూపు", promptCost: "ఖర్చు అంచనా", chatPlaceholder: "EV సహాయకుడిని అడగండి...", send: "పంపు",
        bookingListIntro: "మీ బుకింగ్స్:", noActiveBooking: "సక్రియ బుకింగ్ లేదు.", activeBookingsLabel: "సక్రియం:", pastBookingsLabel: "గతం:", pastBookingsMore: "...మరో {count} పాత బుకింగ్స్.", bookingsLoadFailed: "బుకింగ్స్ లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.", paymentPending: "చెల్లింపు పెండింగ్", paymentPaid: "చెల్లించబడింది",
        profile: "ప్రొఫైల్", profileHelp: "ప్రస్తుత సెషన్.", usernameLabel: "వినియోగదారు పేరు", logout: "లాగౌట్",
        book: "స్లాట్ బుక్", cancel: "బుకింగ్ రద్దు", noBookings: "సక్రియ బుకింగ్ లేదు.", loading: "లోడ్ అవుతోంది...", noStations: "స్టేషన్లు అందుబాటులో లేవు.", selectedRequired: "ముందుగా స్టేషన్ ఎంచుకోండి.", saving: "బుకింగ్ సేవ్ అవుతోంది...", bookingFailed: "బుకింగ్ సేవ్ కాలేదు.",
        askLocation: "EV చార్జింగ్ స్టేషన్ బుక్ చేయాల్సిన నగరం లేదా ప్రదేశం చెప్పండి.", noStationsLocation: "{city} లో స్టేషన్లు అందుబాటులో లేవు.", bookedStation: "{city} లో {station} బుక్ అయింది. సమయం: {time}. మొత్తం: {price}.", bookingCount: "{count} సక్రియ బుకింగ్స్ ఉన్నాయి. Bookings రిఫ్రెష్ చేశాను.", noActiveBooking: "సక్రియ బుకింగ్ లేదు.", costEstimate: "అంచనా {price}, యూనిట్‌కు Rs {rate}.", cancelHelp: "Bookings తెరిచి Cancel Booking ఉపయోగించండి.", greeting: "నమస్తే. స్టేషన్ కనుగొనడం, బుకింగ్, ఖర్చు అంచనాలో సహాయం చేస్తాను.", welcome: "స్వాగతం. EV స్టేషన్ బుక్ చేయడానికి నగరం చెప్పండి.", fallback: "స్టేషన్ శోధన, బుకింగ్, రద్దు, ఖర్చు అంచనాలో సహాయం చేస్తాను.", nearestShown: "దగ్గర్లోని స్టేషన్లు చూపిస్తున్నాం. మరిన్ని చూడటానికి See More ఉపయోగించండి."
    },
    sanskrit: {
        portal: "कार्य-पोर्टल", navStations: "स्थानकानि", navBookings: "आरक्षणानि", navPayments: "भुक्तिः", navAssistant: "सहायकः", navProfile: "प्रोफाइल",
        dashboardEyebrow: "डैशबोर्ड", dashboard: "चार्जिंग स्थानक नियन्त्रणम्", dashboardSubtitle: "समीपस्थानकानि अन्विष्य आरक्षणं कुरुत.",
        findStations: "स्थानकानि अन्वेषयतु", findStationsHelp: "स्थानं प्रयोजयतु अथवा समीपस्थानकानि पश्यतु.", findStation: "वर्तमानस्थानं प्रयोजयतु",
        locationChoiceTitle: "स्थान-अनुमतिः वैकल्पिकी", locationChoiceText: "अनुमतिः न चेत् समीपस्थानकानि दर्श्यन्ते.", showNearest: "समीपस्थानकानि दर्शयतु",
        stationsFound: "स्थानकानि", slotLimit: "स्थानक-सीमा", activeBookings: "सक्रिय आरक्षणानि", seeMore: "अधिकानि 5 स्थानकानि",
        selectedStationLabel: "चितं स्थानकम्", chooseStation: "स्थानकं चिनोतु", chooseStationHelp: "आरम्भाय Book Slot नुदतु.",
        bookingTime: "आरक्षण समयः", chargingUnits: "चार्जिंग यूनिट्", chargerType: "चार्जर प्रकारः", estimatedTotal: "अनुमित मूल्यम्", confirmBooking: "आरक्षणं निश्चितम्",
        myBookings: "मम आरक्षणानि", myBookingsHelp: "सक्रिय आरक्षणानि पुरातन-इतिहासं च पश्यतु.", showBookings: "आरक्षणानि नवीकरोतु",
        payments: "भुक्तयः", paymentsHelp: "मूल्यं पूर्वं पश्यतु.", estimatedCharge: "अनुमित शुल्कम्", paymentHint: "स्थानकं यूनिट् च चिनोतु.",
        assistantTitle: "EV सहायकः", assistantHelp: "आरक्षणं, स्थानकं, मूल्यं, निरसनं पृच्छतु.", promptBook: "स्थानकं आरक्षतु", promptBookings: "मम आरक्षणानि दर्शय", promptCost: "मूल्यं गणय", chatPlaceholder: "EV सहायकं पृच्छतु...", send: "प्रेषय",
        bookingListIntro: "भवतः आरक्षणानि:", noActiveBooking: "सक्रियम् आरक्षणं नास्ति.", activeBookingsLabel: "सक्रियम्:", pastBookingsLabel: "पुरातनम्:", pastBookingsMore: "...अधिकानि {count} पुरातन-आरक्षणानि.", bookingsLoadFailed: "आरक्षणानि अधुना लोड् न शक्यन्ते.", paymentPending: "भुक्तिः प्रलम्बिता", paymentPaid: "भुक्तिः जाता",
        profile: "प्रोफाइल", profileHelp: "वर्तमान सत्रम्.", usernameLabel: "उपयोक्तृनाम", logout: "निर्गच्छतु",
        book: "स्थानं आरक्षतु", cancel: "आरक्षणं निरस्यतु", noBookings: "सक्रियम् आरक्षणं नास्ति.", loading: "आरोहति...", noStations: "स्थानकानि न उपलब्धानि.", selectedRequired: "प्रथमं स्थानकं चिनोतु.", saving: "आरक्षणं रक्ष्यते...", bookingFailed: "आरक्षणं रक्षितुं न शक्यते.",
        askLocation: "EV स्थानकस्य आरक्षणार्थं नगरं वा स्थानं वदतु.", noStationsLocation: "{city} मध्ये स्थानकानि न उपलब्धानि.", bookedStation: "{city} मध्ये {station} आरक्षितम्. समयः: {time}. मूल्यम्: {price}.", bookingCount: "{count} सक्रिय आरक्षणानि सन्ति. Bookings नवीकृतम्.", noActiveBooking: "सक्रियम् आरक्षणं नास्ति.", costEstimate: "अनुमितं {price}, प्रति यूनिट् Rs {rate}.", cancelHelp: "Bookings उद्घाट्य Cancel Booking प्रयोजयतु.", greeting: "नमस्ते. स्थानक-अन्वेषणे आरक्षणे च सहायं करोमि.", welcome: "स्वागतम्. EV स्थानकं आरक्षितुं नगरं वदतु.", fallback: "स्थानक-अन्वेषणे, आरक्षणे, निरसने, मूल्य-गणनायां सहायं करोमि.", nearestShown: "समीपस्थानकानि दर्श्यन्ते. अधिकानि द्रष्टुं See More प्रयोजयतु."
    },
    kannada: {
        portal: "ಆಪರೇಶನ್ಸ್ ಪೋರ್ಟಲ್", navStations: "ಸ್ಟೇಷನ್‌ಗಳು", navBookings: "ಬುಕಿಂಗ್‌ಗಳು", navPayments: "ಪಾವತಿಗಳು", navAssistant: "ಸಹಾಯಕ", navProfile: "ಪ್ರೊಫೈಲ್",
        dashboardEyebrow: "ಡ್ಯಾಶ್ಬೋರ್ಡ್", dashboard: "ಚಾರ್ಜಿಂಗ್ ಸ್ಟೇಷನ್ ನಿಯಂತ್ರಣ", dashboardSubtitle: "ಹತ್ತಿರದ ಸ್ಟೇಷನ್ ಹುಡುಕಿ, ಸ್ಲಾಟ್ ಬುಕ್ ಮಾಡಿ.",
        findStations: "ಸ್ಟೇಷನ್ ಹುಡುಕಿ", findStationsHelp: "ಸ್ಥಳ ಬಳಸಿ ಅಥವಾ ಹತ್ತಿರದ ಸ್ಟೇಷನ್ ನೋಡಿ.", findStation: "ಪ್ರಸ್ತುತ ಸ್ಥಳ ಬಳಸಿ",
        locationChoiceTitle: "ಸ್ಥಳ ಅನುಮತಿ ಐಚ್ಛಿಕ", locationChoiceText: "ಅನುಮತಿ ಕೊಡದಿದ್ದರೆ ಹತ್ತಿರದ ಡಿಫಾಲ್ಟ್ ಸ್ಟೇಷನ್ ತೋರಿಸುತ್ತೇವೆ.", showNearest: "ಹತ್ತಿರದ ಸ್ಟೇಷನ್‌ಗಳು",
        stationsFound: "ಸ್ಟೇಷನ್‌ಗಳು", slotLimit: "ಸ್ಟೇಷನ್ ಸ್ಲಾಟ್ ಮಿತಿ", activeBookings: "ಸಕ್ರಿಯ ಬುಕಿಂಗ್‌ಗಳು", seeMore: "ಇನ್ನೂ 5 ಸ್ಟೇಷನ್‌ಗಳು",
        selectedStationLabel: "ಆಯ್ಕೆ ಸ್ಟೇಷನ್", chooseStation: "ಸ್ಟೇಷನ್ ಆಯ್ಕೆಮಾಡಿ", chooseStationHelp: "ಪ್ರಾರಂಭಿಸಲು Book Slot ಒತ್ತಿ.",
        bookingTime: "ಬುಕಿಂಗ್ ಸಮಯ", chargingUnits: "ಚಾರ್ಜಿಂಗ್ ಯುನಿಟ್‌ಗಳು", chargerType: "ಚಾರ್ಜರ್ ಪ್ರಕಾರ", estimatedTotal: "ಅಂದಾಜು ಮೊತ್ತ", confirmBooking: "ಬುಕಿಂಗ್ ದೃಢೀಕರಿಸಿ",
        myBookings: "ನನ್ನ ಬುಕಿಂಗ್‌ಗಳು", myBookingsHelp: "ಸಕ್ರಿಯ ಬುಕಿಂಗ್‌ಗಳು ಮತ್ತು ಹಳೆಯ ಬುಕಿಂಗ್ ಇತಿಹಾಸವನ್ನು ನೋಡಿ.", showBookings: "ಬುಕಿಂಗ್ ರಿಫ್ರೆಶ್",
        payments: "ಪಾವತಿಗಳು", paymentsHelp: "ಪಾವತಿಯ ಮೊದಲು ವೆಚ್ಚ ನೋಡಿ.", estimatedCharge: "ಅಂದಾಜು ಚಾರ್ಜ್", paymentHint: "ಸ್ಟೇಷನ್ ಮತ್ತು ಯುನಿಟ್ ಆಯ್ಕೆಮಾಡಿ.",
        assistantTitle: "EV ಸಹಾಯಕ", assistantHelp: "ಬುಕಿಂಗ್, ಸ್ಟೇಷನ್, ವೆಚ್ಚ, ರದ್ದು ಬಗ್ಗೆ ಕೇಳಿ.", promptBook: "ಸ್ಟೇಷನ್ ಬುಕ್", promptBookings: "ನನ್ನ ಬುಕಿಂಗ್ ತೋರಿಸಿ", promptCost: "ವೆಚ್ಚ ಅಂದಾಜು", chatPlaceholder: "EV ಸಹಾಯಕನನ್ನು ಕೇಳಿ...", send: "ಕಳುಹಿಸಿ",
        bookingListIntro: "ನಿಮ್ಮ ಬುಕಿಂಗ್‌ಗಳು:", noActiveBooking: "ಸಕ್ರಿಯ ಬುಕಿಂಗ್ ಇಲ್ಲ.", activeBookingsLabel: "ಸಕ್ರಿಯ:", pastBookingsLabel: "ಹಳೆಯ:", pastBookingsMore: "...ಇನ್ನೂ {count} ಹಳೆಯ ಬುಕಿಂಗ್.", bookingsLoadFailed: "ಬುಕಿಂಗ್ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", paymentPending: "ಪಾವತಿ ಬಾಕಿ", paymentPaid: "ಪಾವತಿ ಆಗಿದೆ",
        profile: "ಪ್ರೊಫೈಲ್", profileHelp: "ಪ್ರಸ್ತುತ ಸೆಷನ್.", usernameLabel: "ಬಳಕೆದಾರ ಹೆಸರು", logout: "ಲಾಗೌಟ್",
        book: "ಸ್ಲಾಟ್ ಬುಕ್", cancel: "ಬುಕಿಂಗ್ ರದ್ದು", noBookings: "ಸಕ್ರಿಯ ಬುಕಿಂಗ್ ಇಲ್ಲ.", loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ...", noStations: "ಸ್ಟೇಷನ್‌ಗಳು ಲಭ್ಯವಿಲ್ಲ.", selectedRequired: "ಮೊದಲು ಸ್ಟೇಷನ್ ಆಯ್ಕೆಮಾಡಿ.", saving: "ಬುಕಿಂಗ್ ಉಳಿಸಲಾಗುತ್ತಿದೆ...", bookingFailed: "ಬುಕಿಂಗ್ ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.",
        askLocation: "EV ಚಾರ್ಜಿಂಗ್ ಸ್ಟೇಷನ್ ಬುಕ್ ಮಾಡಲು ನಗರ ಅಥವಾ ಸ್ಥಳ ಹೇಳಿ.", noStationsLocation: "{city} ನಲ್ಲಿ ಸ್ಟೇಷನ್‌ಗಳು ಲಭ್ಯವಿಲ್ಲ.", bookedStation: "{city} ನಲ್ಲಿ {station} ಬುಕ್ ಆಯಿತು. ಸಮಯ: {time}. ಮೊತ್ತ: {price}.", bookingCount: "{count} ಸಕ್ರಿಯ ಬುಕಿಂಗ್‌ಗಳಿವೆ. Bookings ರಿಫ್ರೆಶ್ ಆಗಿದೆ.", noActiveBooking: "ಸಕ್ರಿಯ ಬುಕಿಂಗ್ ಇಲ್ಲ.", costEstimate: "ಅಂದಾಜು {price}, ಪ್ರತಿ ಯುನಿಟ್ Rs {rate}.", cancelHelp: "Bookings ತೆರೆದು Cancel Booking ಬಳಸಿ.", greeting: "ನಮಸ್ಕಾರ. ಸ್ಟೇಷನ್ ಹುಡುಕಲು, ಬುಕ್ ಮಾಡಲು, ವೆಚ್ಚ ಅಂದಾಜಿಸಲು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.", welcome: "ಸ್ವಾಗತ. EV ಸ್ಟೇಷನ್ ಬುಕ್ ಮಾಡಲು ನಗರ ಹೇಳಿ.", fallback: "ಸ್ಟೇಷನ್ ಹುಡುಕಾಟ, ಬುಕಿಂಗ್, ರದ್ದು, ವೆಚ್ಚ ಅಂದಾಜಿನಲ್ಲಿ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.", nearestShown: "ಹತ್ತಿರದ ಸ್ಟೇಷನ್‌ಗಳನ್ನು ತೋರಿಸುತ್ತಿದ್ದೇವೆ. ಇನ್ನಷ್ಟು ನೋಡಲು See More ಬಳಸಿ."
    }
}

const assistantLocaleExtensions = {
    tamil: {
        languagesSupportedHint: "ஆதரவு மொழிகள்: ஆங்கிலம், தமிழ், இந்தி, தெலுங்கு, கன்னடம், மலையாளம், சமஸ்கிருதம்.", assistantHelp: "உங்கள் மொழியில் நிலையம் தேட, பதிவு செய், முன்பதிவுகள் மற்றும் செலவு குறித்து கேளுங்கள்.", chatLanguageLabel: "மொழி", chatPlaceholder: "தமிழில் கேளுங்கள், எ.கா. கோயம்புத்தூரில் நிலையங்களை காட்டு", promptStationsQuery: "கோயம்புத்தூரில் நிலையங்களை காட்டு", promptBook: "நிலையம் பதிவு", promptStations: "கிடைக்கும் நிலையங்கள்", promptBookings: "என் முன்பதிவுகள்", promptCost: "செலவு மதிப்பீடு",
        assistantHelpText: "நான் உதவ முடியும்:\n• நிலையங்கள் — \"ஹைதராபாத்தில் நிலையங்களை காட்டு\"\n• பதிவு — \"பதிவு 1\" பின்னர் யூனிட்கள், சார்ஜர், தேதி & நேரம்\n• முன்பதிவுகள் — \"என் முன்பதிவுகள்\"\n• செலவு — \"10 யூனிட் செலவு\"",
        pickStation: "எந்த நிலையத்தை பதிவு செய்ய வேண்டும்? 1-5 எண் அல்லது நிலைய பெயரை சொல்லுங்கள். பின்னர் யூனிட்கள், சார்ஜர் வகை, தேதி மற்றும் நேரம் கேட்பேன்.", askBookingUnits: "{station} க்கு எத்தனை சார்ஜிங் யூனிட்கள்? (எ.கா. 10)", askBookingCharger: "எந்த சார்ஜர் வகை?", askBookingDateTime: "முன்பதிவு தேதி மற்றும் நேரம் என்ன? (எ.கா. 21/05/2026 14:30, நாளை 10:00)", invalidBookingUnits: "1 முதல் 200 வரை யூனிட்களை உள்ளிடுங்கள் (எ.கா. 10).", invalidBookingCharger: "1, 2, அல்லது 3 என பதிலளிக்கவும் — அல்லது AC Charger, Fast DC, Ultra Fast என சொல்லுங்கள்.", invalidBookingDateTime: "சரியான தேதி மற்றும் நேரத்தை உள்ளிடுங்கள் (எ.கா. 25/05/2026 15:00 அல்லது நாளை 9:30).", stationListIntro: "கிடைக்கும் EV சார்ஜிங் நிலையங்கள்", noStationsToPick: "இன்னும் நிலையங்கள் ஏற்றப்படவில்லை. முதலில் நகரம் அல்லது பின்கோடை சொல்லுங்கள்.", bookedConfirm: "{station} — {time} — {price}. பணம் செலுத்தும் பக்கம் திறக்கப்படுகிறது...", bookingFailedAssistant: "முன்பதிவு முடிக்க முடியவில்லை: {reason}", bookingListIntro: "உங்கள் முன்பதிவுகள்:", stationSelected: "{station} தேர்வு செய்யப்பட்டது ({available}/{total} ஸ்லாட், {distance}). \"பதிவு {number}\" என சொல்லவும்.", stationRangeInvalid: "1 முதல் {max} வரை ஒரு நிலையத்தை தேர்வு செய்யுங்கள்.", stationListNear: " {area} அருகில்", stationListMore: "\n\n{shown} / {total} காட்டப்படுகின்றன. வேறு நகரம் அல்லது பின்கோடை சொல்லுங்கள்.", stationListItem: "{index}. {name} — {available}/{total} ஸ்லாட் கிடைக்கும், {distance}\n   {address}", activeBookingsLabel: "செயலில்:", pastBookingsLabel: "முடிந்தவை:", pastBookingsMore: "...மேலும் {count} பழைய முன்பதிவுகள்.", bookingsLoadFailed: "முன்பதிவுகளை இப்போது ஏற்ற முடியவில்லை. சிறிது நேரம் கழித்து முயற்சிக்கவும்.", languageChanged: "உரையாடல் மொழி {language} ஆக மாற்றப்பட்டது. அந்த மொழியில் கேளுங்கள்.", chargerOptionLine: "{index}. {type} (ஒரு யூனிட்டுக்கு Rs {rate})", paymentPending: "பணம் நிலுவையில்", paymentPaid: "செலுத்தப்பட்டது", cancelHelp: "\"என் முன்பதிவுகள்\" என சொல்லி பார்க்கவும். ரத்து செய்ய Bookings பகுதியை பயன்படுத்தவும்.", welcome: "வணக்கம்! நகரம்/பின்கோடு மூலம் EV நிலையங்களை காட்டி பதிவு செய்ய உதவுகிறேன். \"கோயம்புத்தூரில் நிலையங்களை காட்டு\" என முயற்சிக்கவும்.", greeting: "வணக்கம்! நிலையம், பதிவு, முன்பதிவு, செலவு குறித்து கேளுங்கள்.", fallback: "நிலைய தேடல், பதிவு, முன்பதிவு, செலவு மதிப்பீட்டில் உதவ முடியும்."
    },
    hindi: {
        languagesSupportedHint: "समर्थित भाषाएं: अंग्रेज़ी, तमिल, हिंदी, तेलुगु, कन्नड़, मलयालम, संस्कृत।", assistantHelp: "अपनी भाषा में स्टेशन खोजें, बुक करें, बुकिंग और लागत पूछें.", chatLanguageLabel: "भाषा", chatPlaceholder: "हिंदी में पूछें, जैसे Coimbatore में स्टेशन दिखाएं", promptStationsQuery: "कोयंबटूर में स्टेशन दिखाएं", promptBook: "स्टेशन बुक करें", promptStations: "उपलब्ध स्टेशन", promptBookings: "मेरी बुकिंग दिखाएं", promptCost: "लागत अनुमान",
        assistantHelpText: "मैं मदद कर सकता हूं:\n• स्टेशन — \"Hyderabad में स्टेशन\"\n• बुकिंग — \"बुक 1\" फिर यूनिट, चार्जर, तारीख और समय\n• बुकिंग सूची — \"मेरी बुकिंग\"\n• लागत — \"10 यूनिट की लागत\"",
        pickStation: "कौन सा स्टेशन बुक करें? 1-5 नंबर या स्टेशन का नाम बताएं। फिर यूनिट, चार्जर प्रकार, तारीख और समय पूछूंगा।", askBookingUnits: "{station} के लिए कितने चार्जिंग यूनिट? (जैसे 10)", askBookingCharger: "कौन सा चार्जर प्रकार?", askBookingDateTime: "बुकिंग की तारीख और समय क्या है? (जैसे 21/05/2026 14:30, कल 10:00)", invalidBookingUnits: "1 से 200 के बीच यूनिट दर्ज करें (जैसे 10)।", invalidBookingCharger: "1, 2, या 3 लिखें — या AC Charger, Fast DC, Ultra Fast।", invalidBookingDateTime: "सही तारीख और समय दर्ज करें (जैसे 25/05/2026 15:00 या कल 9:30)।", stationListIntro: "उपलब्ध EV चार्जिंग स्टेशन", noStationsToPick: "अभी स्टेशन लोड नहीं हैं। पहले शहर या पिनकोड बताएं।", bookedConfirm: "{station} — {time} — {price}. भुगतान पृष्ठ खोला जा रहा है...", bookingFailedAssistant: "बुकिंग पूरी नहीं हो सकी: {reason}", bookingListIntro: "आपकी बुकिंग:", stationSelected: "{station} चुना गया ({available}/{total} स्लॉट, {distance})। \"बुक {number}\" कहें।", stationRangeInvalid: "1 से {max} के बीच स्टेशन चुनें।", stationListNear: " {area} के पास", stationListMore: "\n\n{shown} / {total} दिखाए जा रहे हैं। दूसरा शहर या पिनकोड बताएं।", stationListItem: "{index}. {name} — {available}/{total} स्लॉट खाली, {distance}\n   {address}", activeBookingsLabel: "सक्रिय:", pastBookingsLabel: "पिछली:", pastBookingsMore: "...और {count} पिछली बुकिंग।", bookingsLoadFailed: "बुकिंग अभी लोड नहीं हो सकीं। थोड़ देर बाद कोशिश करें।", languageChanged: "बातचीत की भाषा {language} पर सेट की गई। उसी भाषा में लिखें।", chargerOptionLine: "{index}. {type} (Rs {rate}/यूनिट)", paymentPending: "भुगतान लंबित", paymentPaid: "भुगतान हो गया", cancelHelp: "\"मेरी बुकिंग\" कहकर देखें। रद्द करने के लिए Bookings खोलें।", welcome: "नमस्ते! मैं शहर/पिनकोड से EV स्टेशन दिखाकर बुक करने में मदद करता हूं। \"Coimbatore में स्टेशन\" आज़माएं।", greeting: "नमस्ते! स्टेशन, बुकिंग, लागत — कुछ भी पूछें।", fallback: "स्टेशन खोज, बुकिंग, लागत अनुमान में मदद कर सकता हूं।"
    },
    malayalam: {
        languagesSupportedHint: "പിന്തുണയ്ക്കുന്ന ഭാഷകൾ: ഇംഗ്ലീഷ്, തമിഴ്, ഹിന്ദി, തെലുങ്ക്, കന്നഡ, മലയാളം, സംസ്കൃതം.", assistantHelp: "നിങ്ങളുടെ ഭാഷയിൽ സ്റ്റേഷൻ, ബുക്കിംഗ്, ചെലവ് ചോദിക്കുക.", chatLanguageLabel: "ഭാഷ", chatPlaceholder: "മലയാളത്തിൽ ചോദിക്കുക, ഉദാ. Coimbatore ൽ സ്റ്റേഷനുകൾ", promptStationsQuery: "കോയമ്പത്തൂരിൽ സ്റ്റേഷനുകൾ കാണിക്കുക", promptBook: "സ്റ്റേഷൻ ബുക്ക്", promptStations: "ലഭ്യമായ സ്റ്റേഷനുകൾ", promptBookings: "എന്റെ ബുക്കിംഗ് കാണുക", promptCost: "ചെലവ് കണക്ക്",
        assistantHelpText: "സഹായിക്കാം:\n• സ്റ്റേഷനുകൾ — നഗരം/പിൻകോഡ്\n• ബുക്കിംഗ് — \"ബുക്ക് 1\" പിന്നെ യൂണിറ്റ്, ചാർജർ, തീയതി & സമയം\n• ബുക്കിംഗ് — \"എന്റെ ബുക്കിംഗ്\"\n• ചെലവ് — \"10 യൂണിറ്റ് ചെലവ്\"",
        pickStation: "ഏത് സ്റ്റേഷൻ ബുക്ക് ചെയ്യണം? 1-5 നമ്പർ അല്ലെങ്കിൽ പേര് പറയുക. പിന്നെ യൂണിറ്റ്, ചാർജർ തരം, തീയതിയും സമയവും ചോദിക്കും.", askBookingUnits: "{station} ന് എത്ര ചാർജിംഗ് യൂണിറ്റ്? (ഉദാ. 10)", askBookingCharger: "ഏത് ചാർജർ തരം?", askBookingDateTime: "ബുക്കിംഗ് തീയതിയും സമയവും എന്താണ്? (ഉദാ. 21/05/2026 14:30, നാളെ 10:00)", invalidBookingUnits: "1-200 യൂണിറ്റ് നൽകുക (ഉദാ. 10).", invalidBookingCharger: "1, 2, 3 — അല്ലെങ്കിൽ AC Charger, Fast DC, Ultra Fast.", invalidBookingDateTime: "ശരിയായ തീയതിയും സമയവും നൽകുക (ഉദാ. 25/05/2026 15:00 അല്ലെങ്കിൽ നാളെ 9:30).", stationListIntro: "ലഭ്യമായ EV ചാർജിംഗ് സ്റ്റേഷനുകൾ", noStationsToPick: "സ്റ്റേഷനുകൾ ലോഡ് ചെയ്തിട്ടില്ല. നഗരം അല്ലെങ്കിൽ പിൻകോഡ് പറയുക.", bookedConfirm: "{station} — {time} — {price}. പേയ്മെന്റ് പേജ് തുറക്കുന്നു...", bookingFailedAssistant: "ബുക്കിംഗ് പൂർത്തിയാക്കാനായില്ല: {reason}", bookingListIntro: "നിങ്ങളുടെ ബുക്കിംഗുകൾ:", stationSelected: "{station} തിരഞ്ഞു ({available}/{total} സ്ലോട്ട്, {distance}). \"ബുക്ക് {number}\" എന്ന് പറയുക.", stationRangeInvalid: "1 മുതൽ {max} വരെ സ്റ്റേഷൻ തിരഞ്ഞെടുക്കുക.", stationListNear: " {area} സമീപം", stationListMore: "\n\n{shown} / {total} കാണിക്കുന്നു. മറ്റ് നഗരം പറയുക.", stationListItem: "{index}. {name} — {available}/{total} സ്ലോട്ട്, {distance}\n   {address}", activeBookingsLabel: "സജീവം:", pastBookingsLabel: "കഴിഞ്ഞത്:", pastBookingsMore: "...കൂടെ {count} പഴയ ബുക്കിംഗ്.", bookingsLoadFailed: "ബുക്കിംഗ് ലോഡ് ചെയ്യാനായില്ല. വീണ്ടും ശ്രമിക്കുക.", languageChanged: "ഭാഷ {language} ആയി മാറ്റി. ആ ഭാഷയിൽ ടൈപ്പ് ചെയ്യുക.", chargerOptionLine: "{index}. {type} (Rs {rate}/യൂണിറ്റ്)", paymentPending: "പേയ്മെന്റ് ബാക്കി", paymentPaid: "പണം നൽകി", cancelHelp: "\"എന്റെ ബുക്കിംഗ്\" എന്ന് പറയുക. റദ്ദാക്കാൻ Bookings ഉപയോഗിക്കുക.", welcome: "നമസ്കാരം! നഗരം/പിൻകോഡ് വഴി EV സ്റ്റേഷനുകൾ കാണിച്ച് ബുക്ക് ചെയ്യാം.", greeting: "നമസ്കാരം! സ്റ്റേഷൻ, ബുക്കിംഗ്, ചെലവ് — ചോദിക്കുക.", fallback: "സ്റ്റേഷൻ തിരയൽ, ബുക്കിംഗ്, ചെലവ് കണക്കിൽ സഹായിക്കാം."
    },
    telugu: {
        languagesSupportedHint: "మద్దతు భాషలు: ఇంగ్లీష్, తమిళం, హిందీ, తెలుగు, కన్నడ, మలయాళం, సంస్కృతం.", assistantHelp: "మీ భాషలో స్టేషన్, బుకింగ్, ఖర్చు గురించి అడగండి.", chatLanguageLabel: "భాష", chatPlaceholder: "తెలుగులో అడగండి, ఉదా. Coimbatore లో స్టేషన్లు", promptStationsQuery: "కోయంబత్తూర్లో స్టేషన్లు చూపించు", promptBook: "స్టేషన్ బుక్", promptStations: "అందుబాటులో స్టేషన్లు", promptBookings: "నా బుకింగ్స్ చూపు", promptCost: "ఖర్చు అంచనా",
        assistantHelpText: "సహాయం:\n• స్టేషన్లు — నగరం/పిన్‌కోడ్\n• బుకింగ్ — \"బుక్ 1\" తర్వాత యూనిట్లు, చార్జర్, తేదీ & సమయం\n• బుకింగ్ జాబితా — \"నా బుకింగ్స్\"\n• ఖర్చు — \"10 యూనిట్ల ఖర్చు\"",
        pickStation: "ఏ స్టేషన్ బుక్ చేయాలి? 1-5 సంఖ్య లేదా పేరు చెప్పండి. తర్వాత యూనిట్లు, చార్జర్ రకం, తేదీ మరియు సమయం అడుగుతాను.", askBookingUnits: "{station} కు ఎన్ని చార్జింగ్ యూనిట్లు? (ఉదా. 10)", askBookingCharger: "ఏ చార్జర్ రకం?", askBookingDateTime: "బుకింగ్ తేదీ మరియు సమయం ఏమిటి? (ఉదా. 21/05/2026 14:30, రేపు 10:00)", invalidBookingUnits: "1 నుండి 200 యూనిట్లు నమోదు చేయండి (ఉదా. 10).", invalidBookingCharger: "1, 2, 3 — లేదా AC Charger, Fast DC, Ultra Fast.", invalidBookingDateTime: "సరైన తేదీ మరియు సమయం నమోదు చేయండి (ఉదా. 25/05/2026 15:00 లేదా రేపు 9:30).", stationListIntro: "అందుబాటులో ఉన్న EV చార్జింగ్ స్టేషన్లు", noStationsToPick: "స్టేషన్లు ఇంకా లోడ్ కాలేదు. ముందు నగరం లేదా పిన్‌కోడ్ చెప్పండి.", bookedConfirm: "{station} — {time} — {price}. చెల్లింపు పేజీ తెరుస్తున్నాం...", bookingFailedAssistant: "బుకింగ్ పూర్తి కాలేదు: {reason}", bookingListIntro: "మీ బుకింగ్స్:", stationSelected: "{station} ఎంచుకున్నారు ({available}/{total} స్లాట్లు, {distance}). \"బుక్ {number}\" అనండి.", stationRangeInvalid: "1 నుండి {max} మధ్య స్టేషన్ ఎంచుకోండి.", stationListNear: " {area} దగ్గర", stationListMore: "\n\n{shown} / {total} చూపిస్తున్నాం. వేరే నగరం చెప్పండి.", stationListItem: "{index}. {name} — {available}/{total} స్లాట్లు, {distance}\n   {address}", activeBookingsLabel: "సక్రియం:", pastBookingsLabel: "గతం:", pastBookingsMore: "...మరో {count} పాత బుకింగ్స్.", bookingsLoadFailed: "బుకింగ్స్ లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.", languageChanged: "సంభాషణ భాష {language} కు మార్చబడింది.", chargerOptionLine: "{index}. {type} (Rs {rate}/యూనిట్)", paymentPending: "చెల్లింపు పెండింగ్", paymentPaid: "చెల్లించబడింది", cancelHelp: "\"నా బుకింగ్స్\" అని చెప్పండి. రద్దు కోసం Bookings ఉపయోగించండి.", welcome: "నమస్తే! నగరం/పిన్‌కోడ్ ద్వారా EV స్టేషన్లు చూపించి బుక్ చేస్తాను.", greeting: "నమస్తే! స్టేషన్, బుకింగ్, ఖర్చు అడగండి.", fallback: "స్టేషన్ శోధన, బుకింగ్, ఖర్చు అంచనాలో సహాయం చేస్తాను."
    },
    sanskrit: {
        languagesSupportedHint: "समर्थिताः भाषाः: English, Tamil, Hindi, Telugu, Kannada, Malayalam, Sanskrit.", assistantHelp: "स्वभाषायां स्थानकं, आरक्षणं, मूल्यं पृच्छतु.", chatLanguageLabel: "भाषा", chatPlaceholder: "संस्कृते पृच्छतु, यथा Coimbatore मध्ये स्थानकानि", promptStationsQuery: "कोयम्बटूरे स्थानकानि दर्शय", promptBook: "स्थानकं आरक्षतु", promptStations: "उपलब्धानि स्थानकानि", promptBookings: "मम आरक्षणानि दर्शय", promptCost: "मूल्यानुमानम्",
        assistantHelpText: "साहाय्यम्:\n• स्थानकानि — नगरं वा पिनकोडम्\n• आरक्षणम् — \"1 आरक्षतु\" पश्चात् यूनिट्, चार्जरः, दिनाङ्कः समयः च\n• आरक्षणसूची — \"मम आरक्षणानि\"\n• मूल्यम् — \"10 यूनिट् मूल्यम्\"",
        pickStation: "किं स्थानकं आरक्षणीयम्? 1-5 संख्या वा नाम वदतु. पश्चात् यूनिट्, चार्जरः, दिनाङ्कः समयः च.", askBookingUnits: "{station} कृते कति यूनिट्? (यथा 10)", askBookingCharger: "कः चार्जरप्रकारः?", askBookingDateTime: "आरक्षणस्य दिनाङ्कः समयः च कः? (यथा 21/05/2026 14:30, श्वः 10:00)", invalidBookingUnits: "1-200 यूनिट् लिखतु.", invalidBookingCharger: "1, 2, 3 — AC Charger, Fast DC, Ultra Fast वा.", invalidBookingDateTime: "योग्यं दिनाङ्क-समयं लिखतु (यथा 25/05/2026 15:00 वा श्वः 9:30).", stationListIntro: "उपलब्धानि EV स्थानकानि", noStationsToPick: "प्रथमं नगरं वा पिनकोडं वदतु.", bookedConfirm: "{station} — {time} — {price}. भुक्तिपृष्ठं उद्घाट्यते...", bookingFailedAssistant: "आरक्षणं न समाप्तम्: {reason}", bookingListIntro: "भवतः आरक्षणानि:", stationSelected: "{station} चितम् ({available}/{total} स्लॉट, {distance}). \"आरक्ष {number}\" वदतु.", stationRangeInvalid: "1-{max} मध्ये चिनोतु.", stationListNear: " {area} समीपे", stationListMore: "\n\n{shown}/{total} दर्श्यन्ते.", stationListItem: "{index}. {name} — {available}/{total} स्लॉट, {distance}\n   {address}", activeBookingsLabel: "सक्रियम्:", pastBookingsLabel: "भूतम्:", pastBookingsMore: "...{count} अधिकानि.", bookingsLoadFailed: "आरक्षणानि लोड् न शक्यन्ते.", languageChanged: "भाषा {language} कृता.", chargerOptionLine: "{index}. {type} (Rs {rate}/यूनिट्)", paymentPending: "लम्बितम्", paymentPaid: "भुक्तम्", cancelHelp: "\"मम आरक्षणानि\" इति वदतु.", welcome: "स्वागतम्! नगरेण स्थानकानि दर्शयामि.", greeting: "नमस्ते! पृच्छतु.", fallback: "स्थानक-आरक्षण-मूल्येषु साहाय्यम्."
    },
    kannada: {
        languagesSupportedHint: "ಬೆಂಬಲಿತ ಭಾಷೆಗಳು: ಇಂಗ್ಲಿಷ್, ತಮಿಳು, ಹಿಂದಿ, ತೆಲುಗು, ಕನ್ನಡ, ಮಲಯಾಳಂ, ಸಂಸ್ಕೃತ.", assistantHelp: "ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಸ್ಟೇಷನ್, ಬುಕಿಂಗ್, ವೆಚ್ಚ ಕೇಳಿ.", chatLanguageLabel: "ಭಾಷೆ", chatPlaceholder: "ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ, ಉದಾ. Coimbatore ನಲ್ಲಿ ಸ್ಟೇಷನ್‌ಗಳು", promptStationsQuery: "ಕೋಯಮಂಬಟೂರಿನಲ್ಲಿ ಸ್ಟೇಷನ್‌ಗಳನ್ನು ತೋರಿಸಿ", promptBook: "ಸ್ಟೇಷನ್ ಬುಕ್", promptStations: "ಲಭ್ಯವಿರುವ ಸ್ಟೇಷನ್‌ಗಳು", promptBookings: "ನನ್ನ ಬುಕಿಂಗ್ ತೋರಿಸಿ", promptCost: "ವೆಚ್ಚ ಅಂದಾಜು",
        assistantHelpText: "ಸಹಾಯ:\n• ಸ್ಟೇಷನ್‌ಗಳು — ನಗರ/ಪಿನ್‌ಕೋಡ್\n• ಬುಕಿಂಗ್ — \"ಬುಕ್ 1\" ನಂತರ ಯುನಿಟ್, ಚಾರ್ಜರ್, ದಿನಾಂಕ & ಸಮಯ\n• ಬುಕಿಂಗ್ ಪಟ್ಟಿ — \"ನನ್ನ ಬುಕಿಂಗ್\"\n• ವೆಚ್ಚ — \"10 ಯುನಿಟ್ ವೆಚ್ಚ\"",
        pickStation: "ಯಾವ ಸ್ಟೇಷನ್ ಬುಕ್ ಮಾಡಬೇಕು? 1-5 ಸಂಖ್ಯೆ ಅಥವಾ ಹೆಸರು ಹೇಳಿ. ನಂತರ ಯುನಿಟ್, ಚಾರ್ಜರ್, ದಿನಾಂಕ ಮತ್ತು ಸಮಯ ಕೇಳುತ್ತೇನೆ.", askBookingUnits: "{station} ಗೆ ಎಷ್ಟು ಚಾರ್ಜಿಂಗ್ ಯುನಿಟ್? (ಉದಾ. 10)", askBookingCharger: "ಯಾವ ಚಾರ್ಜರ್ ಪ್ರಕಾರ?", askBookingDateTime: "ಬುಕಿಂಗ್ ದಿನಾಂಕ ಮತ್ತು ಸಮಯ ಯಾವುದು? (ಉದಾ. 21/05/2026 14:30, ನಾಳೆ 10:00)", invalidBookingUnits: "1-200 ಯುನಿಟ್ ನಮೂದಿಸಿ (ಉದಾ. 10).", invalidBookingCharger: "1, 2, 3 — ಅಥವಾ AC Charger, Fast DC, Ultra Fast.", invalidBookingDateTime: "ಸರಿಯಾದ ದಿನಾಂಕ ಮತ್ತು ಸಮಯ ನಮೂದಿಸಿ (ಉದಾ. 25/05/2026 15:00 ಅಥವಾ ನಾಳೆ 9:30).", stationListIntro: "ಲಭ್ಯವಿರುವ EV ಚಾರ್ಜಿಂಗ್ ಸ್ಟೇಷನ್‌ಗಳು", noStationsToPick: "ಸ್ಟೇಷನ್‌ಗಳು ಲೋಡ್ ಆಗಿಲ್ಲ. ಮೊದಲು ನಗರ ಅಥವಾ ಪಿನ್‌ಕೋಡ್ ಹೇಳಿ.", bookedConfirm: "{station} — {time} — {price}. ಪೇಮೆಂಟ್ ಪುಟ ತೆರೆಯಲಾಗುತ್ತಿದೆ...", bookingFailedAssistant: "ಬುಕಿಂಗ್ ಪೂರ್ಣಗೊಳ್ಳಲಿಲ್ಲ: {reason}", bookingListIntro: "ನಿಮ್ಮ ಬುಕಿಂಗ್‌ಗಳು:", stationSelected: "{station} ಆಯ್ಕೆ ({available}/{total} ಸ್ಲಾಟ್, {distance}). \"ಬುಕ್ {number}\" ಎಂದು ಹೇಳಿ.", stationRangeInvalid: "1-{max} ನಡುವೆ ಸ್ಟೇಷನ್ ಆಯ್ಕೆಮಾಡಿ.", stationListNear: " {area} ಹತ್ತಿರ", stationListMore: "\n\n{shown} / {total} ತೋರಿಸಲಾಗುತ್ತಿದೆ.", stationListItem: "{index}. {name} — {available}/{total} ಸ್ಲಾಟ್, {distance}\n   {address}", activeBookingsLabel: "ಸಕ್ರಿಯ:", pastBookingsLabel: "ಹಿಂದಿನ:", pastBookingsMore: "...ಇನ್ನೂ {count} ಹಿಂದಿನ ಬುಕಿಂಗ್.", bookingsLoadFailed: "ಬುಕಿಂಗ್ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", languageChanged: "ಭಾಷೆಯನ್ನು {language} ಗೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.", chargerOptionLine: "{index}. {type} (Rs {rate}/ಯುನಿಟ್)", paymentPending: "ಪೇಮೆಂಟ್ ಬಾಕಿ", paymentPaid: "ಪಾವತಿಸಲಾಗಿದೆ", cancelHelp: "\"ನನ್ನ ಬುಕಿಂಗ್\" ಎಂದು ಹೇಳಿ. ರದ್ದುಗೆ Bookings ಬಳಸಿ.", welcome: "ಸ್ವಾಗತ! ನಗರ/ಪಿನ್‌ಕೋಡ್ ಮೂಲಕ EV ಸ್ಟೇಷನ್‌ಗಳನ್ನು ತೋರಿಸುತ್ತೇನೆ.", greeting: "ನಮಸ್ಕಾರ! ಸ್ಟೇಷನ್, ಬುಕಿಂಗ್, ವೆಚ್ಚ ಕೇಳಿ.", fallback: "ಸ್ಟೇಷನ್ ಹುಡುಕಾಟ, ಬುಕಿಂಗ್, ವೆಚ್ಚ ಅಂದಾಜಿನಲ್ಲಿ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ."
    }
}

Object.keys(assistantLocaleExtensions).forEach(function(languageKey){
    Object.assign(translations[languageKey], assistantLocaleExtensions[languageKey])
})

const ASSISTANT_MY_BOOKINGS_PHRASES = (function(){
    const phrases = new Set(ASSISTANT_MY_BOOKINGS_TERMS)
    Object.keys(translations).forEach(function(languageKey){
        ["promptBookings", "myBookings"].forEach(function(key){
            const value = translations[languageKey][key]
            if(value){
                phrases.add(String(value).trim())
            }
        })
    })
    return Array.from(phrases)
})()

const languageDisplayNames = Object.fromEntries(
    SUPPORTED_LANGUAGES.map(function(entry){
        return [entry.id, `${entry.label} (${entry.nativeLabel})`]
    })
)

const icons = {
    station: '<svg viewBox="0 0 24 24"><path d="M7 3h7a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z"/><path d="M16 8h2a2 2 0 0 1 2 2v7a2 2 0 0 0 2 2"/><path d="M8 7h5v4H8Z"/></svg>',
    bookings: '<svg viewBox="0 0 24 24"><path d="M8 2v4M16 2v4M4 9h16"/><path d="M5 4h14a1 1 0 0 1 1 1v15H4V5a1 1 0 0 1 1-1Z"/></svg>',
    payments: '<svg viewBox="0 0 24 24"><path d="M4 7h16v10H4Z"/><path d="M7 11h4M15 14h2"/></svg>',
    assistant: '<svg viewBox="0 0 24 24"><path d="M12 3v3M6 8h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Z"/><path d="M8 13h.01M16 13h.01M9 17h6"/></svg>',
    profile: '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 3v18"/></svg>',
    location: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><path d="M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>',
    nearby: '<svg viewBox="0 0 24 24"><path d="M12 2 3 21l9-4 9 4-9-19Z"/></svg>',
    more: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    confirm: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/></svg>'
}

function isSupportedLanguage(language){
    return SUPPORTED_LANGUAGES.some(function(entry){
        return entry.id === language
    })
}

function normalizeCurrentLanguage(){
    if(!isSupportedLanguage(currentLanguage)){
        currentLanguage = "english"
        localStorage.setItem("language", currentLanguage)
    }
}

function populateLanguageSelect(){
    const languageSelect = document.getElementById("language")
    if(!languageSelect){
        return
    }

    languageSelect.innerHTML = SUPPORTED_LANGUAGES.map(function(entry){
        const label = `${entry.label} — ${entry.nativeLabel}`
        const selected = entry.id === currentLanguage ? " selected" : ""
        return `<option value="${entry.id}"${selected}>${label}</option>`
    }).join("")
}

function t(key, values = {}){
    let value = (translations[currentLanguage] || translations.english)[key] || translations.english[key] || key
    Object.keys(values).forEach(function(name){
        value = value.replaceAll(`{${name}}`, values[name])
    })
    return value
}

function money(value){
    return `Rs ${Number(value).toFixed(2)}`
}

function renderIcons(){
    document.querySelectorAll("[data-icon]").forEach(function(node){
        node.innerHTML = icons[node.dataset.icon] || ""
    })
}

function applyTranslations(){
    document.querySelectorAll("[data-i18n]").forEach(function(node){
        node.innerText = t(node.dataset.i18n)
    })
    document.querySelectorAll("[data-placeholder-key]").forEach(function(node){
        node.placeholder = t(node.dataset.placeholderKey)
    })
}

function changeLanguage(){
    const languageSelect = document.getElementById("language")
    if(languageSelect){
        currentLanguage = languageSelect.value
    }
    localStorage.setItem("language", currentLanguage)
    applyTranslations()
    renderStations(latestStations)
    const chatMessages = document.getElementById("chat_messages")
    if(chatMessages && chatMessages.children.length > 0){
        addChatMessage("assistant", t("languageChanged", { language: languageDisplayNames[currentLanguage] || currentLanguage }))
    }
}

function detectLanguageFromMessage(message){
    const text = String(message || "").trim()
    if(!text || /^\d{1,3}$/.test(text)){
        return null
    }
    if(/[\u0B80-\u0BFF]/.test(text)){
        return "tamil"
    }
    if(/[\u0D00-\u0D7F]/.test(text)){
        return "malayalam"
    }
    if(/[\u0C00-\u0C7F]/.test(text)){
        return "telugu"
    }
    if(/[\u0C80-\u0CFF]/.test(text)){
        return "kannada"
    }
    if(/[\u0900-\u097F]/.test(text)){
        if(
            currentLanguage === "sanskrit"
            || /\b(संस्कृत|संस्कृतम्|स्थानक|आरक्षण|अन्वेष|सहायक|नमस्ते|पृच्छ|वदतु|दर्शय)\b/.test(text)
        ){
            return "sanskrit"
        }
        return "hindi"
    }
    return null
}

function applyLanguageFromUserMessage(message){
    const detected = detectLanguageFromMessage(message)
    if(!detected || detected === currentLanguage){
        return false
    }
    currentLanguage = detected
    localStorage.setItem("language", currentLanguage)
    const languageSelect = document.getElementById("language")
    if(languageSelect){
        languageSelect.value = currentLanguage
    }
    applyTranslations()
    return true
}

function trySetLanguageFromCommand(message){
    const normalized = String(message || "").toLowerCase().trim()
    const languageCommands = [
        { phrases: ["english", "ஆங்கிலம்", "अंग्रेज़ी", "अंग्रेजी", "ഇംഗ്ലീഷ്", "ఇంగ్లీష్", "इंग्लिश", "ಇಂಗ್ಲಿಷ್"], value: "english" },
        { phrases: ["tamil", "தமிழ்", "तमिल", "തമിഴ്", "తమిళం", "ತಮಿಳು"], value: "tamil" },
        { phrases: ["hindi", "हिंदी", "हिन्दी"], value: "hindi" },
        { phrases: ["malayalam", "മലയാളം"], value: "malayalam" },
        { phrases: ["telugu", "తెలుగు"], value: "telugu" },
        { phrases: ["sanskrit", "संस्कृत", "संस्कृतम्"], value: "sanskrit" },
        { phrases: ["kannada", "ಕನ್ನಡ"], value: "kannada" },
    ]

    const wantsLanguageSwitch = /\b(language|மொழி|भाषा|ഭാഷ|భాష|ಭಾಷೆ|भाषा)\b/i.test(normalized)
        || normalized.includes("மொழியை")
        || normalized.includes("भाषा बदल")
        || normalized.startsWith("switch ")

    if(!wantsLanguageSwitch && !languageCommands.some(function(entry){
        return entry.phrases.some(function(phrase){
            return normalized === phrase || normalized.includes(` ${phrase}`) || normalized.startsWith(`${phrase} `)
        })
    })){
        return false
    }

    for(const entry of languageCommands){
        if(entry.phrases.some(function(phrase){
            return normalized.includes(phrase)
        })){
            currentLanguage = entry.value
            localStorage.setItem("language", currentLanguage)
            const languageSelect = document.getElementById("language")
            if(languageSelect){
                languageSelect.value = currentLanguage
            }
            applyTranslations()
            return true
        }
    }

    return false
}

function activateView(viewName){
    if(!viewName){
        return
    }
    document.querySelectorAll(".nav-link[data-view]").forEach(function(button){
        button.classList.toggle("active", button.dataset.view === viewName)
    })
    document.querySelectorAll(".dashboard-view").forEach(function(view){
        view.classList.toggle("active", view.id === `view_${viewName}`)
    })
    if(viewName === "bookings"){
        showBookings()
    }
}

function clearStationResults(){
    closeAllSlotPickers()
    clearStationSlotsCache()
    latestStations = []
    selectedStation = null
    visibleStationCount = 5
    currentSearch = { lat: null, lon: null, distance: 25, maxResults: 75 }
    renderStations(latestStations)
    setBookingPanelEmpty()
    setLocationStatus(t("searchPromptEmpty"))
    document.getElementById("station_count").innerText = "0"
}

async function showNearestStations(){
    const defaultLocation = cityCoordinates.coimbatore
    setLocationStatus(t("loading"))
    visibleStationCount = 5
    selectedStation = null
    await loadRealtimeStations(
        defaultLocation.lat,
        defaultLocation.lon,
        t("nearestShown")
    )
}

async function resolveLocationQuery(city, pincode){
    const params = new URLSearchParams()
    const cityQuery = (city || "").trim()
    const pincodeQuery = (pincode || "").trim()

    if(pincodeQuery){
        params.set("pincode", pincodeQuery)
    }
    else if(cityQuery){
        params.set("city", cityQuery)
    }
    else{
        return null
    }

    const response = await fetch(`/geocode?${params.toString()}`)
    if(!response.ok){
        return null
    }

    const data = await response.json()
    if(!data || typeof data.lat !== "number" || typeof data.lon !== "number"){
        return null
    }

    return data
}

function isPincodeValue(value){
    const cleaned = String(value || "").trim().replace(/\s+/g, "")
    return /^\d{4,10}$/.test(cleaned)
}

async function searchStationsByLocation(city, pincode, silent){
    const cityQuery = (city || "").trim()
    const pincodeQuery = (pincode || "").trim()

    if(!cityQuery && !pincodeQuery){
        if(!silent){
            setLocationStatus("Enter a city name or pincode to search.")
        }
        return
    }

    const searchLabel = pincodeQuery
        ? `pincode ${pincodeQuery}`
        : displayCity(cityQuery)

    try{
        if(pincodeQuery){
            const location = await resolveLocationQuery("", pincodeQuery)
            if(!location){
                latestStations = []
                if(!silent){
                    setLocationStatus(`No location found for pincode ${pincodeQuery}.`)
                    renderStations(latestStations)
                    setBookingPanelEmpty()
                }
                return
            }

            await loadRealtimeStations(
                location.lat,
                location.lon,
                `Showing realtime stations near pincode ${pincodeQuery}.`,
                silent
            )
        }
        else{
            const supportedLocation = coordinatesForCity(cityQuery.toLowerCase())
            if(supportedLocation){
                await loadRealtimeStations(
                    supportedLocation.lat,
                    supportedLocation.lon,
                    `Showing realtime stations for ${displayCity(cityQuery)}.`,
                    silent
                )
            }
            else{
                const location = await resolveLocationQuery(cityQuery, "")
                if(!location){
                    latestStations = []
                    if(!silent){
                        setLocationStatus(t("noStationsLocation", { city: cityQuery }))
                        renderStations(latestStations)
                        setBookingPanelEmpty()
                    }
                    return
                }

                await loadRealtimeStations(
                    location.lat,
                    location.lon,
                    `Showing realtime stations for ${displayCity(cityQuery)}.`,
                    silent
                )
            }
        }
    }
    catch(error){
        latestStations = []
        console.log(error)
    }

    if(latestStations.length === 0){
        latestStations = []
        visibleStationCount = 5
        selectedStation = null
        if(!silent){
            renderStations(latestStations)
            setBookingPanelEmpty()
            setLocationStatus(t("noStationsLocation", { city: searchLabel }))
        }
        return
    }

    visibleStationCount = 5
    selectedStation = null
    if(!silent){
        renderStations(latestStations)
        setBookingPanelEmpty()
        setLocationStatus(`Showing realtime stations for ${searchLabel}.`)
    }
}

async function searchStationsByCity(city){
    await searchStationsByLocation(city, "")
}

async function findStations(){
    setLocationStatus(t("detectingLocation"))
    visibleStationCount = 5
    latestStations = []
    selectedStation = null
    renderStations(latestStations)
    setBookingPanelEmpty()

    if(!navigator.geolocation){
        setLocationStatus(t("locationDenied"))
        addChatMessage("assistant", t("nearestShown"))
        return
    }

    navigator.geolocation.getCurrentPosition(
        async function(position){
            await loadRealtimeStations(
                position.coords.latitude,
                position.coords.longitude,
                t("locationFound")
            )
        },
        async function(){
            const defaultLocation = cityCoordinates.coimbatore
            await loadRealtimeStations(
                defaultLocation.lat,
                defaultLocation.lon,
                t("locationDenied")
            )
            addChatMessage("assistant", t("nearestShown"))
        },
        {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 300000
        }
    )
}

async function loadRealtimeStations(lat, lon, successMessage, silent){
    currentSearch = { lat: lat, lon: lon, distance: 50, maxResults: 25 }
    await fetchRealtimeStations(successMessage, true, true, silent)
}

async function fetchRealtimeStations(successMessage, resetVisible, resetSelection, silent){
    let fetchFailed = false
    let fetchErrorStatus = null
    const lat = Number(currentSearch.lat)
    const lon = Number(currentSearch.lon)
    if(!Number.isFinite(lat) || !Number.isFinite(lon)){
        latestStations = []
        if(!silent){
            renderStations(latestStations)
            if(resetSelection){
                setBookingPanelEmpty()
            }
            setLocationStatus(t("searchStationsHint"))
        }
        return
    }
    try{
        if(typeof calculateTimeBasedBreakdown !== "function"){
            throw new Error("Pricing script failed to load. Hard-refresh the page (Ctrl+Shift+R).")
        }

        const controller = new AbortController()
        const timeoutId = window.setTimeout(function(){
            controller.abort()
        }, 60000)
        const params = new URLSearchParams({
            lat: String(lat),
            lon: String(lon),
            distance: String(currentSearch.distance),
            max_results: String(currentSearch.maxResults)
        })
        const response = await fetch(`/stations?${params.toString()}`, {
            signal: controller.signal,
            credentials: "same-origin"
        })
        window.clearTimeout(timeoutId)
        if(!response.ok){
            fetchErrorStatus = response.status
            throw new Error(`stations ${response.status}`)
        }
        const contentType = (response.headers.get("content-type") || "").toLowerCase()
        if(!contentType.includes("application/json")){
            throw new Error("Server returned a non-JSON response. Open http://127.0.0.1:8000/dashboard.html after starting the server.")
        }
        const data = await response.json()
        latestStations = Array.isArray(data) ? data.map(normalizeRealtimeStation) : []
    }
    catch(error){
        latestStations = []
        fetchFailed = true
        console.error(error)
        if(!silent){
            const detail = error && error.name === "AbortError"
                ? "Station search timed out. Check your internet connection and try again."
                : (error && error.message ? error.message : "Could not load stations.")
            setLocationStatus(`${t("stationsLoadFailed")} ${detail}`)
        }
    }
    finally{
        if(resetVisible){
            visibleStationCount = 5
        }
        if(resetSelection){
            selectedStation = null
        }
        if(!silent){
            renderStations(latestStations)
            if(resetSelection){
                setBookingPanelEmpty()
            }
            if(latestStations.length > 0){
                setLocationStatus(successMessage)
            }
            else if(fetchFailed){
                const statusHint = fetchErrorStatus ? ` (HTTP ${fetchErrorStatus})` : ""
                setLocationStatus(t("stationsLoadFailed") + statusHint)
            }
            else{
                setLocationStatus(t("noStations"))
            }
        }
    }

    if(latestStations.length > 0){
        hydrateStationAddresses(silent)
    }
}

function stationLocationKey(station){
    return [
        station.station_name || "",
        station.latitude ?? "",
        station.longitude ?? ""
    ].join("|")
}

function needsClientAddressResolve(station){
    const address = (station.station_address || "").trim()
    if(!address || address.toLowerCase() === "address unavailable"){
        return true
    }
    if(address.toLowerCase() === (station.station_name || "").trim().toLowerCase()){
        return true
    }
    const parts = address.split(",").map(function(part){ return part.trim() }).filter(Boolean)
    if(parts.length < 5){
        return true
    }
    if(address.length < 60){
        return true
    }
    if(!/\b\d{4,6}\b/.test(address)){
        return true
    }
    return false
}

function isUnavailableAddress(address){
    const normalized = (address || "").trim().toLowerCase()
    return !normalized || normalized === "address unavailable"
}

function formatStationCardAddress(station){
    return `<strong>Address:</strong> ${displayStationAddress(station)}`
}

function estimateStationPrice(station){
    const units = getSelectedBookingUnits()
    const slotCount = getSelectedBookingSlotCount()
    const chargerType = document.getElementById("booking_charger")?.value || "Fast DC"
    return money(calculateBookingBreakdown(station, units, chargerType, slotCount).total)
}

function getStationGridPricing(station){
    const units = getSelectedBookingUnits()
    const slotCount = getSelectedBookingSlotCount()
    const chargerType = document.getElementById("booking_charger")?.value || "Fast DC"
    const breakdown = calculateBookingBreakdown(station, units, chargerType, slotCount)
    return {
        units: breakdown.units,
        slotCount: breakdown.slot_count,
        chargerType: chargerType,
        ratePerUnit: breakdown.rate_per_unit,
        total: breakdown.total
    }
}

function renderStationPriceBlock(station){
    const pricing = getStationGridPricing(station)
    return `
        <div class="station-price booking-price">
            <span class="station-price-label">${t("estTotal")}</span>
            <strong class="station-price-total">${money(pricing.total)}</strong>
            <span class="station-price-detail">${pricing.units} ${t("unitsLabel")} × Rs ${pricing.ratePerUnit.toFixed(2)}${t("perUnitShort")}${pricing.slotCount >= 2 ? " · 1 hr" : ""}</span>
            <span class="station-price-type">${pricing.chargerType}</span>
        </div>`
}

function makeStationMapsUrl(station){
    if(station?.google_maps_url){
        return station.google_maps_url
    }
    return makeGoogleMapsUrl(station)
}

function displayStationAddress(station){
    if(!isUnavailableAddress(station.station_address)){
        return station.station_address
    }
    if(station.address_loading){
        return "Loading full address..."
    }
    return station.station_address || station.station_name || "EV Charging Station"
}

async function fetchReverseAddress(latitude, longitude, stationName){
    const params = new URLSearchParams({
        lat: latitude,
        lon: longitude,
        name: stationName || ""
    })
    const response = await fetch(`/reverse-geocode?${params.toString()}`)
    if(!response.ok){
        return ""
    }
    const data = await response.json()
    return (data.address || "").trim()
}

function updateStationAddress(stationKey, address, silent){
    latestStations = latestStations.map(function(station){
        if(stationLocationKey(station) !== stationKey){
            return station
        }
        return {
            ...station,
            station_address: address,
            address_loading: false
        }
    })

    if(selectedStation && stationLocationKey(selectedStation) === stationKey){
        selectedStation = latestStations.find(function(station){
            return stationLocationKey(station) === stationKey
        }) || selectedStation
    }

    if(!silent){
        patchStationAddressOnCard(stationKey, address)
    }
}

function patchStationAddressOnCard(stationKey, address){
    const card = document.querySelector(`[data-station-key="${stationKey}"]`)
    if(!card){
        return
    }

    const addressText = card.querySelector(".station-address")
    if(addressText){
        addressText.innerHTML = `<strong>Address:</strong> ${address}`
    }
}

let addressHydrationToken = 0

async function hydrateStationAddresses(silent){
    const hydrationToken = ++addressHydrationToken
    const targets = latestStations.filter(function(station){
        return station.latitude !== null
            && station.longitude !== null
            && needsClientAddressResolve(station)
    })

    for(const station of targets){
        if(hydrationToken !== addressHydrationToken){
            return
        }

        const stationKey = stationLocationKey(station)
        latestStations = latestStations.map(function(item){
            if(stationLocationKey(item) !== stationKey){
                return item
            }
            return { ...item, address_loading: true }
        })
        if(!silent){
            patchStationAddressOnCard(stationKey, "Loading full address...")
        }

        const address = await fetchReverseAddress(station.latitude, station.longitude, station.station_name)
        if(hydrationToken !== addressHydrationToken){
            return
        }

        if(address){
            updateStationAddress(stationKey, address, silent)
        }
        else{
            latestStations = latestStations.map(function(item){
                if(stationLocationKey(item) !== stationKey){
                    return item
                }
                return { ...item, address_loading: false }
            })
            if(!silent){
                patchStationAddressOnCard(stationKey, displayStationAddress(
                    latestStations.find(function(item){
                        return stationLocationKey(item) === stationKey
                    }) || station
                ))
            }
        }

        await new Promise(function(resolve){
            setTimeout(resolve, 1100)
        })
    }
}

function normalizeRealtimeStation(station){
    const totalSlots = Number(station.total_slots ?? stationSlotLimit ?? 5)
    const bookedSlots = Number(station.booked_slots ?? 0)
    const availableSlots = station.available_slots ?? Math.max(totalSlots - bookedSlots, 0)
    return {
        city: "realtime",
        station_name: station.station_name || "EV Charging Station",
        station_address: isUnavailableAddress(station.station_address)
            ? (station.station_name || "EV Charging Station")
            : station.station_address,
        distance: station.distance || "Nearby",
        total_slots: totalSlots,
        booked_slots: bookedSlots,
        available_slots: Math.max(Number(availableSlots), 0),
        status: station.status || "Realtime source",
        is_operational: station.is_operational,
        latitude: station.latitude ?? null,
        longitude: station.longitude ?? null,
        google_maps_url: station.google_maps_url || makeGoogleMapsUrl(station),
        address_loading: false
    }
}

function stationTotalSlots(station){
    return Number(station?.total_slots ?? stationSlotLimit ?? 5)
}

function stationAvailableSlots(station){
    return Math.max(Number(station?.available_slots ?? 0), 0)
}

function formatStationSlotBadge(station){
    const total = stationTotalSlots(station)
    const available = stationAvailableSlots(station)
    if(available <= 0){
        return t("slotsBadgeFull", { total })
    }
    return t("slotsBadgeAvailable", { available, total })
}

function stationSlotBadgeClass(station){
    const available = stationAvailableSlots(station)
    if(available <= 0){
        return "station-slot-badge full"
    }
    if(available <= 1){
        return "station-slot-badge low"
    }
    return "station-slot-badge available"
}

function canBookStation(station){
    return stationAvailableSlots(station) > 0
}

function defaultSlotDateString(){
    return new Date().toISOString().slice(0, 10)
}

function getStationSlotDate(station){
    const key = stationLocationKey(station)
    return stationSlotPickerDates[key] || defaultSlotDateString()
}

function setStationSlotDate(station, dateValue){
    stationSlotPickerDates[stationLocationKey(station)] = dateValue
}

function getStationSlotTime(station){
    const key = stationLocationKey(station)
    if(stationSlotPickerTimes[key]){
        return stationSlotPickerTimes[key]
    }
    const bookingInput = document.getElementById("booking_time")
    if(bookingInput && bookingInput.value && bookingInput.value.includes("T")){
        return bookingInput.value.split("T")[1] || defaultSlotTimeString()
    }
    return defaultSlotTimeString()
}

function setStationSlotTime(station, timeValue){
    stationSlotPickerTimes[stationLocationKey(station)] = timeValue
}

function defaultSlotTimeString(){
    const next = nextConvenientBookingDate()
    return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`
}

function buildDatetimeLocalFromParts(dateValue, timeValue){
    if(!dateValue || !timeValue){
        return ""
    }
    return `${dateValue}T${timeValue}`
}

function nextConvenientBookingDate(){
    const now = new Date()
    const interval = 30
    const minutes = now.getMinutes()
    const roundedMinutes = Math.ceil((minutes + 1) / interval) * interval
    const next = new Date(now)
    next.setSeconds(0, 0)
    next.setMinutes(roundedMinutes, 0, 0)
    if(next <= now){
        next.setMinutes(next.getMinutes() + interval, 0, 0)
    }
    if(next.getHours() < bookingOpenHour){
        next.setHours(bookingOpenHour, 0, 0, 0)
    }
    if(next.getHours() >= bookingCloseHour){
        next.setDate(next.getDate() + 1)
        next.setHours(bookingOpenHour, 0, 0, 0)
    }
    return next
}

function isValidBookingTime(value){
    if(!value){
        return false
    }
    const parsed = new Date(value)
    if(Number.isNaN(parsed.getTime())){
        return false
    }
    if(parsed.getTime() <= Date.now()){
        return false
    }
    const hour = parsed.getHours()
    if(hour < bookingOpenHour || hour >= bookingCloseHour){
        return false
    }
    if(maxBookingDate){
        const maxDate = new Date(`${maxBookingDate}T23:59`)
        if(parsed.getTime() > maxDate.getTime()){
            return false
        }
    }
    return true
}

function applyStationScheduleToBooking(station){
    if(!station){
        return
    }
    if(applyFirstAvailableSlotToBooking(station)){
        return
    }
    const dateValue = getStationSlotDate(station)
    const timeValue = getStationSlotTime(station)
    const bookingValue = buildDatetimeLocalFromParts(dateValue, timeValue)
    if(!bookingValue){
        return
    }
    document.getElementById("booking_time").value = bookingValue
    selectedBookingSlot = {
        stationKey: stationLocationKey(station),
        bookingTime: bookingValue
    }
}

function stationSlotsCacheKey(station, dateValue){
    return `${stationLocationKey(station)}|${dateValue}`
}

function toDatetimeLocalFromSlot(slotTime){
    return String(slotTime || "").slice(0, 16)
}

function formatSlotLabelFromTime(slotTime){
    const value = toDatetimeLocalFromSlot(slotTime)
    if(!value){
        return ""
    }
    const parsed = new Date(value)
    if(Number.isNaN(parsed.getTime())){
        return value.replace("T", " ")
    }
    return parsed.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    })
}

function hasSelectedSlotForStation(station){
    if(!selectedBookingSlot || !station){
        return false
    }
    return selectedBookingSlot.stationKey === stationLocationKey(station)
}

async function fetchStationSlots(station, dateValue){
    const cacheKey = stationSlotsCacheKey(station, dateValue)
    if(stationSlotsCache[cacheKey]){
        return stationSlotsCache[cacheKey]
    }
    const params = new URLSearchParams({
        station_name: station.station_name,
        date: dateValue
    })
    const response = await fetch(`/stations/availability?${params.toString()}`)
    if(!response.ok){
        return null
    }
    const data = await response.json()
    stationSlotsCache[cacheKey] = data
    return data
}

function getAvailableSlotsFromList(slots){
    if(!Array.isArray(slots)){
        return []
    }
    return slots.filter(function(slot){
        return slot.available
    })
}

function normalizeSlotTimeKey(value){
    return toDatetimeLocalFromSlot(value)
}

function findSlotInAvailability(slots, bookingTimeValue){
    const target = normalizeSlotTimeKey(bookingTimeValue)
    if(!Array.isArray(slots) || !target){
        return null
    }
    return slots.find(function(slot){
        return normalizeSlotTimeKey(slot.time) === target
    }) || null
}

function isSlotAvailableInCache(station, bookingTimeValue){
    const localValue = normalizeSlotTimeKey(bookingTimeValue)
    if(!station || !localValue){
        return false
    }
    const dateValue = localValue.split("T")[0]
    const cached = stationSlotsCache[stationSlotsCacheKey(station, dateValue)]
    if(!cached || !Array.isArray(cached.slots)){
        return null
    }
    const slot = findSlotInAvailability(cached.slots, localValue)
    if(!slot){
        return false
    }
    return Boolean(slot.available)
}

async function isBookingSlotAvailable(station, bookingTimeValue){
    const localValue = normalizeSlotTimeKey(bookingTimeValue)
    if(!station || !localValue){
        return false
    }
    const cachedResult = isSlotAvailableInCache(station, localValue)
    if(cachedResult === false){
        return false
    }

    const dateValue = localValue.split("T")[0]
    const data = await fetchStationSlots(station, dateValue)
    if(!data || !Array.isArray(data.slots)){
        return cachedResult
    }
    const slot = findSlotInAvailability(data.slots, localValue)
    if(!slot){
        return false
    }
    return Boolean(slot.available)
}

function applyFirstAvailableSlotToBooking(station){
    if(!station){
        return false
    }
    const dateValue = getStationSlotDate(station)
    const cached = stationSlotsCache[stationSlotsCacheKey(station, dateValue)]
    if(!cached || !Array.isArray(cached.slots)){
        return false
    }
    const firstAvailable = getAvailableSlotsFromList(cached.slots)[0]
    if(!firstAvailable){
        return false
    }

    const localValue = toDatetimeLocalFromSlot(firstAvailable.time)
    if(localValue.includes("T")){
        setStationSlotDate(station, localValue.split("T")[0])
        setStationSlotTime(station, localValue.split("T")[1])
    }
    document.getElementById("booking_time").value = localValue
    selectedBookingSlot = {
        stationKey: stationLocationKey(station),
        bookingTime: localValue
    }
    return true
}

function formatSlotPickerToggleLabel(station, index){
    const stationKey = stationLocationKey(station)
    if(
        selectedBookingSlot
        && selectedBookingSlot.stationKey === stationKey
        && selectedBookingSlot.bookingTime
    ){
        return formatSlotLabelFromTime(selectedBookingSlot.bookingTime)
    }

    const cacheKey = stationSlotsCacheKey(station, getStationSlotDate(station))
    const cached = stationSlotsCache[cacheKey]
    const available = cached ? getAvailableSlotsFromList(cached.slots) : []
    if(available.length > 0){
        return formatSlotLabelFromTime(available[0].time)
    }

    return t("pickTimeSlot")
}

function formatStationSlotDateLabel(dateValue){
    const cleaned = String(dateValue || "").trim()
    if(!cleaned){
        return t("pickDate")
    }
    const parsed = new Date(`${cleaned}T12:00:00`)
    if(Number.isNaN(parsed.getTime())){
        return cleaned
    }
    return parsed.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric"
    })
}

function formatStationSlotButtonLabel(station){
    if(hasSelectedSlotForStation(station) && selectedBookingSlot.bookingTime){
        return formatSlotLabelFromTime(selectedBookingSlot.bookingTime)
    }
    return t("pickDateAndTime")
}

function formatCombinedSlotsButtonMeta(station){
    const datePart = formatStationSlotDateLabel(getStationSlotDate(station))
    if(hasSelectedSlotForStation(station)){
        return t("tapToChangeTime")
    }
    const cacheKey = stationSlotsCacheKey(station, getStationSlotDate(station))
    const cached = stationSlotsCache[cacheKey]
    const count = cached ? getAvailableSlotsFromList(cached.slots).length : Number(station.available_slots ?? 0)
    if(count > 0){
        return t("slotsAvailableOnDate", { count: count, date: datePart })
    }
    return t("noSlotsOnDate", { date: datePart })
}

function formatSlotPickerMeta(station){
    const cacheKey = stationSlotsCacheKey(station, getStationSlotDate(station))
    const cached = stationSlotsCache[cacheKey]
    const count = cached ? getAvailableSlotsFromList(cached.slots).length : Number(station.available_slots ?? 0)
    if(count > 0){
        return t("slotsFree", { count: count })
    }
    return t("noSlotsForDate")
}

function renderSlotPickerMenuHeader(){
    return `
        <div class="slot-picker-menu-header">
            <strong>${t("slotPickerTitle")}</strong>
            <p>${t("slotPickerHint")}</p>
            <div class="slot-picker-legend" aria-hidden="true">
                <span class="legend-available">${t("slotLegendAvailable")}</span>
                <span class="legend-taken">${t("slotLegendTaken")}</span>
            </div>
        </div>`
}

function renderSlotPickerMenuMarkup(station, index, slots){
    if(!Array.isArray(slots) || slots.length === 0){
        return `<p class="station-slot-empty">${t("noSlotsForDate")}</p>`
    }

    const availableSlots = getAvailableSlotsFromList(slots)
    if(availableSlots.length === 0){
        return `<p class="station-slot-empty">${t("noSlotsForDate")}</p>`
    }

    const stationKey = stationLocationKey(station)
    return slots.map(function(slot){
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
        else if(
            selectedBookingSlot
            && selectedBookingSlot.stationKey === stationKey
            && selectedBookingSlot.bookingTime === slot.time
        ){
            slotClass += " selected"
        }

        const disabledAttr = slot.available ? "" : " disabled"
        const statusHint = slot.booked ? t("slotBooked") : (slot.past ? t("slotPast") : "")
        const titleAttr = statusHint ? ` title="${statusHint}"` : ""
        const statusMarkup = statusHint
            ? `<span class="slot-status-label">${statusHint}</span>`
            : ""
        return `<button type="button" class="${slotClass}" data-station-index="${index}" data-slot-time="${slot.time}"${disabledAttr}${titleAttr}><span class="slot-time-label">${slot.label}</span>${statusMarkup}</button>`
    }).join("")
}

function closeAllSlotPickers(){
    document.querySelectorAll(".slot-picker-menu").forEach(function(menu){
        menu.hidden = true
    })
    document.querySelectorAll(".slot-picker-toggle").forEach(function(button){
        button.setAttribute("aria-expanded", "false")
    })
    document.querySelectorAll(".station-card.slots-menu-open").forEach(function(card){
        card.classList.remove("slots-menu-open")
    })
}

function toggleSlotPicker(index){
    const card = document.querySelector(`.station-card[data-station-index="${index}"]`)
    if(!card){
        return
    }

    const menu = card.querySelector(".slot-picker-menu")
    const toggle = card.querySelector(".slot-picker-toggle")
    if(!menu || !toggle){
        return
    }

    const willOpen = menu.hidden
    closeAllSlotPickers()
    menu.hidden = !willOpen
    toggle.setAttribute("aria-expanded", willOpen ? "true" : "false")
    card.classList.toggle("slots-menu-open", willOpen)
}

function updateSlotPickerUi(station, index){
    const card = document.querySelector(`.station-card[data-station-key="${CSS.escape(stationLocationKey(station))}"]`)
    if(!card){
        return
    }

    const label = card.querySelector(".slot-picker-label")
    const meta = card.querySelector(".slot-picker-meta")
    const slotsLabel = card.querySelector(".slots-button-label")
    const slotsMeta = card.querySelector(".slots-button-meta")
    if(label){
        label.innerText = formatSlotPickerToggleLabel(station, index)
    }
    if(meta){
        meta.innerText = formatSlotPickerMeta(station)
    }
    if(slotsLabel){
        slotsLabel.innerText = formatStationSlotButtonLabel(station)
    }
    if(slotsMeta){
        slotsMeta.innerText = formatCombinedSlotsButtonMeta(station)
    }
}

function stationSlotsTimesContainer(card){
    const menu = card.querySelector(".slot-picker-menu")
    if(!menu){
        return null
    }
    return menu.querySelector(".station-slots-times") || menu
}

async function onStationSlotDateChange(index, dateValue){
    const station = latestStations[index]
    if(!station || !dateValue){
        return
    }

    const previousDate = getStationSlotDate(station)
    delete stationSlotsCache[stationSlotsCacheKey(station, previousDate)]
    setStationSlotDate(station, dateValue)
    selectedBookingSlot = null

    if(selectedStation === station){
        const timeValue = getStationSlotTime(station)
        const bookingValue = buildDatetimeLocalFromParts(dateValue, timeValue)
        if(bookingValue){
            document.getElementById("booking_time").value = bookingValue
        }
        updateSelectedStationSummary()
    }

    await loadStationSlotButtons(station, index)
}

async function loadStationSlotButtons(station, index){
    const dateValue = getStationSlotDate(station)
    const data = await fetchStationSlots(station, dateValue)
    if(!data){
        updateSlotPickerUi(station, index)
        return
    }

    station.total_slots = data.total_slots
    station.available_slots = data.available_slots
    updateSlotPickerUi(station, index)

    const card = document.querySelector(`.station-card[data-station-key="${CSS.escape(stationLocationKey(station))}"]`)
    if(!card){
        return
    }
    const badge = card.querySelector(".station-slot-badge")
    if(badge){
        badge.className = stationSlotBadgeClass(station)
        badge.innerText = formatStationSlotBadge(station)
    }
}

async function hydrateStationSlotPickers(){
    const visibleStations = latestStations.slice(0, visibleStationCount)
    await Promise.all(visibleStations.map(function(station, index){
        return loadStationSlotButtons(station, index)
    }))
}

function clearStationSlotsCache(){
    Object.keys(stationSlotsCache).forEach(function(key){
        delete stationSlotsCache[key]
    })
}

function selectStationSlot(index, slotTime, options){
    const station = latestStations[index]
    if(!station || !slotTime){
        return
    }

    const slotAvailability = isSlotAvailableInCache(station, slotTime)
    if(slotAvailability === false){
        setBookingStatus(t("slotAlreadyBooked"))
        return
    }

    const localValue = toDatetimeLocalFromSlot(slotTime)
    if(localValue.includes("T")){
        setStationSlotDate(station, localValue.split("T")[0])
        setStationSlotTime(station, localValue.split("T")[1])
    }

    selectedStation = station
    selectedBookingSlot = {
        stationKey: stationLocationKey(station),
        bookingTime: localValue
    }
    const timeInput = document.getElementById("booking_time")
    if(timeInput){
        timeInput.value = localValue
    }
    updateBookingTotal()
    closeAllSlotPickers()
    updateSlotPickerUi(station, index)
    renderStations(latestStations)
}

function applySlotSelectionFromWindow(payload){
    if(!payload || !payload.slotTime){
        return
    }

    let index = Number(payload.stationIndex)
    if(payload.stationKey){
        const foundIndex = latestStations.findIndex(function(station){
            return stationLocationKey(station) === payload.stationKey
        })
        if(foundIndex >= 0){
            index = foundIndex
        }
    }

    const station = latestStations[index]
    if(station && payload.slotDate){
        setStationSlotDate(station, payload.slotDate)
    }

    if(payload.slot_count != null){
        setSelectedBookingSlotCount(payload.slot_count)
    }
    selectStationSlot(index, payload.slotTime, { skipScroll: true })
    localStorage.removeItem("pendingSlotPick")
    localStorage.removeItem("selectedSlotPick")
}

function updateSelectedStationSummary(){
    if(!selectedStation){
        return
    }
    setBookingStatus("")
}

async function loadStationSlotConfig(){
    try{
        const response = await fetch("/stations/config")
        if(!response.ok){
            return
        }
        const data = await response.json()
        applyBookingPricingConfig(data)
        stationSlotLimit = Number(data.station_slot_limit) || stationSlotLimit
        bookingSlotIntervalMinutes = Number(data.booking_slot_interval_minutes) || 30
        maxBookingDate = data.max_booking_date || ""
        bookingOpenHour = Number(data.booking_open_hour) || bookingOpenHour
        bookingCloseHour = Number(data.booking_close_hour) || bookingCloseHour
        const slotLimitEl = document.getElementById("slot_limit_count")
        if(slotLimitEl){
            slotLimitEl.innerText = String(stationSlotLimit)
        }
    }
    catch(error){
        console.log(error)
    }
}

async function refreshStationSlotAvailability(){
    clearStationSlotsCache()
    if(currentSearch.lat === null || currentSearch.lon === null){
        if(latestStations.length){
            await hydrateStationSlotPickers()
        }
        return
    }

    const previousKey = selectedStation ? stationLocationKey(selectedStation) : ""
    await fetchRealtimeStations("", false, false, true)

    if(previousKey){
        const match = latestStations.find(function(station){
            return stationLocationKey(station) === previousKey
        })
        if(match){
            selectedStation = match
            updateSelectedStationSummary()
        }
    }

    renderStations(latestStations)
}

function makeGoogleMapsUrl(station){
    if(station.latitude !== null && station.latitude !== undefined && station.longitude !== null && station.longitude !== undefined){
        return `https://www.google.com/maps/search/?api=1&query=${station.latitude},${station.longitude}`
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(station.station_name || "EV Charging Station")}`
}

function setLocationStatus(message){
    const status = document.getElementById("location_status")
    if(status){
        status.innerText = message
    }
}

async function seeMoreStations(){
    if(loadingMoreStations){
        return
    }

    const previousVisibleCount = visibleStationCount

    if(latestStations.length > visibleStationCount){
        visibleStationCount += 5
        renderStations(latestStations)
        scrollToStationCard(previousVisibleCount)
        setLocationStatus(`Showing ${visibleStationCount} stations.`)
        return
    }

    if(currentSearch.lat === null || currentSearch.lon === null){
        return
    }

    loadingMoreStations = true
    setSeeMoreLoading(true)
    const previousStations = latestStations.slice()
    const previousCount = previousStations.length
    currentSearch.distance = Math.min(currentSearch.distance + 25, 100)
    currentSearch.maxResults = Math.min(currentSearch.maxResults + 25, 75)
    setLocationStatus(t("loading"))
    await fetchRealtimeStations(t("nearestShown"), false, false)

    const mergedStations = mergeUniqueStations(previousStations, latestStations)
    const changed = mergedStations.length > previousCount
    latestStations = mergedStations
    visibleStationCount = Math.min(visibleStationCount + 5, latestStations.length)

    if(!changed){
        setLocationStatus(t("noMoreStations"))
        renderStations(latestStations)
        loadingMoreStations = false
        setSeeMoreLoading(false)
        return
    }

    renderStations(latestStations)
    window.requestAnimationFrame(function(){
        scrollToStationCard(previousVisibleCount)
    })
    setLocationStatus(`Showing ${visibleStationCount} stations.`)
    loadingMoreStations = false
    setSeeMoreLoading(false)
}

function mergeUniqueStations(existingStations, newStations){
    const merged = []
    const seen = new Set()

    ;[...existingStations, ...newStations].forEach(function(station){
        const key = [
            station.station_name || "",
            station.station_address || "",
            station.latitude ?? "",
            station.longitude ?? ""
        ].join("|")
        if(seen.has(key)){
            return
        }
        seen.add(key)
        merged.push(station)
    })

    merged.sort(function(a, b){
        const aDistance = parseFloat(String(a.distance || "0").replace(/[^\d.]/g, "")) || 0
        const bDistance = parseFloat(String(b.distance || "0").replace(/[^\d.]/g, "")) || 0
        return aDistance - bDistance
    })

    return merged
}

function scrollToBookingPanel(){
    const stations = document.getElementById("stations")
    if(stations && typeof stations.scrollIntoView === "function"){
        stations.scrollIntoView({ behavior: "smooth", block: "start" })
    }
}

function openSlotPickerWindow(index){
    const station = latestStations[index]
    if(!station){
        return
    }

    const payload = {
        stationIndex: index,
        stationKey: stationLocationKey(station),
        station: {
            station_name: station.station_name,
            station_address: station.station_address,
            distance: station.distance,
            service_charge: station.service_charge,
            latitude: station.latitude,
            longitude: station.longitude,
            google_maps_url: station.google_maps_url
        },
        slotDate: getStationSlotDate(station),
        selectedTime: hasSelectedSlotForStation(station) ? selectedBookingSlot.bookingTime : null
    }
    localStorage.setItem("pendingSlotPick", JSON.stringify(payload))

    const width = 560
    const height = 720
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

    window.open("/pick-slot.html", "evPickSlot", features)
}

function canUserBookStation(stationName){
    const station = latestStations.find(function(entry){
        return String(entry.station_name || "").trim().toLowerCase()
            === String(stationName || "").trim().toLowerCase()
    })
    if(station && hasUserActiveBookingForStation(station)){
        return { ok: false, message: t("stationAlreadyBookedByYou") }
    }
    return { ok: true }
}

function proceedToBookingFromSlotPick(payload){
    applySlotSelectionFromWindow(payload)
    if(!selectedStation){
        return { ok: false, message: "Station is no longer on the dashboard. Refresh and try again." }
    }
    if(hasUserActiveBookingForStation(selectedStation)){
        return { ok: false, message: t("stationAlreadyBookedByYou") }
    }
    openBookingWindow()
    return { ok: true }
}

function openBookingWindow(){
    if(!selectedStation){
        return
    }

    if(hasUserActiveBookingForStation(selectedStation)){
        setBookingStatus(t("stationAlreadyBookedByYou"))
        return
    }

    if(!hasSelectedSlotForStation(selectedStation)){
        applyStationScheduleToBooking(selectedStation)
    }
    updateBookingTotal()
    const payload = defaultBookingPayload(selectedStation)
    localStorage.setItem("pendingBookingDraft", JSON.stringify(payload))

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
        setBookingStatus("Allow pop-ups for this site to open the booking page.")
    }
}

function scrollToStationCard(index){
    const cards = document.querySelectorAll(".station-card")
    const target = cards[index] || cards[cards.length - 1]
    if(target && typeof target.scrollIntoView === "function"){
        target.scrollIntoView({ behavior: "smooth", block: "start" })
    }
}

function setSeeMoreLoading(isLoading){
    const button = document.getElementById("see_more_btn")
    const text = document.getElementById("see_more_text")
    if(!button || !text){
        return
    }

    button.disabled = isLoading
    text.innerText = isLoading ? "Loading more stations..." : "See 5 More EV Charging Stations"
}

function renderStations(stations){
    const visibleStations = stations.slice(0, visibleStationCount)
    document.getElementById("station_count").innerText = String(stations.length)
    const seeMoreButton = document.getElementById("see_more_btn")
    if(seeMoreButton){
        seeMoreButton.style.display = stations.length > visibleStationCount ? "flex" : "none"
    }

    if(visibleStations.length === 0){
        document.getElementById("stations").innerHTML = `
            <div class="empty-state station-empty-state">
                <p class="station-empty-title">${t("noStations")}</p>
                <p class="station-empty-hint">${t("searchStationsHint")}</p>
                <p class="station-empty-hint">Use <strong>http://127.0.0.1:8000/dashboard.html</strong> (not a file or other port).</p>
                <div class="station-empty-actions">
                    <button type="button" class="search-btn" onclick="searchStationsByLocation('Coimbatore','')">${t("promptStationsQuery")}</button>
                    <button type="button" class="outline-button" onclick="showNearestStations()">${t("showNearest")}</button>
                    <button type="button" class="outline-button" onclick="clearStationResults()">${t("clearResults")}</button>
                </div>
            </div>`
        return
    }

    document.getElementById("stations").innerHTML = visibleStations.map(function(station, index){
        try{
        const selectedClass = selectedStation === station ? " selected" : ""
        const mapsUrl = makeStationMapsUrl(station)
        const slotReady = hasSelectedSlotForStation(station)
        const alreadyBooked = hasUserActiveBookingForStation(station)
        const slotButtonClass = `station-slots-button station-slots-combo-button slot-picker-open${slotReady ? " has-slot-selected" : ""}`
        const bookButtonClass = `book-button station-book-button icon-button${slotReady && !alreadyBooked ? " ready" : ""}${alreadyBooked ? " already-booked" : ""}`
        const bookButtonTitle = alreadyBooked
            ? t("stationAlreadyBookedByYou")
            : (slotReady ? t("openBookSlotHint") : t("selectSlotFirst"))
        const bookButtonLabel = alreadyBooked ? t("alreadyBooked") : t("book")
        const slotLabel = formatStationSlotButtonLabel(station)
        const slotMeta = formatCombinedSlotsButtonMeta(station)
        return `
            <article class="station-card station-row booking-row reveal${selectedClass}" data-station-key="${stationLocationKey(station)}" data-station-index="${index}">
                <div class="station-details booking-details">
                    <h3>${station.station_name}</h3>
                    <p class="booking-address station-address">${formatStationCardAddress(station)}</p>
                    <div class="station-inline-actions">
                        <a class="booking-map-link map-location-link" href="${mapsUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open Google Maps for ${station.station_name}">
                            <span class="button-icon">${icons.location}</span>
                            <span>Google Maps</span>
                        </a>
                        <div class="station-slots-wrap">
                            <button type="button" class="${slotButtonClass}" data-station-index="${index}" title="${t("openSlotPickerWindowHint")}" aria-label="${t("dateSlotsBtn")}: ${slotLabel}">
                                <span class="slots-button-label">${slotLabel}</span>
                                <span class="slots-button-meta">${slotMeta}</span>
                            </button>
                        </div>
                        <button type="button" class="${bookButtonClass}" data-station-index="${index}" ${alreadyBooked ? "disabled" : ""} title="${bookButtonTitle}">
                            <span class="button-icon">${icons.confirm}</span>
                            <span>${bookButtonLabel}</span>
                        </button>
                    </div>
                    <span class="booking-meta station-meta">${station.distance}</span>
                </div>
                ${renderStationPriceBlock(station)}
            </article>
        `
        }
        catch(renderError){
            console.error("Failed to render station card", station, renderError)
            return `
            <article class="station-card station-row booking-row reveal" data-station-index="${index}">
                <div class="station-details booking-details">
                    <h3>${station.station_name || "EV Charging Station"}</h3>
                    <p class="booking-address station-address">${displayStationAddress(station)}</p>
                    <span class="booking-meta station-meta">${station.distance || ""}</span>
                </div>
            </article>`
        }
    }).join("")

    closeAllSlotPickers()
    hydrateStationSlotPickers().then(function(){
        closeAllSlotPickers()
    })
}

function setBookingPanelEmpty(){
    selectedStation = null
    selectedBookingSlot = null
    setBookingStatus("")
}

function selectStation(index){
    const station = latestStations[index]
    if(!station){
        return
    }

    if(hasUserActiveBookingForStation(station)){
        setBookingStatus(t("stationAlreadyBookedByYou"))
        return
    }

    selectedStation = station
    applyStationScheduleToBooking(station)
    setBookingStatus("")

    if(!hasSelectedSlotForStation(station)){
        openSlotPickerWindow(index)
        return
    }

    renderStations(latestStations)
    updateBookingTotal()
    openBookingWindow()
}

function updateBookingTotal(){
    if(!selectedStation){
        return
    }
    const units = getSelectedBookingUnits()
    const slotCount = getSelectedBookingSlotCount()
    const chargerEl = document.getElementById("booking_charger")
    const chargerType = chargerEl?.value || "Fast DC"
    const total = calculateBookingBreakdown(selectedStation, units, chargerType, slotCount).total
    const paymentEstimate = document.getElementById("payment_estimate")
    if(paymentEstimate){
        paymentEstimate.innerText = money(total)
    }
}

function defaultBookingPayload(station, unitsOverride, chargerTypeOverride){
    const units = unitsOverride != null
        ? getBookingUnits(unitsOverride)
        : getSelectedBookingUnits()
    const slotCount = getSelectedBookingSlotCount()
    const chargerType = chargerTypeOverride || document.getElementById("booking_charger").value
    const pricing = calculateBookingBreakdown(station, units, chargerType, slotCount)
    return {
        username: username,
        station_name: station.station_name,
        station_address: station.station_address,
        google_maps_url: station.google_maps_url || makeGoogleMapsUrl(station),
        latitude: station.latitude ?? null,
        longitude: station.longitude ?? null,
        distance: station.distance,
        booking_time: document.getElementById("booking_time").value,
        charger_type: chargerType,
        units: pricing.units,
        subtotal: pricing.subtotal,
        service_charge: pricing.service_charge,
        price: pricing.total,
        slot_count: slotCount
    }
}

function clearAssistantBookingDraft(){
    assistantBookingDraft = null
    updateAssistantBookingActions()
}

function clearAssistantCostDraft(){
    assistantCostDraft = null
}

function askAssistantBookingUnits(station){
    return t("askBookingUnits", { station: station?.station_name || "this station" })
}

function askAssistantBookingCharger(station){
    return `${t("askBookingCharger", { station: station?.station_name || "this station" })}\n\n${formatAssistantChargerOptions()}`
}

function formatSlotDurationLabel(slotCount){
    return getBookingSlotCount(slotCount) >= 2 ? t("duration60") : t("duration30")
}

function formatAssistantSlotDurationOptions(){
    return [
        { index: 1, label: t("duration30") },
        { index: 2, label: t("duration60") },
    ].map(function(option){
        return t("slotDurationOptionLine", option)
    }).join("\n")
}

function askAssistantBookingSlotDuration(station){
    return `${t("askBookingSlotDuration", { station: station?.station_name || "this station" })}\n\n${formatAssistantSlotDurationOptions()}`
}

function getNextAssistantBookingPrompt(draft){
    if(!draft || draft.stationIndex == null){
        return null
    }

    const station = latestStations[draft.stationIndex]
    if(draft.units == null){
        return askAssistantBookingUnits(station)
    }
    if(!draft.chargerType){
        return askAssistantBookingCharger(station)
    }
    if(draft.slotCount == null){
        return askAssistantBookingSlotDuration(station)
    }
    if(!draft.bookingTime){
        return askAssistantBookingDateTime()
    }
    return null
}

function canCompleteAssistantBooking(){
    const draft = assistantBookingDraft
    return Boolean(
        draft
        && draft.stationIndex != null
        && draft.units != null
        && draft.chargerType
        && draft.slotCount != null
        && draft.bookingTime
        && isValidBookingTime(draft.bookingTime)
    )
}

function buildAssistantBookingSummary(){
    const draft = assistantBookingDraft
    if(!draft || draft.stationIndex == null){
        return ""
    }

    const station = latestStations[draft.stationIndex]
    const parts = []
    if(station){
        parts.push(station.station_name)
    }
    if(draft.units != null){
        parts.push(`${draft.units} units`)
    }
    if(draft.chargerType){
        parts.push(draft.chargerType)
    }
    if(draft.slotCount != null){
        parts.push(formatSlotDurationLabel(draft.slotCount))
    }
    if(draft.bookingTime){
        parts.push(formatSlotLabelFromTime(draft.bookingTime))
    }
    return parts.join(" · ")
}

function updateAssistantBookingActions(){
    const bar = document.getElementById("assistant_booking_actions")
    const bookButton = document.getElementById("assistant_book_slot_btn")
    const hint = document.getElementById("assistant_booking_hint")
    if(!bar || !bookButton){
        return
    }

    if(!assistantBookingDraft || assistantBookingDraft.stationIndex == null){
        bar.hidden = true
        bookButton.disabled = true
        return
    }

    bar.hidden = false
    const draft = assistantBookingDraft
    const summary = buildAssistantBookingSummary()
    if(hint){
        if(canCompleteAssistantBooking()){
            hint.innerText = t("assistantBookingReadyBookSlot", { summary: summary })
        }
        else if(!draft.units){
            hint.innerText = t("assistantMissingUnits")
        }
        else if(!draft.chargerType){
            hint.innerText = t("assistantMissingCharger")
        }
        else if(draft.slotCount == null){
            hint.innerText = t("assistantMissingSlotDuration")
        }
        else if(!draft.bookingTime){
            hint.innerText = t("assistantMissingTime")
        }
        else{
            hint.innerText = summary || t("assistantBookSlotHint")
        }
    }
    bookButton.disabled = !canCompleteAssistantBooking()
}

async function assistantConfirmBookingClick(){
    if(!canCompleteAssistantBooking()){
        addChatMessage("assistant", t("assistantConfirmHint"))
        return
    }

    const paymentWindow = openPaymentWindowBlank()
    const reply = await completeAssistantBooking({ paymentWindow: paymentWindow })
    if(reply){
        addChatMessage("assistant", reply)
    }
    updateAssistantBookingActions()
}

async function assistantBookSlotClick(){
    const draft = assistantBookingDraft
    if(!draft || draft.stationIndex == null){
        addChatMessage("assistant", t("pickStation"))
        return
    }

    if(!canCompleteAssistantBooking()){
        const prompt = getNextAssistantBookingPrompt(draft)
            || (await continueAssistantBookingDraft(""))
        if(prompt){
            addChatMessage("assistant", prompt)
        }
        updateAssistantBookingActions()
        return
    }

    selectStationForAssistant(draft.stationIndex)
    syncAssistantDraftToForm(draft)
    const paymentWindow = openPaymentWindowBlank()
    const reply = await completeAssistantBooking({ paymentWindow: paymentWindow })
    if(reply){
        addChatMessage("assistant", reply)
    }
    updateAssistantBookingActions()
}

function formatAssistantChargerOptions(){
    return assistantChargerOptions.map(function(chargerType, index){
        return t("chargerOptionLine", {
            index: index + 1,
            type: chargerType,
            rate: slotRateForCharger(chargerType)
        })
    }).join("\n")
}

function extractSlotCountFromMessage(message){
    const text = String(message || "").trim().toLowerCase()
    if(!text){
        return null
    }
    if(/\b(1\s*hour|one\s*hour|60\s*min|2\s*slots?)\b/i.test(text)){
        return 2
    }
    if(/\b(30\s*min|half\s*hour|1\s*slot)\b/i.test(text)){
        return 1
    }
    const patterns = [
        /^([12])$/,
        /\b([12])\s*slots?\b/i,
        /\b([12])\s*(?:hour|hr|hours)\b/i,
    ]
    for(const pattern of patterns){
        const match = text.match(pattern)
        if(match && match[1]){
            return getBookingSlotCount(match[1])
        }
    }
    return null
}

function extractUnitsFromMessage(message){
    const text = String(message || "").trim()
    const patterns = [
        /\b(\d{1,3})\s*(?:charging\s*)?units?\b/i,
        /\bunits?\s*[:=]?\s*(\d{1,3})\b/i,
        /^(\d{1,3})$/
    ]

    for(const pattern of patterns){
        const match = text.match(pattern)
        if(match && match[1]){
            const units = Number(match[1])
            if(units >= MIN_BOOKING_UNITS && units <= MAX_BOOKING_UNITS){
                return units
            }
        }
    }

    return null
}

function extractChargerTypeFromMessage(message, options){
    const text = String(message || "").trim().toLowerCase()
    if(!text){
        return null
    }

    const allowNumericChoice = options?.allowNumericChoice !== false

    if(allowNumericChoice && /^3$/.test(text)){
        return "Ultra Fast"
    }
    if(allowNumericChoice && /^2$/.test(text)){
        return "Fast DC"
    }
    if(allowNumericChoice && /^1$/.test(text)){
        return "AC Charger"
    }

    if(/ultra\s*fast|ultrafast/.test(text)){
        return "Ultra Fast"
    }
    if(/fast\s*dc/.test(text) || (/\bfast\b/.test(text) && !/ultra/.test(text)) || /\bdc\b/.test(text)){
        return "Fast DC"
    }
    if(/ac\s*charg|\bac\b/.test(text)){
        return "AC Charger"
    }

    for(const chargerType of assistantChargerOptions){
        if(text.includes(chargerType.toLowerCase())){
            return chargerType
        }
    }

    return null
}

function toDatetimeLocalValue(date){
    const value = new Date(date)
    if(Number.isNaN(value.getTime())){
        return null
    }
    value.setMinutes(value.getMinutes() - value.getTimezoneOffset())
    return value.toISOString().slice(0, 16)
}

function buildBookingDateFromParts(year, month, day, hour, minute){
    const candidate = new Date(year, month - 1, day, hour, minute, 0, 0)
    if(
        candidate.getFullYear() !== year
        || candidate.getMonth() !== month - 1
        || candidate.getDate() !== day
    ){
        return null
    }
    return toDatetimeLocalValue(candidate)
}

function detectRelativeBookingDay(text){
    const normalized = String(text || "").toLowerCase()
    if(/\b(tomorrow|நாளை|कल|നാളെ|రేపు|ನಾಳೆ|श्वः|repu|naale)\b/i.test(normalized)){
        const day = new Date()
        day.setDate(day.getDate() + 1)
        return day
    }
    if(/\b(today|இன்று|आज|ഇന്ന്|ఈరోజు|ಇಂದು|अद्य|inru|aaj|ippo|now)\b/i.test(normalized)){
        return new Date()
    }
    return null
}

function applyHourMeridiem(hour, meridiem){
    let value = Number(hour)
    if(meridiem === "pm" && value < 12){
        value += 12
    }
    if(meridiem === "am" && value === 12){
        value = 0
    }
    return value
}

function inferHourWhenMeridiemMissing(hour){
    const value = Number(hour)
    if(value >= 1 && value <= 6){
        return value + 12
    }
    return value
}

function parseTimeMatch(hourText, minuteText, meridiemText){
    const meridiem = (meridiemText || "").toLowerCase()
    const hasMeridiem = meridiem === "am" || meridiem === "pm"
    let hour = Number(hourText)
    const minute = Number(minuteText || 0)
    if(hasMeridiem){
        hour = applyHourMeridiem(hour, meridiem)
    }
    else{
        hour = inferHourWhenMeridiemMissing(hour)
    }
    if(hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59){
        return { hour, minute, hasMeridiem }
    }
    return null
}

function extractTimePartsFromMessage(text){
    const normalized = String(text || "").trim().toLowerCase()
    let match = normalized.match(/\b(?:at|@)\s*(\d{1,2})[.:](\d{2})\s*(am|pm)?\b/i)
    if(match){
        return parseTimeMatch(match[1], match[2], match[3])
    }

    match = normalized.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i)
    if(match){
        return parseTimeMatch(match[1], match[2], match[3])
    }

    match = normalized.match(/\b(\d{1,2})[.:](\d{2})\s*(am|pm)?\b/i)
    if(match){
        return parseTimeMatch(match[1], match[2], match[3])
    }

    match = normalized.match(/\b(?:at|@)\s*(\d{1,2})\s*(am|pm)\b/i)
    if(match){
        return parseTimeMatch(match[1], "0", match[2])
    }

    match = normalized.match(/\b(\d{1,2})\s*(am|pm)\b/i)
    if(match){
        return parseTimeMatch(match[1], "0", match[2])
    }

    return null
}

function extractOrdinalDayFromMessage(text){
    const normalized = String(text || "").toLowerCase()
    const match = normalized.match(/\b(?:on\s+|the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/)
    if(!match){
        return null
    }

    const day = Number(match[1])
    if(day < 1 || day > 31){
        return null
    }

    return day
}

function buildDateForDayOfMonth(day){
    const now = new Date()
    let candidate = new Date(now.getFullYear(), now.getMonth(), day)
    if(candidate.getDate() !== day){
        return null
    }

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if(candidate < todayStart){
        candidate = new Date(now.getFullYear(), now.getMonth() + 1, day)
        if(candidate.getDate() !== day){
            return null
        }
    }

    return candidate
}

function combineDateAndTimeParts(baseDate, timeParts){
    if(!baseDate || !timeParts){
        return null
    }

    const combined = new Date(baseDate)
    combined.setHours(timeParts.hour, timeParts.minute, 0, 0)
    if(combined.getTime() <= Date.now()){
        const bumped = new Date(baseDate)
        bumped.setMonth(bumped.getMonth() + 1)
        bumped.setHours(timeParts.hour, timeParts.minute, 0, 0)
        if(bumped.getTime() > Date.now()){
            return toDatetimeLocalValue(bumped)
        }
        return null
    }
    return toDatetimeLocalValue(combined)
}

function extractBookingDateTimeFromMessage(message){
    const text = String(message || "").trim()
    if(!text){
        return null
    }
    if(text.includes("@")){
        return null
    }

    let match = text.match(/\b(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})\b/)
    if(match){
        return buildBookingDateFromParts(
            Number(match[1]),
            Number(match[2]),
            Number(match[3]),
            Number(match[4]),
            Number(match[5])
        )
    }

    match = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+|T)(\d{1,2}):(\d{2})\b/)
    if(match){
        let year = Number(match[3])
        if(year < 100){
            year += 2000
        }
        return buildBookingDateFromParts(
            year,
            Number(match[2]),
            Number(match[1]),
            Number(match[4]),
            Number(match[5])
        )
    }

    const timeParts = extractTimePartsFromMessage(text)
    const ordinalDay = extractOrdinalDayFromMessage(text)
    if(ordinalDay && timeParts){
        const baseDate = buildDateForDayOfMonth(ordinalDay)
        const combined = combineDateAndTimeParts(baseDate, timeParts)
        if(combined){
            return combined
        }
    }

    const relativeDay = detectRelativeBookingDay(text)
    if(relativeDay && timeParts){
        relativeDay.setHours(timeParts.hour, timeParts.minute, 0, 0)
        if(relativeDay.getTime() > Date.now()){
            return toDatetimeLocalValue(relativeDay)
        }
        relativeDay.setDate(relativeDay.getDate() + 1)
        return toDatetimeLocalValue(relativeDay)
    }

    if(timeParts && !/\d{1,2}[\/\-.]\d{1,2}/.test(text) && ordinalDay == null){
        const today = new Date()
        today.setHours(timeParts.hour, timeParts.minute, 0, 0)
        if(today.getTime() <= Date.now()){
            today.setDate(today.getDate() + 1)
        }
        return toDatetimeLocalValue(today)
    }

    return null
}

function syncBookingFormValues(units, chargerType, bookingTime){
    const unitsInput = document.getElementById("booking_units")
    const chargerSelect = document.getElementById("booking_charger")
    const timeInput = document.getElementById("booking_time")
    if(unitsInput){
        unitsInput.value = String(getBookingUnits(units))
    }
    if(chargerSelect){
        chargerSelect.value = chargerType
    }
    if(timeInput && bookingTime){
        timeInput.value = bookingTime
    }
    updateBookingTotal()
}

async function completeAssistantBooking(options){
    const draft = assistantBookingDraft
    if(!draft || draft.stationIndex == null){
        return t("noStationsToPick")
    }

    if(draft.units == null || !draft.chargerType || draft.slotCount == null || !draft.bookingTime){
        return await continueAssistantBookingDraft("")
    }

    const station = latestStations[draft.stationIndex]
    if(!station){
        clearAssistantBookingDraft()
        return t("noStationsToPick")
    }

    if(!isValidBookingTime(draft.bookingTime)){
        draft.bookingTime = null
        return assistantBookingTimeError()
    }

    if(hasUserActiveBookingForStation(station)){
        closePaymentWindow(options && options.paymentWindow)
        return t("bookingFailedAssistant", { reason: t("stationAlreadyBookedByYou") })
    }

    const slotAvailable = await isBookingSlotAvailable(station, draft.bookingTime)
    if(slotAvailable === false){
        closePaymentWindow(options && options.paymentWindow)
        return t("bookingFailedAssistant", { reason: t("slotAlreadyBooked") })
    }

    syncAssistantDraftToForm(draft)
    const payload = defaultBookingPayload(selectedStation, draft.units, draft.chargerType)
    const data = await saveBooking(payload)

    assistantAwaitingStationPick = false
    pendingBookingRequest = false
    clearAssistantBookingDraft()

    if(!data.booking_id){
        closePaymentWindow(options && options.paymentWindow)
        return t("bookingFailedAssistant", { reason: data.message || "Booking was not created" })
    }

    await refreshStationSlotAvailability()
    payload.booking_id = data.booking_id
    openPaymentPage(payload, options && options.paymentWindow)
    updateAssistantBookingActions()
    return `${t("bookingSuccess", {
        station: payload.station_name,
        time: formatBookingTimeEnglish(payload.booking_time),
        price: money(payload.price)
    })} ${t("redirectingToPayment")}`
}

async function continueAssistantBookingDraft(input){
    const draft = assistantBookingDraft
    if(!draft || draft.stationIndex == null){
        return null
    }

    const station = latestStations[draft.stationIndex]
    if(!station){
        clearAssistantBookingDraft()
        return t("noStationsToPick")
    }

    const parsedUnits = extractUnitsFromMessage(input)
    const parsedCharger = extractChargerTypeFromMessage(input, {
        allowNumericChoice: draft.units != null && draft.chargerType == null
    })
    const parsedSlotCount = (draft.chargerType || parsedCharger) && draft.slotCount == null
        ? extractSlotCountFromMessage(input)
        : null
    const parsedDateTime = extractBookingDateTimeFromMessage(input)

    if(draft.units == null && parsedUnits != null){
        draft.units = parsedUnits
    }
    if(draft.chargerType == null && parsedCharger != null){
        draft.chargerType = parsedCharger
    }
    if(draft.slotCount == null && parsedSlotCount != null){
        draft.slotCount = parsedSlotCount
    }
    if(draft.bookingTime == null && parsedDateTime != null){
        draft.bookingTime = parsedDateTime
    }

    if(draft.bookingTime != null && !isValidBookingTime(draft.bookingTime)){
        draft.bookingTime = null
        return input.trim() ? assistantBookingTimeError() : askAssistantBookingDateTime()
    }

    if(draft.units == null){
        if(parsedCharger != null || parsedDateTime != null){
            return askAssistantBookingUnits(station)
        }
        return input.trim()
            ? t("invalidBookingUnits")
            : askAssistantBookingUnits(station)
    }

    if(draft.chargerType == null){
        if(parsedUnits != null && parsedCharger == null){
            return askAssistantBookingCharger(station)
        }
        return input.trim()
            ? `${t("invalidBookingCharger")}\n\n${formatAssistantChargerOptions()}`
            : askAssistantBookingCharger(station)
    }

    if(draft.slotCount == null){
        if(parsedDateTime != null && parsedSlotCount == null){
            return askAssistantBookingSlotDuration(station)
        }
        return input.trim()
            ? `${t("invalidBookingSlotDuration")}\n\n${formatAssistantSlotDurationOptions()}`
            : askAssistantBookingSlotDuration(station)
    }

    if(draft.bookingTime == null){
        if(parsedUnits != null || parsedCharger != null || parsedSlotCount != null){
            return askAssistantBookingDateTime()
        }
        return input.trim()
            ? assistantBookingTimeError()
            : askAssistantBookingDateTime()
    }

    syncAssistantDraftToForm(draft)
    updateAssistantBookingActions()
    return await completeAssistantBooking()
}

async function startAssistantBooking(index, input){
    if(!latestStations.length){
        return t("noStationsToPick")
    }

    if(index < 0 || index >= latestStations.length){
        return t("stationRangeInvalid", { max: latestStations.length })
    }

    const station = latestStations[index]
    selectStationForAssistant(index)
    applyStationScheduleToBooking(station)
    assistantAwaitingStationPick = false
    pendingBookingRequest = false
    assistantBookingDraft = { stationIndex: index, units: null, chargerType: null, slotCount: null, bookingTime: null }

    const parsedUnits = extractUnitsFromMessage(input || "")
    const parsedCharger = extractChargerTypeFromMessage(input || "", { allowNumericChoice: false })
    const parsedSlotCount = parsedCharger ? extractSlotCountFromMessage(input || "") : null
    const parsedDateTime = extractBookingDateTimeFromMessage(input || "")
    if(parsedUnits != null){
        assistantBookingDraft.units = parsedUnits
    }
    if(parsedCharger != null){
        assistantBookingDraft.chargerType = parsedCharger
    }
    if(parsedSlotCount != null){
        assistantBookingDraft.slotCount = parsedSlotCount
    }
    if(parsedDateTime != null){
        assistantBookingDraft.bookingTime = parsedDateTime
    }

    syncAssistantDraftToForm(assistantBookingDraft)
    updateAssistantBookingActions()
    return await continueAssistantBookingDraft("")
}

function shouldAbortAssistantBookingDraft(normalized, listIntent, requestedCity, requestedPincode, listBookingsIntent){
    return hasHelpIntent(normalized)
        || hasAny(normalized, ["cancel", "ரத்து", "रद्द"])
        || listIntent
        || listBookingsIntent
        || Boolean(requestedCity || requestedPincode)
}

async function saveBooking(payload){
    const response = await fetch("/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
    })
    return response.json()
}

function buildBookingSuccessMessage(payload){
    return `${t("bookingSuccess", {
        station: payload.station_name,
        time: formatBookingTimeEnglish(payload.booking_time),
        price: money(payload.price)
    })}\n${t("redirectingToPayment")}`
}

function openPaymentWindowBlank(){
    try{
        return window.open("about:blank", "_blank", "noopener,noreferrer")
    }
    catch(error){
        return null
    }
}

function closePaymentWindow(paymentWindow){
    if(paymentWindow && !paymentWindow.closed){
        try{
            paymentWindow.close()
        }
        catch(error){
            console.log(error)
        }
    }
}

function openPaymentPage(payload, paymentWindow){
    const paymentEstimate = document.getElementById("payment_estimate")
    if(paymentEstimate){
        paymentEstimate.innerText = money(payload.price)
    }
    localStorage.setItem("tempBooking", JSON.stringify(payload))

    const targetUrl = "/payment.html"
    if(paymentWindow && !paymentWindow.closed){
        try{
            paymentWindow.location.href = targetUrl
            paymentWindow.focus()
            return true
        }
        catch(error){
            console.log(error)
        }
    }

    const popup = window.open(targetUrl, "_blank", "noopener,noreferrer")
    if(popup){
        popup.focus()
        return true
    }

    window.location.href = targetUrl
    return true
}

function schedulePaymentRedirect(payload, delayMs, paymentWindow){
    if(delayMs > 0){
        window.setTimeout(function(){
            openPaymentPage(payload, paymentWindow)
        }, delayMs)
        return
    }
    openPaymentPage(payload, paymentWindow)
}

function goToPaymentPage(payload){
    openPaymentPage(payload)
}

function askAssistantBookingDateTime(){
    return t("askBookingDateTime", {
        open: bookingOpenHour,
        close: bookingCloseHour
    })
}

function assistantBookingTimeError(){
    return `${t("invalidBookingDateTime")} ${t("bookingTimeOutOfHours", {
        open: bookingOpenHour,
        close: bookingCloseHour
    })}`
}

function syncAssistantDraftToForm(draft){
    if(!draft || draft.stationIndex == null){
        return
    }

    const station = latestStations[draft.stationIndex]
    if(!station){
        return
    }

    selectedStation = station
    if(draft.units != null){
        const unitsInput = document.getElementById("booking_units")
        if(unitsInput){
            unitsInput.value = String(getBookingUnits(draft.units))
        }
    }
    if(draft.chargerType){
        document.getElementById("booking_charger").value = draft.chargerType
    }
    if(draft.slotCount != null){
        setSelectedBookingSlotCount(draft.slotCount)
    }
    if(draft.bookingTime){
        const localValue = toDatetimeLocalFromSlot(draft.bookingTime)
        if(localValue.includes("T")){
            setStationSlotDate(station, localValue.split("T")[0])
            setStationSlotTime(station, localValue.split("T")[1])
        }
        document.getElementById("booking_time").value = localValue
        selectedBookingSlot = {
            stationKey: stationLocationKey(station),
            bookingTime: localValue
        }
    }
    else{
        applyStationScheduleToBooking(station)
    }
    updateBookingTotal()
}

async function runBookingConfirmation(statusElement){
    const status = statusElement || document.getElementById("booking_status")
    if(!selectedStation){
        status.innerText = t("selectedRequired")
        return false
    }

    if(hasUserActiveBookingForStation(selectedStation)){
        status.innerText = t("stationAlreadyBookedByYou")
        return false
    }

    applyStationScheduleToBooking(selectedStation)
    const bookingTimeValue = document.getElementById("booking_time").value
    if(!isValidBookingTime(bookingTimeValue)){
        const parsed = new Date(bookingTimeValue)
        if(!bookingTimeValue || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()){
            status.innerText = t("bookingTimeMustBeFuture")
        }
        else{
            status.innerText = t("bookingTimeOutOfHours", {
                open: bookingOpenHour,
                close: bookingCloseHour
            })
        }
        return false
    }

    const slotAvailable = await isBookingSlotAvailable(selectedStation, bookingTimeValue)
    if(slotAvailable === false){
        status.innerText = t("slotAlreadyBooked")
        await refreshStationSlotAvailability()
        return false
    }

    const unitsError = bookingUnitsValidationMessage()
    if(unitsError){
        status.innerText = unitsError
        return false
    }

    status.innerText = t("saving")
    try{
        const payload = defaultBookingPayload(selectedStation)
        const data = await saveBooking(payload)

        if(!data.booking_id){
            status.innerText = data.message || t("bookingFailed")
            await refreshStationSlotAvailability()
            return false
        }

        await refreshStationSlotAvailability()
        payload.booking_id = data.booking_id
        status.innerText = t("redirectingToPayment")
        openPaymentPage(payload)
        return true
    }
    catch(error){
        status.innerText = t("bookingFailed")
        console.log(error)
        return false
    }
}

async function confirmBookingFromStation(index){
    const station = latestStations[index]
    if(!station){
        return
    }

    selectedStation = station
    applyStationScheduleToBooking(station)
    updateSelectedStationSummary()
    renderStations(latestStations)
    updateBookingTotal()
    await runBookingConfirmation(document.getElementById("booking_status"))
}

async function submitBooking(event){
    event.preventDefault()
    await runBookingConfirmation(document.getElementById("booking_status"))
}

async function refreshUserActiveBookings(){
    try{
        const response = await fetch(`/bookings/${encodeURIComponent(username)}`)
        if(!response.ok){
            userActiveBookings = []
            return userActiveBookings
        }
        const data = await response.json()
        userActiveBookings = Array.isArray(data) ? data : (data.active || [])
        if(latestStations.length){
            renderStations(latestStations)
        }
        return userActiveBookings
    }
    catch(error){
        console.log(error)
        userActiveBookings = []
        return userActiveBookings
    }
}

function hasUserActiveBookingForStation(station){
    if(!station){
        return false
    }
    const stationName = String(station.station_name || "").trim().toLowerCase()
    if(!stationName){
        return false
    }
    return userActiveBookings.some(function(booking){
        return String(booking.station_name || "").trim().toLowerCase() === stationName
    })
}

async function showBookings(){
    const bookingsPanel = document.getElementById("bookings")
    bookingsPanel.innerHTML = `<div class="empty-state">Loading bookings...</div>`
    try{
        const response = await fetch(`/bookings/${encodeURIComponent(username)}`)
        if(!response.ok){
            bookingsPanel.innerHTML = `<div class="empty-state">Unable to load bookings. Please refresh.</div>`
            return []
        }

        const data = await response.json()
        const activeBookings = Array.isArray(data) ? data : (data.active || [])
        const pastBookings = Array.isArray(data) ? [] : (data.past || [])
        userActiveBookings = activeBookings
        document.getElementById("active_booking_count").innerText = activeBookings.length
        if(latestStations.length){
            renderStations(latestStations)
        }

        if(activeBookings.length === 0 && pastBookings.length === 0){
            bookingsPanel.innerHTML = `<div class="empty-state">No bookings yet.</div>`
            return data
        }

        bookingsPanel.innerHTML = `
            <section class="booking-group">
                <div class="booking-group-header">
                    <h3>Active Bookings</h3>
                    <span>${activeBookings.length}</span>
                </div>
                <div class="booking-list-inner">
                    ${renderBookingCards(activeBookings, true)}
                </div>
            </section>
            <section class="booking-group past-booking-group">
                <div class="booking-group-header">
                    <h3>Past Bookings</h3>
                    <span>${pastBookings.length}</span>
                </div>
                <div class="booking-list-inner">
                    ${renderBookingCards(pastBookings, false)}
                </div>
            </section>
        `
        bookingsPanel.querySelectorAll("[data-booking-id]").forEach(function(button){
            button.addEventListener("click", function(){
                cancelBooking(button.dataset.bookingId)
            })
        })
        return data
    }
    catch(error){
        bookingsPanel.innerHTML = `<div class="empty-state">Unable to load bookings. Please refresh.</div>`
        console.log(error)
        return []
    }
}

function formatBookingAddress(booking){
    const address = (booking.station_address || "").trim()
    if(!address || address.toLowerCase() === "address unavailable"){
        return booking.station_name || "Address unavailable"
    }
    return address
}

function makeBookingMapsUrl(booking){
    if(booking.google_maps_url){
        return booking.google_maps_url
    }
    if(booking.latitude !== null && booking.latitude !== undefined && booking.longitude !== null && booking.longitude !== undefined){
        return `https://www.google.com/maps/search/?api=1&query=${booking.latitude},${booking.longitude}`
    }
    const query = [booking.station_name, booking.station_address].filter(Boolean).join(" ")
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function formatPaymentMethodLabel(method){
    const labels = {
        cash: "Cash",
        credit_card: "Credit card",
        debit_card: "Debit card",
        gpay: "GPay"
    }
    return labels[method] || ""
}

function renderBookingCards(bookings, canCancel){
    if(bookings.length === 0){
        return `<div class="empty-state">${canCancel ? "No active bookings yet." : "No past bookings yet."}</div>`
    }

    return bookings.map(function(booking){
        const statusLabel = booking.status || "Booked"
        const rowClass = canCancel ? "active-booking" : "past-booking"
        const paymentStatus = booking.payment_status || "Pending"
        const paymentMethodLabel = formatPaymentMethodLabel(booking.payment_method)
        const paymentLabel = paymentStatus === "Paid"
            ? (paymentMethodLabel ? `Paid · ${paymentMethodLabel}` : "Paid")
            : "Payment Pending"
        const mapsUrl = makeBookingMapsUrl(booking)
        const displayBreakdown = getBookingDisplayBreakdown(booking)
        const unitsDetail = displayBreakdown.units > 0
            ? `<span class="station-price-detail">${formatUnitsLineLabel(displayBreakdown.units, booking.charger_type || "Fast DC", booking.slot_count)}</span>`
            : ""
        const action = canCancel
            ? `<div class="booking-status ${paymentStatus.toLowerCase()}">${paymentLabel}</div><button data-booking-id="${booking.id}">${t("cancel")}</button>`
            : `<span class="booking-status ${statusLabel.toLowerCase()}">${statusLabel}${paymentMethodLabel ? ` · ${paymentMethodLabel}` : ""}</span>`
        return `
            <article class="booking-row ${rowClass}">
                <div class="booking-details">
                    <h3>${booking.station_name}</h3>
                    <p class="booking-address"><strong>Address:</strong> ${formatBookingAddress(booking)}</p>
                    <a class="booking-map-link map-location-link" href="${mapsUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open Google Maps for ${booking.station_name}">
                        <span class="button-icon">${icons.location}</span>
                        <span>Google Maps</span>
                    </a>
                    <span class="booking-meta">${formatBookingTimeEnglish(booking.booking_time, booking.slot_count, bookingSlotIntervalMinutes)} · ${booking.charger_type || "Fast DC"}</span>
                </div>
                <div class="booking-price">
                    <strong>${money(getBookingDisplayTotal(booking))}</strong>
                    ${unitsDetail}
                    ${action}
                </div>
            </article>
        `
    }).join("")
}

async function cancelBooking(bookingId){
    await fetch(`/cancel/${bookingId}`, { method: "DELETE" })
    await showBookings()
    await refreshStationSlotAvailability()
}

function addChatMessage(role, content){
    const container = document.getElementById("chat_messages")
    const message = document.createElement("div")
    message.className = `chat-message ${role}`
    message.innerText = content
    container.appendChild(message)
    container.scrollTop = container.scrollHeight
}

function hasAssistantStationWord(message){
    return hasAny(String(message || "").toLowerCase(), ASSISTANT_STATION_WORDS)
        || ASSISTANT_STATION_WORDS.some(function(term){
            return String(message || "").includes(term)
        })
}

function hasAssistantListWord(message){
    return hasAny(String(message || "").toLowerCase(), ASSISTANT_LIST_WORDS)
        || ASSISTANT_LIST_WORDS.some(function(term){
            return String(message || "").includes(term)
        })
}

function messageIncludesAny(text, terms){
    const normalized = String(text || "").toLowerCase()
    const raw = String(text || "")
    return terms.some(function(term){
        const candidate = String(term || "").trim()
        if(!candidate){
            return false
        }
        return raw.includes(candidate) || normalized.includes(candidate.toLowerCase())
    })
}

function hasExplicitListBookingsCommand(message){
    const normalized = String(message || "").toLowerCase().trim()
    return /^(show|list|view|see|check)\b/.test(normalized)
        && messageIncludesAny(message, ASSISTANT_MY_BOOKINGS_NOUNS)
}

function hasListBookingsIntent(message){
    const normalized = String(message || "").toLowerCase().trim()
    const raw = String(message || "").trim()
    if(!normalized){
        return false
    }

    if(messageIncludesAny(raw, ASSISTANT_MY_BOOKINGS_PHRASES)){
        return true
    }

    if(hasExplicitListBookingsCommand(message)){
        return true
    }

    if(/\b(show|list|view|see|check|get|display)\b.*\b(my\s+)?bookings?\b/.test(normalized)
        || /\b(my\s+)?bookings?\b.*\b(show|list|view|see|check)\b/.test(normalized)){
        return true
    }

    const hasBookingNoun = messageIncludesAny(raw, ASSISTANT_MY_BOOKINGS_NOUNS)
    const hasPossessive = messageIncludesAny(raw, ASSISTANT_MY_BOOKINGS_POSSESSIVE)
    const hasShowWord = hasAssistantListWord(message)
        || hasAny(normalized, ["display", "check", "get", "what are"])

    if(!hasBookingNoun || hasAssistantStationWord(message) || hasExplicitBookCommand(message)){
        return false
    }

    if(hasPossessive || hasShowWord){
        return true
    }

    return raw.split(/\s+/).length <= 3
}

function hasBookingIntent(message){
    if(hasListBookingsIntent(message)){
        return false
    }

    const normalized = String(message || "").toLowerCase()
    if(hasAny(normalized, ASSISTANT_BOOK_WORDS) || ASSISTANT_BOOK_WORDS.some(function(term){
        return String(message || "").includes(term)
    })){
        return true
    }

    if(hasAssistantListWord(message) && hasAssistantStationWord(message)){
        return false
    }

    const actionTerms = [
        "need", "want", "reserve",
        "பதிவு", "முன்பதிவு", "चाहिए", "चाहिये",
        "ആവശ്യം", "కావాలి", "ಬೇಕು", "आरक्ष",
    ]
    return hasAssistantStationWord(message) && hasAny(normalized, actionTerms)
}

function shortenAddress(address, maxLength){
    const text = (address || "").trim()
    if(text.length <= maxLength){
        return text
    }
    return `${text.slice(0, maxLength - 3)}...`
}

function formatAssistantStationList(stations, searchLabel, limit){
    const maxItems = limit || 5
    const visible = stations.slice(0, maxItems)
    const lines = visible.map(function(station, index){
        const address = shortenAddress(formatBookingAddress(station), 72)
        return `${index + 1}. ${station.station_name} — ${station.distance}\n   ${address}`
    })
    const areaText = searchLabel ? t("stationListNear", { area: searchLabel }) : ""
    const moreText = stations.length > maxItems
        ? t("stationListMore", { shown: maxItems, total: stations.length })
        : ""
    return `${t("stationListIntro")}${areaText}:\n\n${lines.join("\n\n")}${moreText}\n\n${t("pickStation")}\n${t("bookAtYourTime")}`
}

function hasListStationsIntent(message){
    const normalized = String(message || "").toLowerCase()
    if(hasAny(normalized, ASSISTANT_BOOK_WORDS) || ASSISTANT_BOOK_WORDS.some(function(term){
        return String(message || "").includes(term)
    })){
        return false
    }
    if(hasAssistantListWord(message)){
        return true
    }
    return Boolean(findCityInMessage(message) && hasAssistantStationWord(message))
}

function hasHelpIntent(message){
    const normalized = String(message || "").toLowerCase()
    return hasAny(normalized, [
        "help", "what can you", "how do i", "commands", "what do you do",
        "உதவி", "என்ன செய்ய", "मदद", "सहायता", "कैसे", "സഹായം", "സഹായിക്ക", "సహాయం", "సహాయించ", "ಸಹಾಯ", "ಸಹಾಯ ಮಾಡ", "साहाय्यम्", "किं करोषि",
    ])
}

function hasExplicitBookCommand(message){
    const normalized = String(message || "").toLowerCase().trim()
    return /^(book|reserve)\b/i.test(normalized)
        || hasAny(normalized, ["பதிவு", "முன்பதிவு", "बुक कर", "बुकिंग", "आरक्षित", "आरक्षण", "ബുക്ക്", "ബുക്കിംഗ്", "బుక్", "బుకింగ్", "ಬುಕ್", "ಬುಕಿಂಗ್", "आरक्ष"])
}

function normalizeCityAlias(value){
    const cleaned = String(value || "").trim().toLowerCase()
    if(!cleaned){
        return ""
    }

    for(const [canonical, aliases] of Object.entries(cityAliasMap)){
        if(canonical === cleaned || aliases.some(function(alias){
            return cleaned === alias.toLowerCase() || cleaned.includes(alias.toLowerCase())
        })){
            return canonical
        }
    }

    return cleaned.replace("trichy", "tiruchirappalli")
}

function findCityInMessage(message){
    const text = String(message || "")
    if(!text.trim()){
        return ""
    }

    let bestMatch = ""
    let bestLength = 0

    for(const [canonical, aliases] of Object.entries(cityAliasMap)){
        const candidates = [canonical, ...aliases]
        candidates.forEach(function(alias){
            if(text.includes(alias) && alias.length > bestLength){
                bestMatch = canonical
                bestLength = alias.length
            }
        })
    }

    return bestMatch
}

function extractCityFromStationQuery(message){
    const resolvedFromAlias = findCityInMessage(message)
    if(resolvedFromAlias){
        return resolvedFromAlias
    }

    const patterns = [
        /\b(?:stations?|charging|chargers?|நிலையங்கள்|நிலையம்|स्टेशन|স্থানक|స్టేషన్|ಸ್ಟೇಷನ್)\s*(?:in|at|near|around|for|இல்|ல்|में|के पास|ൽ|లో|ನಲ್ಲಿ)?\s*([a-zA-Z][a-zA-Z\s-]{2,40})/i,
        /\b(?:in|at|near|around)\s+([a-zA-Z][a-zA-Z\s-]{2,40})\s+(?:stations?|charging|chargers?)/i,
        /\bavailable\s+(?:in|at|near)\s+([a-zA-Z][a-zA-Z\s-]{2,40})/i,
        /([a-zA-Z][a-zA-Z\s-]{2,40})\s+(?:இல்|அருகில்)\b/i,
        /(?:இல்|அருகில்)\s+([a-zA-Z][a-zA-Z\s-]{2,40})\b/i,
        /([a-zA-Z][a-zA-Z\s-]{2,40})\s+(?:में|के पास)\b/i,
        /(?:में|के पास)\s+([a-zA-Z][a-zA-Z\s-]{2,40})\b/i,
        /([a-zA-Z][a-zA-Z\s-]{2,40})\s+(?:ൽ|ല്)\b/i,
        /([a-zA-Z][a-zA-Z\s-]{2,40})\s+(?:లో|దగ్గర)\b/i,
        /([a-zA-Z][a-zA-Z\s-]{2,40})\s+(?:ನಲ್ಲಿ|ಹತ್ತಿರ)\b/i,
        /([\u0B80-\u0BFF]{2,30})இல்/i,
        /([\u0B80-\u0BFF]{2,30})ல்/i,
        /([\u0900-\u097F]{2,30})\s*(?:में|के पास)/i,
        /([\u0D00-\u0D7F]{2,30})\s*(?:ൽ|ല്)/i,
        /([\u0C00-\u0C7F]{2,30})\s*(?:లో|దగ్గర)/i,
        /([\u0C80-\u0CFF]{2,30})\s*(?:ನಲ್ಲಿ|ಹತ್ತಿರ)/i,
    ]

    for(const pattern of patterns){
        const match = message.match(pattern)
        if(match && match[1]){
            const value = match[1].trim().replace(/\b(stations?|charging|chargers?)\b/gi, "").trim()
            const canonical = normalizeCityAlias(value)
            if(canonical && !isPincodeValue(canonical)){
                return canonical
            }
        }
    }

    return ""
}

function extractStationIndex(message){
    const normalized = String(message || "").toLowerCase().trim()
    const numericMatch = normalized.match(/\b(?:book|station|option|number|#)\s*(\d+)\b/)
        || normalized.match(/^(\d+)$/)
    if(numericMatch && numericMatch[1]){
        return Number(numericMatch[1])
    }

    const words = {
        first: 1, "1st": 1, one: 1, ஒன்று: 1, ஒரு: 1, एक: 1, ഒന്ന്: 1, ఒకటి: 1, ಒಂದು: 1,
        second: 2, "2nd": 2, two: 2, இரண்டு: 2, दो: 2, രണ്ട്: 2, రెండు: 2, ಎರಡು: 2,
        third: 3, "3rd": 3, three: 3, மூன்று: 3, तीन: 3, മൂന്ന്: 3, మూడు: 3, ಮೂರು: 3,
        fourth: 4, "4th": 4, four: 4, நான்கு: 4, चार: 4, നാല്: 4, నాలుగు: 4, ನಾಲ್ಕು: 4,
        fifth: 5, "5th": 5, five: 5, ஐந்து: 5, पांच: 5, അഞ്ച്: 5, అయిదు: 5, ಐದು: 5,
    }

    for(const [word, index] of Object.entries(words)){
        if(new RegExp(`\\b${word}\\b`).test(normalized)){
            return index
        }
    }

    return null
}

function findStationMentionInMessage(message, stations){
    const normalized = String(message || "").toLowerCase()
    let bestMatch = null
    let bestLength = 0

    stations.forEach(function(station, index){
        const name = (station.station_name || "").trim().toLowerCase()
        if(name.length < 4){
            return
        }
        if(normalized.includes(name) && name.length > bestLength){
            bestMatch = index
            bestLength = name.length
        }
    })

    return bestMatch
}

async function searchStationsForAssistant(city, pincode){
    const cityQuery = (city || "").trim()
    const pincodeQuery = (pincode || "").trim()
    const searchLabel = pincodeQuery ? `pincode ${pincodeQuery}` : displayCity(cityQuery)

    if(pincodeQuery){
        await searchStationsByLocation("", pincodeQuery, true)
    }
    else if(cityQuery){
        const supportedLocation = coordinatesForCity(cityQuery.toLowerCase())
        if(supportedLocation){
            await loadRealtimeStations(
                supportedLocation.lat,
                supportedLocation.lon,
                `Showing realtime stations for ${displayCity(cityQuery)}.`,
                true
            )
        }
        else{
            await searchStationsByLocation(displayCity(cityQuery), "", true)
        }
    }

    assistantLastSearchLabel = searchLabel
    return searchLabel
}

function selectStationForAssistant(index){
    selectedStation = latestStations[index] || null
    if(selectedStation){
        applyStationScheduleToBooking(selectedStation)
    }
}

async function fetchBookingsForAssistant(){
    try{
        const response = await fetch(`/bookings/${encodeURIComponent(username)}`)
        if(!response.ok){
            return null
        }
        return response.json()
    }
    catch(error){
        console.log(error)
        return null
    }
}

function formatAssistantBookingList(bookingsData){
    const activeBookings = Array.isArray(bookingsData) ? bookingsData : (bookingsData.active || [])
    const pastBookings = Array.isArray(bookingsData) ? [] : (bookingsData.past || [])

    if(activeBookings.length === 0 && pastBookings.length === 0){
        return t("noActiveBooking")
    }

    const lines = [t("bookingListIntro")]

    if(activeBookings.length > 0){
        lines.push(`\n${t("activeBookingsLabel")}`)
        activeBookings.forEach(function(booking, index){
            const paymentStatus = booking.payment_status === "Paid" ? t("paymentPaid") : t("paymentPending")
            lines.push(`${index + 1}. ${booking.station_name} — ${formatBookingTimeEnglish(booking.booking_time)} — ${money(getBookingDisplayTotal(booking))} (${paymentStatus})`)
        })
    }

    if(pastBookings.length > 0){
        lines.push(`\n${t("pastBookingsLabel")}`)
        pastBookings.slice(0, 5).forEach(function(booking, index){
            lines.push(`${index + 1}. ${booking.station_name} — ${formatBookingTimeEnglish(booking.booking_time)} — ${money(getBookingDisplayTotal(booking))}`)
        })
        if(pastBookings.length > 5){
            lines.push(t("pastBookingsMore", { count: pastBookings.length - 5 }))
        }
    }

    return lines.join("\n")
}

async function replyWithAssistantBookings(){
    clearAssistantBookingDraft()
    assistantAwaitingStationPick = false
    pendingBookingRequest = false
    updateAssistantBookingActions()

    const bookingsData = await fetchBookingsForAssistant()
    if(!bookingsData){
        return t("bookingsLoadFailed")
    }

    await showBookings()
    return formatAssistantBookingList(bookingsData)
}

async function assistantReply(input){
    if(trySetLanguageFromCommand(input)){
        return t("languageChanged", { language: languageDisplayNames[currentLanguage] || currentLanguage })
    }

    const normalized = input.toLowerCase().trim()
    const listBookingsIntent = hasListBookingsIntent(normalized) || hasListBookingsIntent(input)
    const bookingIntent = hasBookingIntent(normalized) || hasBookingIntent(input)
    const listIntent = hasListStationsIntent(normalized) || hasListStationsIntent(input)
    const requestedPincode = extractPincode(input)
    const requestedCity = findCityInMessage(input)
        || findRequestedCity(normalized)
        || extractCityFromStationQuery(input)
        || extractFreeformCity(input)
    const stationIndex = extractStationIndex(input)
    const stationByName = latestStations.length ? findStationMentionInMessage(input, latestStations) : null

    if(hasHelpIntent(normalized)){
        clearAssistantBookingDraft()
        clearAssistantCostDraft()
        return t("assistantHelpText")
    }

    if(listBookingsIntent){
        clearAssistantCostDraft()
        return await replyWithAssistantBookings()
    }

    if(assistantCostDraft && !hasAny(normalized, ["cost", "price", "estimate", "செலவு", "लागत", "खर्च", "ചെലവ്", "ఖర్చు", "ವೆಚ್ಚ", "मूल्य"])){
        clearAssistantCostDraft()
    }

    if(shouldAbortAssistantBookingDraft(normalized, listIntent, requestedCity, requestedPincode, listBookingsIntent)){
        clearAssistantBookingDraft()
        clearAssistantCostDraft()
    }
    else if(assistantBookingDraft){
        const draftReply = await continueAssistantBookingDraft(input)
        if(draftReply){
            return draftReply
        }
    }

    if(stationIndex !== null || stationByName !== null){
        const targetIndex = stationByName !== null ? stationByName : stationIndex - 1
        if(bookingIntent || assistantAwaitingStationPick || pendingBookingRequest){
            return await startAssistantBooking(targetIndex, input)
        }
        if(latestStations[targetIndex]){
            selectStationForAssistant(targetIndex)
            const station = latestStations[targetIndex]
            return t("stationSelected", {
                station: station.station_name,
                distance: station.distance,
                number: stationIndex || targetIndex + 1
            })
        }
    }

    if(assistantAwaitingStationPick && (bookingIntent || hasExplicitBookCommand(normalized))){
        if(stationIndex !== null){
            return await startAssistantBooking(stationIndex - 1, input)
        }
        if(stationByName !== null){
            return await startAssistantBooking(stationByName, input)
        }
        return t("pickStation")
    }

    if(bookingIntent && !requestedCity && !requestedPincode){
        if(latestStations.length > 0){
            assistantAwaitingStationPick = true
            pendingBookingRequest = true
            return `${formatAssistantStationList(latestStations, assistantLastSearchLabel)}\n\n${t("pickStation")}`
        }
        pendingBookingRequest = true
        assistantAwaitingStationPick = true
        return t("askLocation")
    }

    if(listIntent || bookingIntent || requestedCity || requestedPincode){
        if(!requestedCity && !requestedPincode){
            if(latestStations.length > 0){
                assistantAwaitingStationPick = bookingIntent
                pendingBookingRequest = bookingIntent
                return formatAssistantStationList(latestStations, assistantLastSearchLabel)
            }
            return t("askLocation")
        }

        const searchLabel = await searchStationsForAssistant(requestedCity, requestedPincode)

        if(latestStations.length === 0){
            assistantAwaitingStationPick = false
            pendingBookingRequest = false
            return t("noStationsLocation", { city: searchLabel })
        }

        assistantAwaitingStationPick = bookingIntent
        pendingBookingRequest = bookingIntent

        if(bookingIntent && (stationIndex !== null || stationByName !== null)){
            const targetIndex = stationByName !== null ? stationByName : stationIndex - 1
            return await startAssistantBooking(targetIndex, input)
        }

        return formatAssistantStationList(latestStations, searchLabel)
    }

    if(hasAny(normalized, ["cost", "price", "estimate", "செலவு", "लागत", "खर्च", "ചെലവ്", "ఖర్చు", "ವೆಚ್ಚ", "मूल्य"])){
        const parsedUnits = extractUnitsFromMessage(input)
        const parsedCharger = extractChargerTypeFromMessage(input, {
            allowNumericChoice: Boolean(assistantCostDraft?.units != null || parsedUnits != null)
        })
        const parsedSlotCount = assistantCostDraft?.chargerType || parsedCharger
            ? extractSlotCountFromMessage(input)
            : null
        const draft = assistantCostDraft || { units: null, chargerType: null, slotCount: null }

        if(parsedUnits != null){
            draft.units = parsedUnits
        }
        if(parsedCharger != null){
            draft.chargerType = parsedCharger
        }
        if(parsedSlotCount != null){
            draft.slotCount = parsedSlotCount
        }
        assistantCostDraft = draft

        if(draft.units == null){
            return input.trim() && !parsedCharger
                ? t("invalidBookingUnits")
                : t("askCostUnits")
        }

        if(!draft.chargerType){
            return input.trim() && !parsedCharger
                ? `${t("invalidBookingCharger")}\n\n${formatAssistantChargerOptions()}`
                : `${t("askBookingCharger", { station: "your estimate" })}\n\n${formatAssistantChargerOptions()}`
        }

        if(draft.slotCount == null){
            return input.trim() && !parsedSlotCount
                ? `${t("invalidBookingSlotDuration")}\n\n${formatAssistantSlotDurationOptions()}`
                : askAssistantBookingSlotDuration({ station_name: "your estimate" })
        }

        clearAssistantCostDraft()
        const breakdown = calculateUnitsBreakdown(
            draft.units,
            draft.chargerType,
            selectedStation ? getStationServiceCharge(selectedStation) : 0,
            draft.slotCount
        )
        const unitsInput = document.getElementById("booking_units")
        const chargerInput = document.getElementById("booking_charger")
        if(unitsInput){
            unitsInput.value = String(draft.units)
        }
        if(chargerInput){
            chargerInput.value = draft.chargerType
        }
        setSelectedBookingSlotCount(draft.slotCount)
        return t("costEstimate", {
            price: money(breakdown.total),
            rate: breakdown.rate_per_unit.toFixed(2),
            units: breakdown.units
        })
    }

    if(hasAny(normalized, ["cancel", "ரத்து", "रद्द"])){
        return t("cancelHelp")
    }

    if(hasAny(normalized, ["hello", "hi", "hey", "வணக்கம்", "नमस्ते", "namaste"])){
        return `${t("greeting")}\n\n${t("assistantHelpText")}`
    }

    if(latestStations.length > 0 && hasAny(normalized, ["these", "those", "them", "that list", "above"])){
        return formatAssistantStationList(latestStations, assistantLastSearchLabel)
    }

    return `${t("fallback")}\n\n${t("assistantHelpText")}`
}

function hasAny(message, terms){
    return terms.some(function(term){
        return message.includes(term)
    })
}

function findRequestedCity(message){
    const normalized = message.replace("trichy", "tiruchirappalli")
    return supportedCities.find(function(city){
        return normalized.includes(city)
    })
}

function extractFreeformCity(message){
    const resolvedFromAlias = findCityInMessage(message)
    if(resolvedFromAlias){
        return resolvedFromAlias
    }

    const patterns = [
        /\b(?:in|at|for|to)\s+([a-zA-Z][a-zA-Z\s-]{1,40})$/i,
        /\b(?:in|at|for|to)\s+([a-zA-Z][a-zA-Z\s-]{1,40})\s+station/i,
        /\b(?:book|reserve|search)\s+([a-zA-Z][a-zA-Z\s-]{1,40})$/i
    ]

    for(const pattern of patterns){
        const match = message.match(pattern)
        if(match && match[1]){
            const value = match[1].trim().replace(/\b(stations?|charging|chargers?)\b/gi, "").trim()
            const canonical = normalizeCityAlias(value)
            if(canonical && !isPincodeValue(canonical)){
                return canonical
            }
        }
    }

    return ""
}

function extractPincode(message){
    const labeled = message.match(/\b(?:pincode|pin\s*code|postal\s*code|zip)\s*[:#-]?\s*(\d{4,10})\b/i)
    if(labeled && labeled[1]){
        return labeled[1].trim()
    }

    const standalone = message.match(/\b(\d{6})\b/)
    if(standalone && standalone[1]){
        return standalone[1].trim()
    }

    return ""
}

function coordinatesForCity(city){
    return cityCoordinates[city]
}

function displayCity(city){
    const names = {
        chennai: "Chennai",
        coimbatore: "Coimbatore",
        madurai: "Madurai",
        salem: "Salem",
        tiruchirappalli: "Tiruchirappalli",
        trichy: "Tiruchirappalli",
        vellore: "Vellore",
        hyderabad: "Hyderabad"
    }
    const normalized = String(city || "").trim()
    if(normalized.length === 0){
        return ""
    }

    const key = normalized.toLowerCase()
    return names[key] || normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

async function submitChat(event){
    event.preventDefault()
    const input = document.getElementById("chat_input")
    const message = input.value.trim()
    if(!message){
        return
    }
    applyLanguageFromUserMessage(message)
    addChatMessage("user", message)
    input.value = ""
    try{
        const reply = await assistantReply(message)
        addChatMessage("assistant", reply || t("fallback"))
    }
    catch(error){
        console.error("Assistant chat failed", error)
        addChatMessage("assistant", t("bookingFailedAssistant", {
            reason: "Something went wrong. Please refresh the page (Ctrl+Shift+R) and try again."
        }))
    }
    updateAssistantBookingActions()
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

async function logout(){
    try{
        await fetch("/logout", { method: "POST", credentials: "same-origin" })
    }
    catch(error){
        console.log(error)
    }
    localStorage.removeItem("username")
    localStorage.removeItem("tempBooking")
    window.location.href = "/login.html"
}

function setDefaultBookingTime(){
    const next = nextConvenientBookingDate()
    const local = new Date(next.getTime() - next.getTimezoneOffset() * 60000)
    document.getElementById("booking_time").value = local.toISOString().slice(0, 16)
}

let dashboardEventsBound = false

function bindDashboardEvents(){
    if(dashboardEventsBound){
        return
    }
    dashboardEventsBound = true

    const citySearchForm = document.getElementById("city_search_form")
    if(citySearchForm){
        citySearchForm.addEventListener("submit", function(event){
            event.preventDefault()
            const cityInput = document.getElementById("city_search_input")
            const pincodeInput = document.getElementById("pincode_search_input")
            searchStationsByLocation(cityInput.value, pincodeInput.value)
        })
    }

    document.querySelectorAll(".nav-link[data-view]").forEach(function(button){
        button.addEventListener("click", function(event){
            event.preventDefault()
            activateView(button.dataset.view)
        })
    })

    const bookingTimeInput = document.getElementById("booking_time")
    if(bookingTimeInput){
        bookingTimeInput.addEventListener("change", function(){
            if(selectedStation){
                const value = document.getElementById("booking_time").value
                if(value.includes("T")){
                    setStationSlotDate(selectedStation, value.split("T")[0])
                    setStationSlotTime(selectedStation, value.split("T")[1])
                }
                selectedBookingSlot = {
                    stationKey: stationLocationKey(selectedStation),
                    bookingTime: value
                }
                updateSelectedStationSummary()
                if(latestStations.length){
                    renderStations(latestStations)
                }
            }
        })
    }

    const bookingUnitsInput = document.getElementById("booking_units")
    if(bookingUnitsInput){
        bookingUnitsInput.addEventListener("input", function(){
            updateBookingTotal()
            if(latestStations.length){
                renderStations(latestStations)
            }
        })
    }

    const bookingCharger = document.getElementById("booking_charger")
    if(bookingCharger){
        bookingCharger.addEventListener("change", function(){
            updateBookingTotal()
            if(latestStations.length){
                renderStations(latestStations)
            }
        })
    }

    const stationsPanel = document.getElementById("stations")
    if(stationsPanel){
        stationsPanel.addEventListener("click", function(event){
            const slotsOpen = event.target.closest(".slot-picker-open")
            if(slotsOpen){
                openSlotPickerWindow(Number(slotsOpen.dataset.stationIndex))
                return
            }
            const bookButton = event.target.closest(".book-button")
            if(bookButton){
                selectStation(Number(bookButton.dataset.stationIndex))
            }
        })
    }

    const assistantBookSlotBtn = document.getElementById("assistant_book_slot_btn")
    if(assistantBookSlotBtn){
        assistantBookSlotBtn.addEventListener("click", assistantBookSlotClick)
    }

    const chatForm = document.getElementById("chat_form")
    if(chatForm){
        chatForm.addEventListener("submit", submitChat)
    }

    document.querySelectorAll("[data-chat-prompt-key]").forEach(function(button){
        button.addEventListener("click", function(){
            const chatInput = document.getElementById("chat_input")
            const chatFormNode = document.getElementById("chat_form")
            if(chatInput){
                chatInput.value = t(button.dataset.chatPromptKey)
            }
            if(chatFormNode){
                chatFormNode.requestSubmit()
            }
        })
    })
}

function exposeDashboardGlobals(){
    window.activateView = activateView
    window.findStations = findStations
    window.showNearestStations = showNearestStations
    window.clearStationResults = clearStationResults
    window.seeMoreStations = seeMoreStations
    window.logout = logout
    window.changeLanguage = changeLanguage
    window.searchStationsByLocation = searchStationsByLocation
}

exposeDashboardGlobals()

if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bindDashboardEvents)
}
else{
    bindDashboardEvents()
}

window.onload = async function(){
    bindDashboardEvents()
    activateView("stations")

    const sessionUser = await ensureAuthenticated()
    if(!sessionUser){
        return
    }

    username = sessionUser.username
    localStorage.setItem("username", username)

    document.getElementById("sidebar_user").innerText = username
    document.getElementById("profile_username").innerText = username
    renderIcons()
    normalizeCurrentLanguage()
    populateLanguageSelect()
    applyTranslations()

    try{
        setDefaultBookingTime()
    }
    catch(error){
        console.error(error)
    }

    updateBookingTotal()
    renderStations([])
    addChatMessage("assistant", t("welcome"))
    updateAssistantBookingActions()
    setLocationStatus(t("loading"))

    const checkoutView = window.location.hash.replace("#", "")
    if(checkoutView === "bookings"){
        activateView("bookings")
    }

    try{
        await Promise.all([
            loadStationSlotConfig(),
            refreshUserActiveBookings()
        ])
    }
    catch(error){
        console.error(error)
    }

    try{
        await showNearestStations()
    }
    catch(error){
        console.error(error)
        setLocationStatus(t("stationsLoadFailed"))
    }
}

window.refreshUserActiveBookings = refreshUserActiveBookings
window.refreshStationSlotAvailability = refreshStationSlotAvailability
window.applySlotSelectionFromWindow = applySlotSelectionFromWindow
window.setSelectedBookingSlotCount = setSelectedBookingSlotCount
window.proceedToBookingFromSlotPick = proceedToBookingFromSlotPick
window.openBookingWindow = openBookingWindow
window.canUserBookStation = canUserBookStation
