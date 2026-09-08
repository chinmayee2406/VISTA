// Dummy customer data (will be loaded/saved from localStorage)
let customers = [];
let activeCustomerId = null;
let recognition = null;
let isListening = false;

// --- Persistence Functions ---
function loadCustomersFromLocalStorage() {
    const storedCustomers = localStorage.getItem('agentCustomers');
    if (storedCustomers) {
        customers = JSON.parse(storedCustomers);
    }
}

function saveCustomersToLocalStorage() {
    localStorage.setItem('agentCustomers', JSON.stringify(customers));
}

// On load
window.addEventListener('DOMContentLoaded', function() {
    loadCustomersFromLocalStorage(); // Load existing customers first

    renderCustomerList();
    initializeSpeechRecognition();
    updateAgentName();
    
    // Global Enter key listener
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            const chatInput = document.getElementById('chat-input');
            if (chatInput && chatInput.value.trim() !== '') {
                sendMessage();
                event.preventDefault();
            }
        }
    });

    // Inject / replace our style overrides for speech icon
    const STYLE_ID = "agent-speech-style";
    let styleTag = document.getElementById(STYLE_ID);
    if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = STYLE_ID;
        document.head.appendChild(styleTag);
    }

    styleTag.textContent = `
    /* ——— Mic button tweaks ——— */
    .speech-icon-container {
        background: white !important;
        border: 2px solid #1abc9c !important;
        box-shadow: none !important;
        color: #1abc9c !important;
        padding: 0.6rem !important;
        border-radius: 12px !important;
        transition: all 0.2s ease;
    }

    .speech-icon svg {
        width: 20px !important;
        height: 20px !important;
    }

    .speech-text {
        font-size: 0.8rem !important;
        color: #1abc9c !important;
    }

    /* Listening (active) state */
    .speech-icon-container.listening {
        background: #ffecec !important;
        border-color: #e74c3c !important;
        color: #e74c3c !important;
    }`;

    // --- Global space-bar shortcut (outside the text input) ---
    // Only attach once
    if (!window.__speechSpaceHandlerAttached) {
        window.addEventListener("keydown", function (event) {
            if (
                event.code === "Space" &&
                !event.repeat &&
                document.activeElement.id !== "chat-input"
            ) {
                const speechBtn = document.querySelector(".speech-icon-container");
                if (speechBtn && typeof toggleSpeechRecognition === "function") {
                    event.preventDefault();
                    toggleSpeechRecognition();
                }
            }
        });
        window.__speechSpaceHandlerAttached = true;
    }

    // Start polling for ongoing messages and active customer chats from backend
    pollAgentDashboardData();
});

function renderCustomerList() {
    const list = document.getElementById('customer-list');
    list.innerHTML = '';
    if (customers.length === 0) {
        const emptyMsg = document.createElement('li');
        emptyMsg.className = 'empty-list-msg';
        emptyMsg.textContent = 'No recent chats.';
        list.appendChild(emptyMsg);
        return;
    }
    customers.forEach(cust => {
        const li = document.createElement('li');
        li.className = cust.id === activeCustomerId ? 'active' : '';
        li.onclick = () => switchCustomer(cust.id);
        li.innerHTML = `
            <div class=\"customer-avatar\">${cust.avatar}</div>
            <div class=\"customer-info\">\n                <div class=\"customer-name\">${cust.name}</div>\n                <div class=\"customer-last-message\">${cust.lastMessage}</div>\n            </div>\n            <div class=\"customer-time\">${cust.lastTime}</div>\n            ${cust.unread > 0 ? `<span class='unread-badge'>${cust.unread}</span>` : ''}
        `;
        list.appendChild(li);
    });
}

async function switchCustomer(id) {
    if (!id) return;
    activeCustomerId = id;
    renderCustomerList();
    const customer = customers.find(c => c.id === id);
    if (customer) {
        customer.unread = 0; // Mark messages as read when switching to customer
        customer.currentMsgIndex = -1; // Reset message index for navigation
        document.getElementById('active-customer-name').innerHTML = `<span class='chat-icon'>${customer.avatar}</span> ${customer.name}`;
        
        // Fetch chat history for this customer from the backend
        try {
            const response = await fetch('http://127.0.0.1:5000/get_agent_messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_id: customer.id })
            });
            const data = await response.json();
            const fetchedMessages = data.messages || [];
            customer.messages = fetchedMessages; // Update local customer object with fetched messages
            renderChatMessages(customer.messages); // Render the fetched messages
            
            // Speak the last customer message
            const lastMsg = [...customer.messages].reverse().find(m => m.sender === 'user');
            if (lastMsg) {
                speak(`${customer.name} says: ${lastMsg.text}`);
            }

        } catch (error) {
            console.error('Error fetching chat history for agent:', error);
            renderChatMessages([]); // Render empty if fetch fails
        }
        saveCustomersToLocalStorage(); // Save changes to unread count
    }
}

function renderChatMessages(messages) {
    const chat = document.getElementById('chat-messages');
    chat.innerHTML = '';
    if (!messages || messages.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-chat-msg';
        emptyMsg.textContent = 'No messages yet.';
        chat.appendChild(emptyMsg);
        return;
    }
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.sender}-message`;
        let avatar = '';
        if (msg.sender === 'agent') avatar = '<div class="message-avatar">👨‍💼</div>';
        if (msg.sender === 'user') avatar = `<div class="message-avatar">${customers.find(c=>c.id===activeCustomerId)?.avatar || 'U'}</div>`;
        if (msg.sender === 'bot') avatar = '<div class="message-avatar">🤖</div>'; // Add bot avatar for agent view
        div.innerHTML = `
            ${avatar}
            <div class="message-content">
                <p>${msg.text}</p>
                <span class="message-time">${msg.time}</span>
            </div>
        `;
        chat.appendChild(div);
    });
    chat.scrollTop = chat.scrollHeight;
}

// Restored updateAgentName to its original purpose
function updateAgentName() {
    const nameElement = document.getElementById('agent-name');
    if (nameElement) {
        // You might fetch the agent's name from localStorage or a login session
        const agentName = localStorage.getItem('agentName') || 'Agent';
        nameElement.textContent = `Welcome, ${agentName}!`;
    }
}

function logout() {
    localStorage.removeItem('currentAgent');
    if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance('Logged out successfully.');
        window.speechSynthesis.speak(utter);
    }
    window.location.href = 'index.html';
}

function initializeSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = true; // Set to true for continuous listening
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onstart = function() {
            isListening = true;
            updateSpeechIcon(true);
        };
        recognition.onresult = function(event) {
            const transcript = event.results[event.results.length - 1][0].transcript; // Get the latest transcript
            document.getElementById('chat-input').value = transcript;
        };
        recognition.onerror = function(event) {
            console.error('Speech recognition error:', event.error);
            // Replace alert with a custom message box
            // alert('Speech recognition failed. Please try again.');
        };
        recognition.onend = function() {
            // This event fires when recognition stops, which can happen for various reasons
            // If continuous is true, it might restart automatically.
            // We only want to explicitly turn off when toggleSpeechRecognition is called.
        };
    }
}

function toggleSpeechRecognition() {
    if (!recognition) {
        // Replace alert with a custom message box
        alert('Speech recognition is not supported in your browser.');
        return;
    }
    if (isListening) {
        recognition.stop();
        isListening = false;
        updateSpeechIcon(false);
    } else {
        try {
            recognition.start();
            isListening = true;
            updateSpeechIcon(true);
        } catch (error) {
            console.error('Speech recognition start error:', error);
            // Replace alert with a custom message box
            alert('Speech recognition failed to start. Please try again.');
            isListening = false;
            updateSpeechIcon(false);
        }
    }
}

function updateSpeechIcon(listening) {
    const speechContainer = document.querySelector('.speech-icon-container');
    const speechText = document.querySelector('.speech-text');
    if (speechContainer && speechText) { // Ensure elements exist
        if (listening) {
            speechContainer.classList.add('listening');
            speechText.textContent = 'Listening...';
        } else {
            speechContainer.classList.remove('listening');
            speechText.textContent = 'Click to speak';
        }
    }
}

function handleChatInput(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const messageText = input.value.trim();
    if (messageText === '') return;

    if (!activeCustomerId) {
        alert('Please select a customer to send a message.'); // Use custom modal later
        return;
    }

    const customer = customers.find(c => c.id === activeCustomerId);
    if (!customer) return;

    const now = new Date();
    const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const agentMessage = { sender: 'agent', text: messageText, time };

    // Add message to agent's local customer object for immediate display
    customer.messages.push(agentMessage);
    customer.lastMessage = messageText;
    customer.lastTime = time;

    input.value = ''; // Clear input field
    renderChatMessages(customer.messages); // Update agent's chat display
    renderCustomerList(); // Update customer list (last message, time)

    // Send message to backend for translation and routing to customer
    try {
        const response = await fetch('http://127.0.0.1:5000/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: messageText,
                is_agent_chat: true,
                sender_type: 'agent',
                customer_id: customer.id // Pass customer ID for backend to identify chat and corresponding session
            })
        });
        const data = await response.json();
        console.log("Message sent to customer via backend:", data);
    } catch (error) {
        console.error('Error sending message to customer via backend:', error);
        // Optionally add an error message to the agent's chat
    }
    saveCustomersToLocalStorage(); // Save agent's customers list after sending a message
}


let agentPollingInterval = null;

async function pollAgentDashboardData() {
    if (agentPollingInterval) {
        clearInterval(agentPollingInterval);
    }

    agentPollingInterval = setInterval(async () => {
        try {
            // 1. Fetch active customer chats for the sidebar list
            const activeChatsResponse = await fetch('http://127.0.0.1:5000/get_active_customer_chats', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            const activeChatsData = await activeChatsResponse.json();
            const fetchedActiveChats = activeChatsData.chats || [];

            // Update the local 'customers' array based on fetched active chats
            let updatedCustomers = [];
            let customerIdsInFetchedChats = new Set();

            fetchedActiveChats.forEach(fetchedChat => {
                customerIdsInFetchedChats.add(fetchedChat.id);
                let existingCustomer = customers.find(c => c.id === fetchedChat.id);
                if (existingCustomer) {
                    // Update existing customer details
                    existingCustomer.lastMessage = fetchedChat.lastMessage;
                    existingCustomer.lastTime = fetchedChat.lastTime;
                    existingCustomer.unread = fetchedChat.unread;
                    updatedCustomers.push(existingCustomer);
                } else {
                    // Add new customer
                    updatedCustomers.push({
                        id: fetchedChat.id,
                        name: fetchedChat.name,
                        avatar: fetchedChat.avatar,
                        lastMessage: fetchedChat.lastMessage,
                        lastTime: fetchedChat.lastTime,
                        messages: [], // Messages will be fetched separately when switching
                        unread: fetchedChat.unread,
                        currentMsgIndex: -1 // Initialize for navigation
                    });
                }
            });

            // Remove customers who are no longer active
            customers = updatedCustomers.filter(c => customerIdsInFetchedChats.has(c.id));
            
            // If activeCustomerId is no longer in the list, clear it
            if (activeCustomerId && !customers.some(c => c.id === activeCustomerId)) {
                activeCustomerId = null;
                document.getElementById('active-customer-name').innerHTML = `<span class='chat-icon'>👤</span> Select Customer`;
                renderChatMessages([]); // Clear chat window
            }

            renderCustomerList();
            saveCustomersToLocalStorage(); // Persist the updated customer list structure

            // 2. If a customer is active, fetch their specific chat messages
            if (activeCustomerId) {
                const response = await fetch('http://127.0.0.1:5000/get_agent_messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customer_id: activeCustomerId })
                });
                const data = await response.json();
                const fetchedMessages = data.messages || [];

                const activeCustomerObj = customers.find(c => c.id === activeCustomerId);
                if (activeCustomerObj) {
                    // Compare and add only new messages to avoid re-rendering entire chat unnecessarily
                    const currentMessagesCount = activeCustomerObj.messages.length;
                    if (fetchedMessages.length > currentMessagesCount) {
                        const newMessages = fetchedMessages.slice(currentMessagesCount);
                        newMessages.forEach(msg => {
                            activeCustomerObj.messages.push(msg);
                        });
                        renderChatMessages(activeCustomerObj.messages); // Only re-render if there are new messages
                    }
                }
            }

        } catch (error) {
            console.error('Error polling agent dashboard data:', error);
        }
    }, 2000); // Poll every 2 seconds for dashboard updates
}


function generateCustomerResponse(agentMessage) {
    // This function is no longer used as responses come from backend
    const message = agentMessage.toLowerCase();
    if (message.includes('hello') || message.includes('hi')) {
        return "Hello! I need help with my account balance.";
    } else if (message.includes('balance') || message.includes('account')) {
        return "Yes, I'd like to know my current balance and recent transactions.";
    } else if (message.includes('transfer') || message.includes('send money')) {
        return "I want to transfer money to another account. How do I do that?";
    } else if (message.includes('statement') || message.includes('transaction')) {
        return "Can you help me download my monthly statement?";
    } else if (message.includes('password') || message.includes('reset')) {
        return "I forgot my password. How can I reset it?";
    } else if (message.includes('help') || message.includes('support')) {
        return "Thank you for your help! You've been very helpful.";
    } else {
        return "I understand. Can you please explain that in more detail?";
    }
}

// Quick action functions (keeping them as is, but notes that alerts should be replaced)
function showCustomerInfo() {
    alert('Customer Information:\n\nName: John Doe\nAccount: 1234567890\nBalance: ₹25,000.00\nStatus: Active');
}

function showTransactions() {
    alert('Recent Transactions:\n\n1. ATM Withdrawal - ₹2,000 (Today)\n2. Online Payment - ₹1,500 (Yesterday)\n3. Salary Credit - ₹50,000 (2 days ago)');
}

function showSupport() {
    alert('Support Tools Available:\n\n• Account Verification\n• Transaction History\n• Password Reset\n• Card Blocking\n• Complaint Registration');
}

function showReports() {
    alert('Reports Available:\n\n• Daily Transaction Report\n• Monthly Statement\n• Customer Activity Report\n• Support Ticket Summary');
}

// --- Voice Synthesis Helper ---
function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stop any ongoing speech
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1;
        utter.pitch = 1;
        utter.lang = 'en-US'; // Agent always speaks English
        window.speechSynthesis.speak(utter);
    }
}

// --- Announce unread messages ---
function announceUnreadMessages() {
    const unreadList = customers.filter(c => c.unread > 0);
    if (unreadList.length === 0) {
        speak('You have no unread messages.');
    } else {
        let msg = `You have ${unreadList.length} chats with unread messages. `;
        unreadList.forEach(c => {
            msg += `${c.name} has ${c.unread} unread message${c.unread > 1 ? 's' : ''}. `;
        });
        speak(msg);
    }
}

// --- Keyboard shortcut for voice (V key) ---
document.addEventListener('keydown', function(e) {
    if (e.key.toLowerCase() === 'v' && !e.repeat && document.activeElement.id !== 'chat-input') {
        announceUnreadMessages();
    }
});

// --- Key navigation for messages and customers ---
document.addEventListener('keydown', function(e) {
    if (document.activeElement.id === 'chat-input') return;
    // Next customer message (N)
    if (e.key.toLowerCase() === 'n') {
        readNextCustomerMessage();
    }
    // Previous customer message (P)
    if (e.key.toLowerCase() === 'p') {
        readPrevCustomerMessage();
    }
    // Next customer (ArrowDown or J)
    if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
        moveCustomer(1);
    }
    // Previous customer (ArrowUp or K)
    if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
        moveCustomer(-1);
    }
    // Logout (Escape)
    if (e.key === 'Escape') {
        logout();
    }
});

function readNextCustomerMessage() {
    const customer = customers.find(c => c.id === activeCustomerId);
    if (!customer || !customer.messages) return;
    const msgs = customer.messages.filter(m => m.sender === 'user');
    if (msgs.length === 0) return;
    customer.currentMsgIndex = Math.min(customer.currentMsgIndex + 1, msgs.length - 1);
    const msg = msgs[customer.currentMsgIndex];
    if (msg) speak(`${customer.name} says: ${msg.text}`);
}

function readPrevCustomerMessage() {
    const customer = customers.find(c => c.id === activeCustomerId);
    if (!customer || !customer.messages) return;
    const msgs = customer.messages.filter(m => m.sender === 'user');
    if (msgs.length === 0) return;
    customer.currentMsgIndex = Math.max(customer.currentMsgIndex - 1, 0);
    const msg = msgs[customer.currentMsgIndex];
    if (msg) speak(`${customer.name} says: ${msg.text}`);
}

function moveCustomer(direction) {
    if (customers.length === 0) return;
    const idx = customers.findIndex(c => c.id === activeCustomerId);
    let newIdx = idx + direction;
    if (newIdx < 0) newIdx = customers.length - 1;
    if (newIdx >= customers.length) newIdx = 0;
    switchCustomer(customers[newIdx].id);
}
