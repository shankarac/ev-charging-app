function formatBookingTimeEnglish(value) {
    if (!value) {
        return ""
    }

    const normalized = String(value).trim()
    const parsed = new Date(normalized.length === 16 ? `${normalized}:00` : normalized)
    if (Number.isNaN(parsed.getTime())) {
        return normalized.replace("T", " at ")
    }

    return parsed.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    })
}
