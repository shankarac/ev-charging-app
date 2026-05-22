"""
Configuration settings for the Agentic AI EV Charging Ecosystem
using Ollama Llama3.
"""

# =========================================
# OLLAMA CONFIGURATION
# =========================================

OLLAMA_BASE_URL = "http://localhost:11434"

OLLAMA_MODEL = "llama3"


# =========================================
# CREATIVE FREEDOM SETTINGS
# =========================================

CREATIVE_FREEDOM_LEVELS = {
    "less": 0.2,
    "moderate": 0.5,
    "high": 0.8,
}

CREATIVE_FREEDOM = "less"


def get_temperature():
    return CREATIVE_FREEDOM_LEVELS.get(CREATIVE_FREEDOM, 0.2)


# =========================================
# EV CHARGING STATIONS DATABASE
# =========================================

EV_STATIONS = [

    {
        "station_id": "EV101",
        "name": "Green Charge Hub",
        "location": "Chennai",
        "available_slots": 4,
        "charger_type": "Fast DC",
        "price_per_kwh": 18
    },

    {
        "station_id": "EV102",
        "name": "Volt Power Station",
        "location": "Coimbatore",
        "available_slots": 2,
        "charger_type": "Ultra Fast",
        "price_per_kwh": 22
    },

    {
        "station_id": "EV103",
        "name": "EcoCharge Point",
        "location": "Madurai",
        "available_slots": 6,
        "charger_type": "AC Charger",
        "price_per_kwh": 12
    }
]