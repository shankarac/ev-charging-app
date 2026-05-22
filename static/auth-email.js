let allowedEmailDomains = []

function normalizeEmailInput(value){
    return String(value || "").trim().toLowerCase().replace(/\.+$/, "")
}

function emailFormatError(email){
    if(!email){
        return "Enter a valid email address (e.g. name@company.com)."
    }
    if(email.includes("..")){
        return "Email cannot contain consecutive dots (..)."
    }
    if(email.includes("\\")){
        return "Email cannot contain backslash (\\)."
    }
    if(!/^[a-zA-Z0-9@._%+-]+$/.test(email)){
        return "Email contains invalid symbols. Use only letters, numbers, @, ., _, %, +, or -."
    }
    if(email.split("@").length !== 2 || email.startsWith("@") || email.endsWith("@")){
        return "Enter a valid email address (e.g. name@company.com)."
    }

    const parts = email.split("@")
    const local = parts[0]
    const domain = parts[1]
    if(local.startsWith(".") || local.endsWith(".")){
        return "Email cannot start or end the name part with a dot."
    }
    if(domain.startsWith(".") || domain.endsWith(".")){
        return "Email cannot start or end the domain with a dot."
    }
    return ""
}

function isValidEmailFormat(value){
    const email = normalizeEmailInput(value)
    if(emailFormatError(email)){
        return false
    }
    return /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,62}[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(email)
}

function isAllowedRegistrationEmail(value){
    const email = normalizeEmailInput(value)
    if(!isValidEmailFormat(email)){
        return false
    }
    if(!allowedEmailDomains.length){
        return true
    }
    const domain = email.split("@")[1]
    return allowedEmailDomains.includes(domain)
}

function allowedEmailDomainsMessage(){
    if(!allowedEmailDomains.length){
        return "Any valid email address can register (Gmail, Outlook, college email, etc.)."
    }
    return `Only ${allowedEmailDomains.map(function(domain){
        return "@" + domain
    }).join(", ")} email addresses are allowed.`
}

function emailValidationMessage(value){
    const email = normalizeEmailInput(value)
    const formatMessage = emailFormatError(email)
    if(formatMessage){
        return formatMessage
    }
    if(!isValidEmailFormat(email)){
        return "Enter a valid email address (e.g. name@gmail.com)."
    }
    if(!isAllowedRegistrationEmail(email)){
        return allowedEmailDomainsMessage()
    }
    return ""
}

async function loadEmailPolicy(){
    try{
        const response = await fetch("/auth/email-policy")
        if(!response.ok){
            return
        }
        const data = await response.json()
        if(Array.isArray(data.allowed_domains)){
            allowedEmailDomains = data.allowed_domains
        }
    }
    catch(error){
        console.log(error)
    }
}
