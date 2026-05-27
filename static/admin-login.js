function setAdminLoginMessage(text, isSuccess){
    const message = document.getElementById("admin_login_msg")
    if(!message){
        return
    }
    message.innerText = text
    message.classList.toggle("success", Boolean(isSuccess))
    message.classList.toggle("error", Boolean(text) && !isSuccess)
}

async function adminLoginSubmit(event){
    event.preventDefault()
    const username = document.getElementById("admin_login_username").value.trim()
    const password = document.getElementById("admin_login_pass").value
    if(!username || !password){
        setAdminLoginMessage("Enter admin username and password.", false)
        return
    }
    if(username.includes("@")){
        setAdminLoginMessage("Use your admin username, not a customer email address.", false)
        return
    }

    setAdminLoginMessage("Checking admin credentials…", false)
    try{
        const response = await fetch("/auth/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ username: username, password: password })
        })
        const data = await response.json().catch(function(){
            return {}
        })
        if(response.status === 422){
            setAdminLoginMessage(
                "App server needs a restart. In the terminal press Ctrl+C, then run: python -m uvicorn backend:app --reload --host 127.0.0.1 --port 8000",
                false
            )
            return
        }
        if(!response.ok || !data.success){
            setAdminLoginMessage(
                data.message || "Invalid admin username or password. Customer accounts cannot sign in here.",
                false
            )
            return
        }
        window.location.href = data.redirect || "/admin.html"
    }
    catch(error){
        setAdminLoginMessage("Unable to sign in. Please try again.", false)
    }
}

document.getElementById("admin_login_form").addEventListener("submit", adminLoginSubmit)

async function redirectIfAdminSession(){
    try{
        const response = await fetch("/admin/session", { credentials: "same-origin" })
        if(!response.ok){
            return
        }
        window.location.replace("/admin.html")
    }
    catch(error){
        console.log(error)
    }
}

redirectIfAdminSession()

const params = new URLSearchParams(window.location.search)
if(params.get("denied") === "1"){
    setAdminLoginMessage("Sign in with your admin username and password. Customer logins are not accepted.", false)
}
if(params.get("logout") === "1"){
    setAdminLoginMessage("Signed out of admin console.", true)
}
