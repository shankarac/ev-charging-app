function isValidEmail(value){
    return isValidEmailFormat(value)
}

function signInWithGoogle(){
    window.location.href = "/auth/google/start"
}

function setLoginMessage(text, isSuccess){
    const message = document.getElementById("login_msg")
    if(!message){
        return
    }
    message.innerText = text
    message.classList.toggle("success", Boolean(isSuccess))
    message.classList.toggle("error", Boolean(text) && !isSuccess)
}

async function loginWithEmail(){
    try{
        const emailInput = document.getElementById("login_email")
        const passwordInput = document.getElementById("login_pass")
        if(!emailInput || !passwordInput){
            setLoginMessage("Login form failed to load. Please refresh the page.", false)
            return
        }

        const email = normalizeEmailInput(emailInput.value)
        const password = passwordInput.value

        if(!email || !password){
            setLoginMessage("Fill all fields", false)
            return
        }

        const emailError = emailValidationMessage(email)
        if(emailError){
            setLoginMessage(emailError, false)
            return
        }

        setLoginMessage("Signing in...", false)
        const response = await fetch("/login-email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
                email: email,
                password: password
            })
        })

        let data = {}
        try{
            data = await response.json()
        }
        catch(parseError){
            setLoginMessage("Server error during login. Please try again.", false)
            console.log(parseError)
            return
        }

        if(!response.ok && data.detail){
            const detail = Array.isArray(data.detail)
                ? data.detail.map(function(item){ return item.msg || item }).join(", ")
                : data.detail
            setLoginMessage(detail, false)
            return
        }

        const isSuccess = data.success === true || data.message === "Login successful"
        setLoginMessage(data.message || "Login failed.", isSuccess)

        if(isSuccess){
            localStorage.setItem("username", data.username || email.split("@")[0])
            localStorage.setItem("language", "english")

            setTimeout(function(){
                window.location.href = "/dashboard.html"
            }, 500)
        }
    }
    catch(error){
        console.error(error)
        setLoginMessage(
            error && error.message
                ? `Login error: ${error.message}`
                : "Cannot reach server. Open http://127.0.0.1:8000/login.html and ensure the app is running.",
            false
        )
    }
}

window.loginWithEmail = loginWithEmail
window.signInWithGoogle = signInWithGoogle

window.onload = async function(){
    const loginForm = document.getElementById("login_form")
    if(loginForm){
        loginForm.addEventListener("submit", function(event){
            event.preventDefault()
            loginWithEmail()
        })
    }

    const loginButton = document.getElementById("login_btn")
    if(loginButton){
        loginButton.addEventListener("click", function(event){
            event.preventDefault()
            loginWithEmail()
        })
    }

    await loadEmailPolicy()
    const params = new URLSearchParams(window.location.search)
    const oauth = params.get("oauth")
    const message = document.getElementById("login_msg")
    if(oauth === "failed"){
        const reason = params.get("reason")
        if(reason === "google_not_configured"){
            message.innerText = "Google sign-in is not configured yet"
        }else if(reason === "state_mismatch"){
            message.innerText = "Google sign-in failed: session mismatch"
        }else if(reason === "token_exchange_failed"){
            message.innerText = "Google sign-in failed: token exchange error"
        }else if(reason === "userinfo_failed"){
            message.innerText = "Google sign-in failed: could not load Google profile"
        }else if(reason === "missing_email"){
            message.innerText = "Google sign-in failed: email not returned"
        }else if(reason === "email_domain_not_allowed"){
            message.innerText = emailValidationMessage(document.getElementById("login_email")?.value || "") || allowedEmailDomainsMessage()
        }else{
            message.innerText = "Google sign-in failed"
        }
    }
}
