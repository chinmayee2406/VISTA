// =========================  SAMPLE DEMO CREDENTIALS  =========================
const customerCredentialsList = [
    { username: "pavan21",   password: "sai20" },
    { username: "taruni20",  password: "taruni20" },
    { username: "ankitha23", password: "ankitha2356" },
    { username: "mahesh09",  password: "babu29" }
];

const agentCredentials    = { username: "agent456",    password: "vista2024" };

// In‑memory store of newly‑registered customers (demo only – replace with DB)
let registeredUsers = [];

// ============================  UTILITIES  ====================================
// Detect whether the device has a platform authenticator (fingerprint/face/PIN)
async function isBiometricAvailable() {
    if (!window.PublicKeyCredential) return false;
    try   { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch { return false; }
}

// Convenience helpers
function show(el) { el.style.display = "";    }
function hide(el) { el.style.display = "none"; }

// ============================  TAB HANDLING  ================================
function switchTab(tab) {
    hide(document.getElementById("customer-login"));
    hide(document.getElementById("agent-login"));
    hide(document.getElementById("register"));
    //This removes the "active" class from all tab buttons (identified by the .tab-btn class), ensuring no old tab remains highlighted.
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    show(document.getElementById(`${tab}-login`));
    const btn = document.querySelector(`[onclick="switchTab('${tab}')"]`);
    if (btn) btn.classList.add("active");
}

function switchAgentLoginType(type) {
    const pwdForm  = document.getElementById("agent-password-form");
    const bioForm  = document.getElementById("agent-biometric-form");

    const pwdBtn = document.querySelector(`[onclick="switchAgentLoginType('password')"]`);
    const bioBtn = document.querySelector(`[onclick="switchAgentLoginType('biometric')"]`);

    if (type === "password") {
        show(pwdForm);  hide(bioForm);//hides the password.
        pwdBtn.classList.add("active");  bioBtn.classList.remove("active");
    } else {
        hide(pwdForm);  show(bioForm);
        bioBtn.classList.add("active");  pwdBtn.classList.remove("active");

        // 👆  Only keep biometric active if the device supports it
        isBiometricAvailable().then(ok => { if (!ok) switchAgentLoginType("password"); });
    }
}

// =====================  CUSTOMER / AGENT  HANDLERS  ==========================
function handleCustomerLogin(e) {
    e.preventDefault();

    const username = document.getElementById("customer-username").value;
    const password = document.getElementById("customer-password").value;

    // Check newly‑registered users first
    const regUser = registeredUsers.find(u => (u.username === username || u.email === username || u.mobile === username) && u.password === password);
    if (regUser) {//The user's info is saved to localStorage under the key "currentCustomer" as a JSON string.
        localStorage.setItem("currentCustomer", JSON.stringify({ name: regUser.name, username: regUser.username, email: regUser.email, customerId: regUser.username }));
        window.location.href = "customer-dashboard.html";
        return;
    }

    // Then demo credentials
    const demoUser = customerCredentialsList.find(u => u.username === username && u.password === password);
    if (demoUser) {
        localStorage.setItem("currentCustomer", JSON.stringify({
            name: demoUser.username,
            username: demoUser.username,
            email: `${demoUser.username}@vistabank.com`,
            customerId: demoUser.username
        }));
        window.location.href = "customer-dashboard.html";
    } else {
        alert("Invalid credentials. Please check your username and password.");
    }
}

function handleAgentLogin(e) {
    e.preventDefault();
    const username = document.getElementById("agent-username").value;
    const password = document.getElementById("agent-password").value;

    if (username === agentCredentials.username && password === agentCredentials.password) {
        localStorage.setItem("currentAgent", JSON.stringify({ name: "Demo Agent", username: agentCredentials.username, role: "Support Agent" }));
        window.location.href = "agent-dashboard.html";
    } else {
        alert("Invalid credentials. Please try again.");
    }
}

async function handleBiometricLogin() {
    try {
        const bioText = document.querySelector(".biometric-text");
        const bioBtn  = document.querySelector(".biometric-btn");

        bioText.textContent = "Authenticating...";
        bioBtn.disabled = true;

        // Simulate delay for demo purposes
        await new Promise(res => setTimeout(res, 1500));

        // --- SUCCESS ---
        bioText.textContent = "Authentication successful!";
        if ("speechSynthesis" in window) {//If the browser supports speech synthesis, it will say "Authentication successful" out loud.
            const u = new SpeechSynthesisUtterance("Authentication successful");
            window.speechSynthesis.speak(u);
        }

        setTimeout(() => {
            localStorage.setItem("currentAgent", JSON.stringify({ name: "Biometric Agent", username: "bio_agent", role: "Support Agent" }));
            window.location.href = "agent-dashboard.html";
        }, 500);

    } catch (err) {
        alert("Biometric authentication failed. Please try again or use password login.");
        document.querySelector(".biometric-text").textContent = "Place your finger on the sensor";
        document.querySelector(".biometric-btn").disabled = false;
    }
}

function handleRegistration(e) {
    e.preventDefault();

    const name     = document.getElementById("reg-name").value;
    const email    = document.getElementById("reg-email").value;
    const mobile   = document.getElementById("reg-mobile").value;
    const dob      = document.getElementById("reg-dob").value;
    const password = document.getElementById("reg-password").value;
    const confirm  = document.getElementById("reg-confirm-password").value;

    if (password !== confirm) { alert("Passwords do not match!"); return; }
    if (registeredUsers.some(u => u.mobile === mobile)) { alert("Mobile number already registered!"); backToLogin(); return; }
    if (registeredUsers.some(u => u.email  === email )) { alert("Email already registered!");  backToLogin(); return; }

    const username = name.split(" ")[0].toLowerCase() + mobile.slice(-3);
    registeredUsers.push({ name, email, mobile, dob, password, username });

    alert(`Registration successful!\n\nYour login credentials:\nUsername: ${username}\nPassword: ${password}\n\nPlease save these credentials for future login.`);
    document.getElementById("reg-name").value = "";
    document.getElementById("reg-email").value = "";
    document.getElementById("reg-mobile").value = "";
    document.getElementById("reg-dob").value = "";
    document.getElementById("reg-password").value = "";
    document.getElementById("reg-confirm-password").value = "";
    backToLogin();
}

// =====================  SPACE‑BAR  SHORTCUT HANDLER  =========================
function spaceBarHandler(e) {
    if (e.code !== "Space") return;

    const agentLogin = document.getElementById("agent-login");
    const bioForm    = document.getElementById("agent-biometric-form");
    const bioBtn     = document.querySelector(".biometric-btn");

    const biometricVisible = agentLogin && agentLogin.style.display !== "none" &&
                             bioForm    && bioForm.style.display    !== "none";

    // 1️⃣  If we are on the biometric screen → trigger authentication
    if (biometricVisible) {
        e.preventDefault();
        if (!bioBtn.disabled) handleBiometricLogin();
        return;
    }

    // 2️⃣  Otherwise (username/password inputs) → start speech recognition
    if (agentRecognition && (document.activeElement.id === "agent-username" || document.activeElement.id === "agent-password")) {
        e.preventDefault();
        agentRecognition.start();
    }
}

// ===================  SPEECH‑TO‑TEXT SET‑UP (unchanged)  ====================
let agentRecognition = null; // needs to be global for the shortcut above
function setupSpeechRecognition() {//This function initializes the speech recognition setup.
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;

    agentRecognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    agentRecognition.continuous     = false;// stops listening after a single speech input (not ongoing).
    agentRecognition.interimResults = false;//only final results are captured, not guesses while the user is still speaking.
    agentRecognition.lang           = "en-US";
    agentRecognition.onresult = evt => {
        const transcript = evt.results[0][0].transcript;
        const active = document.activeElement;
        if (active && (active.id === "agent-username" || active.id === "agent-password")) {
            active.value = transcript;
        }
    };
}

// =============================  INIT  =======================================
window.addEventListener("load", () => {//Runs the following code once the full page (HTML + CSS + images) is loaded.
    // 🔹  Default to Agent → Biometric on first load
    switchTab("agent");
    switchAgentLoginType("biometric");

    setupSpeechRecognition();
    document.addEventListener("keydown", spaceBarHandler);
});

// Expose needed functions for inline HTML attributes
window.switchTab              = switchTab;
window.switchAgentLoginType   = switchAgentLoginType;
window.handleCustomerLogin    = handleCustomerLogin;
window.handleAgentLogin       = handleAgentLogin;
window.handleBiometricLogin   = handleBiometricLogin;
window.handleRegistration     = handleRegistration;
window.backToLogin            = backToLogin; // existing helper from original HTML
