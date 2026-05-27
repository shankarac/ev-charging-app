function formatBookingTimeEnglish(value, slotCount, intervalMinutes) {
    if (!value) {
        return ""
    }

    const normalized = String(value).trim()
    const count = Math.max(1, Math.min(Number(slotCount) || 1, 2))
    const interval = Math.max(15, Number(intervalMinutes) || 30)
    const parsed = new Date(normalized.length === 16 ? `${normalized}:00` : normalized)
    if (Number.isNaN(parsed.getTime())) {
        return normalized.replace("T", " at ")
    }

    const startLabel = parsed.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    })

    if (count <= 1) {
        return startLabel
    }

    const end = new Date(parsed.getTime() + count * interval * 60 * 1000)
    const endLabel = end.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    })
    return `${startLabel} – ${endLabel}`
}
