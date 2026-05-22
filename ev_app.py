import streamlit as st
import sqlite3
import re
from datetime import datetime
from pathlib import Path

# =========================
# DATABASE
# =========================
BASE_DIR = Path(__file__).resolve().parent
conn = sqlite3.connect(BASE_DIR / "data" / "sqlite" / "ev_chatbot.db", check_same_thread=False)
cursor = conn.cursor()

# =========================
# USERS TABLE
# =========================
cursor.execute("""
CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    language TEXT
)
""")

# =========================
# BOOKINGS TABLE
# =========================
cursor.execute("""
CREATE TABLE IF NOT EXISTS bookings(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    station_code TEXT,
    station_name TEXT,
    city TEXT,
    booking_time TEXT,
    price INTEGER,
    status TEXT
)
""")

conn.commit()

# =========================
# STATIONS
# =========================
stations = [

    {
        "code": "EV101",
        "name": "Coimbatore Fast Charge",
        "city": "Coimbatore",
        "price": 250
    },

    {
        "code": "EV102",
        "name": "Chennai Super Charge",
        "city": "Chennai",
        "price": 300
    },

    {
        "code": "EV103",
        "name": "Madurai EV Hub",
        "city": "Madurai",
        "price": 200
    },

    {
        "code": "EV104",
        "name": "Hyderabad EV Point",
        "city": "Hyderabad",
        "price": 280
    }
]

# =========================
# TRANSLATIONS
# =========================
translations = {

    "English": {

        "title": "EV AI Chatbot",
        "login": "Login",
        "register": "Register",
        "username": "Username",
        "password": "Password",
        "placeholder": "Type your message...",
        "booked": "Booking successful",
        "cancelled": "Booking cancelled",
        "nobooking": "No bookings found",
        "needcode": "Please provide station code",
        "already": "You already booked a station",
        "invalid": "Invalid login",
        "exists": "User already exists",
        "regsuccess": "Registration successful",
        "help": "I can help with EV booking and cancellation.",
        "logout": "Logout"
    },

    "Tamil": {

        "title": "EV AI சாட்பாட்",
        "login": "உள்நுழை",
        "register": "பதிவு செய்",
        "username": "பயனர் பெயர்",
        "password": "கடவுச்சொல்",
        "placeholder": "உங்கள் செய்தியை தட்டச்சு செய்யவும்...",
        "booked": "முன்பதிவு வெற்றி",
        "cancelled": "முன்பதிவு ரத்து செய்யப்பட்டது",
        "nobooking": "பதிவுகள் இல்லை",
        "needcode": "ஸ்டேஷன் குறியீட்டை கொடுக்கவும்",
        "already": "நீங்கள் ஏற்கனவே பதிவு செய்துள்ளீர்கள்",
        "invalid": "தவறான உள்நுழைவு",
        "exists": "பயனர் ஏற்கனவே உள்ளார்",
        "regsuccess": "பதிவு வெற்றி",
        "help": "EV பதிவு மற்றும் ரத்து செய்ய உதவ முடியும்.",
        "logout": "வெளியேறு"
    },

    "Hindi": {

        "title": "EV AI चैटबॉट",
        "login": "लॉगिन",
        "register": "पंजीकरण",
        "username": "यूज़रनेम",
        "password": "पासवर्ड",
        "placeholder": "अपना संदेश लिखें...",
        "booked": "बुकिंग सफल",
        "cancelled": "बुकिंग रद्द की गई",
        "nobooking": "कोई बुकिंग नहीं मिली",
        "needcode": "कृपया स्टेशन कोड दें",
        "already": "आपने पहले ही बुक किया है",
        "invalid": "अमान्य लॉगिन",
        "exists": "यूज़र पहले से मौजूद है",
        "regsuccess": "पंजीकरण सफल",
        "help": "मैं EV बुकिंग और रद्दीकरण में मदद कर सकता हूँ।",
        "logout": "लॉगआउट"
    },

    "Telugu": {

        "title": "EV AI చాట్‌బాట్",
        "login": "లాగిన్",
        "register": "రిజిస్టర్",
        "username": "వినియోగదారు పేరు",
        "password": "పాస్వర్డ్",
        "placeholder": "మీ సందేశాన్ని టైప్ చేయండి...",
        "booked": "బుకింగ్ విజయవంతమైంది",
        "cancelled": "బుకింగ్ రద్దు చేయబడింది",
        "nobooking": "బుకింగ్స్ లేవు",
        "needcode": "దయచేసి స్టేషన్ కోడ్ ఇవ్వండి",
        "already": "మీరు ఇప్పటికే బుక్ చేసారు",
        "invalid": "చెల్లని లాగిన్",
        "exists": "యూజర్ ఇప్పటికే ఉన్నారు",
        "regsuccess": "రిజిస్ట్రేషన్ విజయవంతం",
        "help": "EV బుకింగ్ మరియు రద్దులో సహాయం చేయగలను.",
        "logout": "లాగ్అవుట్"
    },

    "Kannada": {

        "title": "EV AI ಚಾಟ್‌ಬಾಟ್",
        "login": "ಲಾಗಿನ್",
        "register": "ನೋಂದಣಿ",
        "username": "ಬಳಕೆದಾರ ಹೆಸರು",
        "password": "ಪಾಸ್ವರ್ಡ್",
        "placeholder": "ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ಟೈಪ್ ಮಾಡಿ...",
        "booked": "ಬುಕಿಂಗ್ ಯಶಸ್ವಿಯಾಗಿದೆ",
        "cancelled": "ಬುಕಿಂಗ್ ರದ್ದು ಮಾಡಲಾಗಿದೆ",
        "nobooking": "ಯಾವುದೇ ಬುಕ್ಕಿಂಗ್ ಇಲ್ಲ",
        "needcode": "ದಯವಿಟ್ಟು ಸ್ಟೇಷನ್ ಕೋಡ್ ನೀಡಿ",
        "already": "ನೀವು ಈಗಾಗಲೇ ಬುಕ್ ಮಾಡಿದ್ದಾರೆ",
        "invalid": "ಅಮಾನ್ಯ ಲಾಗಿನ್",
        "exists": "ಬಳಕೆದಾರ ಈಗಾಗಲೇ ಇದ್ದಾರೆ",
        "regsuccess": "ನೋಂದಣಿ ಯಶಸ್ವಿಯಾಗಿದೆ",
        "help": "EV ಬುಕ್ಕಿಂಗ್ ಮತ್ತು ರದ್ದತಿಯಲ್ಲಿ ಸಹಾಯ ಮಾಡಬಹುದು.",
        "logout": "ಲಾಗ್‌ಔಟ್"
    },

    "Malayalam": {

        "title": "EV AI ചാറ്റ്ബോട്ട്",
        "login": "ലോഗിൻ",
        "register": "രജിസ്റ്റർ",
        "username": "ഉപയോക്തൃനാമം",
        "password": "പാസ്‌വേഡ്",
        "placeholder": "നിങ്ങളുടെ സന്ദേശം ടൈപ്പ് ചെയ്യുക...",
        "booked": "ബുക്കിംഗ് വിജയകരം",
        "cancelled": "ബുക്കിംഗ് റദ്ദാക്കി",
        "nobooking": "ബുക്കിംഗുകൾ ഇല്ല",
        "needcode": "സ്റ്റേഷൻ കോഡ് നൽകുക",
        "already": "നിങ്ങൾ ഇതിനകം ബുക്ക് ചെയ്തിട്ടുണ്ട്",
        "invalid": "തെറ്റായ ലോഗിൻ",
        "exists": "ഉപയോക്താവ് ഇതിനകം ഉണ്ട്",
        "regsuccess": "രജിസ്ട്രേഷൻ വിജയകരം",
        "help": "EV ബുക്കിംഗിലും റദ്ദാക്കലിലും സഹായിക്കാം.",
        "logout": "ലോഗൗട്ട്"
    },

    "Sanskrit": {

        "title": "EV AI संवादयन्त्रः",
        "login": "प्रवेशः",
        "register": "पञ्जीकरणम्",
        "username": "उपयोक्तृनाम",
        "password": "गुप्तशब्दः",
        "placeholder": "स्वसन्देशं लिखतु...",
        "booked": "आरक्षणं सफलम्",
        "cancelled": "आरक्षणं निरस्तम्",
        "nobooking": "आरक्षणानि न सन्ति",
        "needcode": "स्टेशन कोड ददातु",
        "already": "भवता पूर्वमेव आरक्षितम्",
        "invalid": "अवैधः प्रवेशः",
        "exists": "उपयोक्ता पूर्वमेव अस्ति",
        "regsuccess": "पञ्जीकरणं सफलम्",
        "help": "EV आरक्षणे निरस्तीकरणे च साहाय्यं कर्तुं शक्नोमि।",
        "logout": "निर्गच्छ"
    }
}

# =========================
# LANGUAGE DISPLAY
# =========================
language_options = {
    "English": "English",
    "Tamil": "தமிழ்",
    "Hindi": "हिन्दी",
    "Telugu": "తెలుగు",
    "Kannada": "ಕನ್ನಡ",
    "Malayalam": "മലയാളം",
    "Sanskrit": "संस्कृतम्"
}

# =========================
# SESSION
# =========================
if "logged_in" not in st.session_state:
    st.session_state.logged_in = False

if "messages" not in st.session_state:
    st.session_state.messages = []

if "language" not in st.session_state:
    st.session_state.language = "English"

# =========================
# LANGUAGE SELECT
# =========================
if not st.session_state.logged_in:

    selected_display = st.sidebar.selectbox(
        "Language",
        list(language_options.values())
    )

    selected_language = next(
        key for key, value in language_options.items()
        if value == selected_display
    )

    st.session_state.language = selected_language

lang = translations[st.session_state.language]

# =========================
# LOGIN / REGISTER
# =========================
if not st.session_state.logged_in:

    st.title(lang["title"])

    menu = st.sidebar.selectbox(
        "Menu",
        [lang["login"], lang["register"]]
    )

    username = st.text_input(
        lang["username"]
    )

    password = st.text_input(
        lang["password"],
        type="password"
    )

    # REGISTER
    if menu == lang["register"]:

        if st.button(lang["register"]):

            try:

                cursor.execute("""
                INSERT INTO users(
                    username,
                    password,
                    language
                )
                VALUES(?,?,?)
                """, (

                    username,
                    password,
                    selected_language
                ))

                conn.commit()

                st.success(
                    lang["regsuccess"]
                )

            except:

                st.error(
                    lang["exists"]
                )

    # LOGIN
    else:

        if st.button(lang["login"]):

            cursor.execute("""
            SELECT * FROM users
            WHERE username=? AND password=?
            """, (

                username,
                password
            ))

            user = cursor.fetchone()

            if user:

                st.session_state.logged_in = True
                st.session_state.username = username

                # USE CURRENTLY SELECTED LANGUAGE
                st.session_state.language = selected_language

                st.rerun()

            else:

                st.error(
                    lang["invalid"]
                )

# =========================
# CHATBOT
# =========================
else:

    lang = translations[
        st.session_state.language
    ]

    st.title(lang["title"])

    st.sidebar.success(
        st.session_state.username
    )

    if st.sidebar.button(lang["logout"]):

        st.session_state.logged_in = False
        st.session_state.messages = []

        st.rerun()

    # DISPLAY CHAT
    for message in st.session_state.messages:

        with st.chat_message(message["role"]):

            st.markdown(message["content"])

    # CHAT INPUT
    user_input = st.chat_input(
        lang["placeholder"]
    )

    if user_input:

        st.session_state.messages.append({

            "role": "user",
            "content": user_input
        })

        with st.chat_message("user"):
            st.markdown(user_input)

        response = ""

        text = user_input.lower()

        # SHOW BOOKINGS
        if "show" in text or "காட்டு" in text:

            cursor.execute("""
            SELECT
                station_code,
                station_name,
                city,
                price,
                status
            FROM bookings
            WHERE username=?
            """, (
                st.session_state.username,
            ))

            rows = cursor.fetchall()

            if rows:

                temp = ""

                for row in rows:

                    temp += f"""
Station Code: {row[0]}

Station Name: {row[1]}

City: {row[2]}

Price: ₹{row[3]}

Status: {row[4]}

-------------------------
"""

                response = temp

            else:

                response = lang["nobooking"]

        # CANCEL BOOKING
        elif (
            "cancel" in text or
            "ரத்து" in text
        ):

            cursor.execute("""
            UPDATE bookings
            SET status='Cancelled'
            WHERE username=?
            AND status='Booked'
            """, (
                st.session_state.username,
            ))

            conn.commit()

            response = lang["cancelled"]

        # BOOKING
        elif (

            "book" in text or
            "பதிவு" in text or
            "बुक" in text or
            "బుక్" in text or
            "ಬುಕ್" in text or
            "ബുക്ക്" in text or
            "आरक्ष" in text

        ):

            station_match = re.search(
                r'ev\d+',
                text
            )

            if station_match:

                station_code = station_match.group().upper()

                found = None

                for s in stations:

                    if s["code"] == station_code:
                        found = s
                        break

                if found:

                    cursor.execute("""
                    SELECT * FROM bookings
                    WHERE username=?
                    AND status='Booked'
                    """, (
                        st.session_state.username,
                    ))

                    already = cursor.fetchone()

                    if already:

                        response = lang["already"]

                    else:

                        cursor.execute("""
                        INSERT INTO bookings(
                            username,
                            station_code,
                            station_name,
                            city,
                            booking_time,
                            price,
                            status
                        )
                        VALUES(?,?,?,?,?,?,?)
                        """, (

                            st.session_state.username,
                            found["code"],
                            found["name"],
                            found["city"],
                            str(datetime.now()),
                            found["price"],
                            "Booked"
                        ))

                        conn.commit()

                        response = f"""
{lang["booked"]}

Station Code: {found["code"]}

Station Name: {found["name"]}

City: {found["city"]}

Price: ₹{found["price"]}
"""

                else:

                    response = "Station not found"

            else:

                response = lang["needcode"]

        else:

            response = lang["help"]

        st.session_state.messages.append({

            "role": "assistant",
            "content": response
        })

        with st.chat_message("assistant"):
            st.markdown(response)
