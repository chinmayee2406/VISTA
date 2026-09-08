// Get customer data from localStorage or URL parameters
let currentCustomer = null;
let currentSessionId = localStorage.getItem('chatSessionId') || null; // Store session ID

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Get customer data from localStorage
    const customerData = localStorage.getItem('currentCustomer');
    if (customerData) {
        currentCustomer = JSON.parse(customerData);
        updateCustomerName();
    } else {
        // Fallback to URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const customerName = urlParams.get('name');
        // For demonstration, assign a simple customerId if not present
        const customerId = urlParams.get('id') || 'cust_' + Math.random().toString(36).substr(2, 9); 
        if (customerName) {
            currentCustomer = { name: customerName, customerId: customerId };
            localStorage.setItem('currentCustomer', JSON.stringify(currentCustomer)); // Persist it
            updateCustomerName();
        } else {
            // If no name or ID, set a default customer
            currentCustomer = { name: 'Guest Customer', customerId: customerId };
            localStorage.setItem('currentCustomer', JSON.stringify(currentCustomer));
            updateCustomerName();
        }
    }
    // Display welcome message in chatbox with customer id
    if (currentCustomer && currentCustomer.customerId) {
        addMessage(`Welcome, ID: ${currentCustomer.customerId}!`, 'bot');
    } else {
        addMessage('Welcome!', 'bot');
    }

    // Initialize chat history from local storage
    loadChatHistory();
    // Start polling for agent messages (now from backend)
    pollAgentMessages();

    // Add a welcome message after a short delay
    setTimeout(() => {
        if (!isChatOpen) {
            const chatIcon = document.querySelector('.chatbot-icon');
            chatIcon.style.animation = 'pulse 2s infinite';
        }
    }, 3000);
});

function updateCustomerName(){
    const nameElement = document.getElementById('user-name');
    if (currentCustomer && currentCustomer.customerId) {
        // Show customer id in welcome text
        nameElement.textContent = `Welcome, ${currentCustomer.customerId}!`;
    }
}

// Logout function
function logout() {
    localStorage.removeItem('currentCustomer');
    localStorage.removeItem('chatSessionId'); // Clear session ID on logout
    // Optionally, inform backend that session is ending
    // fetch('http://127.0.0.1:5000/end_session', { method: 'POST', body: JSON.stringify({ session_id: currentSessionId }) });
    window.location.href = 'index.html';
}

// Quick action functions
function showFeature(feature) {
    const messages = {
        balance: 'Your current balance is ₹25,000.00',
        transfer: 'Transfer money feature will be available soon.',
        statements: 'Your monthly statements are being prepared.',
        payments: 'Bill payment feature will be available soon.'
    };

    // Replace alert with a custom message box or modal for better UX
    // For now, keeping alert as per original code, but it's good to note for future improvements.
    alert(messages[feature] || 'This feature is coming soon!');
}

// Chatbot functionality
let isChatOpen = false;
let recognition = null;

// Initialize speech recognition
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US'; // Default to English, can be dynamic later

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        document.getElementById('chat-input').value = transcript;
    };

    recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        // Replace alert with a custom message box
        alert('Speech recognition failed. Please try typing your message.');
    };
}

function toggleChatbot() {
    const chatWindow = document.getElementById('chat-window');
    isChatOpen = !isChatOpen;

    if (isChatOpen) {
        chatWindow.classList.add('active');
        // Load chat history when opening the chat
        loadChatHistory();
        // Restart polling when chat is opened
        pollAgentMessages();
    } else {
        chatWindow.classList.remove('active');
        // Stop polling when chat is closed
        if (chatPollingInterval) {
            clearInterval(chatPollingInterval);
            chatPollingInterval = null;
        }
    }
}

function handleChatInput(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// === [START] CUSTOMER QUERY TRACKING ===
let customerQueryCount = 0;
let connectedToAgent = false; // This flag will now indicate if the customer is in an active chat session with an agent
let popupTimeoutId = null; // To store the timeout ID for the popup

function showAgentContactPrompt() {
    console.log("showAgentContactPrompt called. Current customerQueryCount:", customerQueryCount);
    const box = document.getElementById('agent-contact-box');
    const content = document.getElementById('agent-contact-content');
    box.style.display = 'block';
    content.innerHTML = `
        <p>Would you like to connect to an agent via <b>Contact</b> or <b>Message</b>?</p>
        <div style="margin-top:1rem; display:flex; gap:1rem;">
            <button id="contact-agent-btn" style="background:#27ae60; color:#fff; border:none; border-radius:5px; padding:0.5rem 1.2rem; cursor:pointer;">Contact</button>
            <button id="message-agent-btn" style="background:#2980b9; color:#fff; border:none; border-radius:5px; padding:0.5rem 1.2rem; cursor:pointer;">Message</button>
        </div>
    `;

    // Clear any existing timeout before setting a new one
    if (popupTimeoutId) {
        clearTimeout(popupTimeoutId);
    }

    // Set a timeout for the popup response (e.g., 15 seconds)
    popupTimeoutId = setTimeout(() => {
        console.log("Popup timeout triggered.");
        if (box.style.display === 'block' && !connectedToAgent) {
            console.log("Customer did not respond to popup. Sending bot follow-up and resuming bot flow.");
            box.style.display = 'none'; // Auto-dismiss the popup
            const botResponse = "It seems you're busy. I'll continue to assist you. Please let me know if you still wish to connect to an agent.";
            const botMessage = { sender: 'bot', text: botResponse, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
            addMessage(botResponse, 'bot');
            saveChatHistory(botMessage);
            customerQueryCount = 0; // Reset query count to allow immediate bot interaction
        }
    }, 15000); // 15 seconds timeout

    setTimeout(() => {
        document.getElementById('contact-agent-btn').onclick = function() {
            console.log("User clicked 'Contact'. Bot flow continues.");
            if (popupTimeoutId) clearTimeout(popupTimeoutId); // Clear timeout on interaction
            let number = '9' + Math.floor(100000000 + Math.random() * 900000000).toString();
            content.innerHTML = `<p>Please call this number to contact an agent:</p><div style='font-size:1.5rem; font-weight:bold; color:#27ae60; margin:1rem 0;'>${number}</div>`;
            customerQueryCount = 0; // Reset query count to allow immediate bot interaction
            // Do NOT set connectedToAgent = true;
        };
        document.getElementById('message-agent-btn').onclick = async function() {
            console.log("User clicked 'Message'. Connecting to agent.");
            if (popupTimeoutId) clearTimeout(popupTimeoutId); // Clear timeout on interaction
            box.style.display = 'none';
            connectedToAgent = true;
            customerQueryCount = 0; // Reset query count as we are now connected to an agent
            addMessage('Connected to the agent. You can now send messages.', 'bot');
            
            // Send initial chat history to backend for agent
            await sendChatHistoryToAgent();
            // Start polling for agent messages (now from backend)
            pollAgentMessages();
        };
        // Add event listener for the close button on the agent contact box
        const closeButton = document.querySelector('#agent-contact-box button[onclick*="display=\'none\'"]');
        if (closeButton) {
            closeButton.onclick = function() {
                console.log("User clicked 'Close' on popup. Bot flow continues.");
                if (popupTimeoutId) clearTimeout(popupTimeoutId); // Clear timeout on interaction
                document.getElementById('agent-contact-box').style.display='none';
                customerQueryCount = 0; // Reset query count to allow immediate bot interaction
            };
        }
    }, 100);
}

// Function to get the unique customer ID for the current customer
function getCustomerId() {
    // Ensure currentCustomer and customerId exist, otherwise return a placeholder
    return currentCustomer && currentCustomer.customerId ? currentCustomer.customerId : 'anonymous_customer';
}


// Function to load chat history from localStorage (still used for initial display)
function loadChatHistory() {
    const chatKey = `chat_customer_${getCustomerId()}`; // Use customer ID for key
    const chat = JSON.parse(localStorage.getItem(chatKey) || '[]');
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = ''; // Clear existing messages
    chat.forEach(msg => {
        addMessage(msg.text, msg.sender, false); // Add messages without saving again
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to save chat history to localStorage (still used for local persistence)
function saveChatHistory(message) {
    const chatKey = `chat_customer_${getCustomerId()}`; // Use customer ID for key
    const chat = JSON.parse(localStorage.getItem(chatKey) || '[]');
    chat.push(message);
    localStorage.setItem(chatKey, JSON.stringify(chat));
}

// Function to send the entire chat history to the agent when connecting
async function sendChatHistoryToAgent() {
    const chatKey = `chat_customer_${getCustomerId()}`;
    const chatHistory = JSON.parse(localStorage.getItem(chatKey) || '[]');
    const customerName = currentCustomer && currentCustomer.name ? currentCustomer.name : (currentCustomer && currentCustomer.customerId ? currentCustomer.customerId : 'Customer');
    const customerId = getCustomerId();

    try {
        const response = await fetch('http://127.0.0.1:5000/initiate_agent_chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                customer_name: customerName,
                customer_id: customerId,
                chat_history: chatHistory
            })
        });
        const data = await response.json();
        console.log("Agent chat initiation response:", data);
    } catch (error) {
        console.error('Error initiating agent chat:', error);
        addMessage('Failed to connect to agent. Please try again.', 'bot');
    }
}


async function sendMessage() {
    const input = document.getElementById('chat-input');
    const messageText = input.value.trim();
    if (messageText === '') return;

    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage = { sender: 'user', text: messageText, time: currentTime };

    addMessage(messageText, 'user'); // Display message in customer's chat
    saveChatHistory(userMessage); // Save user message to local storage

    input.value = ''; // Clear input field

    const agentContactBox = document.getElementById('agent-contact-box');

    // If the agent contact box is currently displayed, do nothing and wait for user choice
    if (agentContactBox.style.display === 'block') {
        console.log("sendMessage: Agent contact box is open. Waiting for user action on popup. Message NOT sent to bot API.");
        return;
    }

    if (connectedToAgent) {
        console.log("sendMessage: Connected to agent. Sending message to backend for agent.");
        try {
            const response = await fetch('http://127.0.0.1:5000/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageText,
                    session_id: currentSessionId,
                    is_agent_chat: true,
                    sender_type: 'customer',
                    customer_id: getCustomerId() // Pass customer ID for backend to identify chat
                })
            });
            const data = await response.json();
            console.log("Message sent to agent via backend:", data);
        } catch (error) {
            console.error('Error sending message to agent via backend:', error);
            addMessage("Failed to send message to agent. Please try again.", 'bot');
        }
        return;
    }

    // If not connected to agent, proceed with bot interaction logic
    customerQueryCount++;
    console.log("sendMessage: Customer Query Count incremented to:", customerQueryCount);

    if (customerQueryCount >= 5) {
        console.log("sendMessage: Customer Query Count >= 5. Showing agent contact prompt. This message will NOT be sent to bot API.");
        setTimeout(showAgentContactPrompt, 100);
        return;
    }

    // If customerQueryCount is less than 5 (and popup is not active),
    // then send message to Flask API for bot response.
    try {
        console.log("sendMessage: Sending message to Flask API for bot response. Message:", messageText);
        const response = await fetch('http://127.0.0.1:5000/chat', { // Flask API endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: messageText, session_id: currentSessionId }) // Send session_id
        });

        const data = await response.json();
        const botResponse = data.response || "I'm sorry, I couldn't get a response from the server.";
        
        // Update session ID if a new one was generated by the backend
        if (data.session_id && data.session_id !== currentSessionId) {
            currentSessionId = data.session_id;
            localStorage.setItem('chatSessionId', currentSessionId);
            console.log("sendMessage: New session ID received:", currentSessionId);
        }

        const botMessage = { sender: 'bot', text: botResponse, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        addMessage(botResponse, 'bot');
        saveChatHistory(botMessage); // Save bot message to local storage

    } catch (error) {
        console.error('sendMessage: Error fetching bot response:', error);
        const errorMessage = "I'm having trouble connecting right now. Please try again later or connect to an agent.";
        const botMessage = { sender: 'bot', text: errorMessage, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        addMessage(errorMessage, 'bot');
        saveChatHistory(botMessage); // Save error message to local storage
    }
}

function addMessage(text, sender, save = true) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageDiv.innerHTML = `
        <div class="message-avatar">${sender === 'bot' ? '&#128125;' : 'U'}</div>
        <div class="message-content">
            <p>${text}</p>
            <span class="message-time">${currentTime}</span>
        </div>
    `;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    if (save) {
        const messageToSave = { sender: sender, text: text, time: currentTime };
        saveChatHistory(messageToSave);
    }
}

let chatPollingInterval = null;

async function pollAgentMessages() {
    // Only poll if a customer is identified and chat is open
    if (!currentCustomer || !currentCustomer.customerId || !isChatOpen) {
        if (chatPollingInterval) {
            clearInterval(chatPollingInterval);
            chatPollingInterval = null;
        }
        return;
    }

    // Clear any existing polling interval to prevent duplicates
    if (chatPollingInterval) {
        clearInterval(chatPollingInterval);
    }

    chatPollingInterval = setInterval(async () => {
        if (!connectedToAgent) {
            // If not connected to agent, stop polling for agent messages
            clearInterval(chatPollingInterval);
            chatPollingInterval = null;
            return;
        }

        try {
            const response = await fetch('http://127.0.0.1:5000/get_customer_messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId })
            });
            const data = await response.json();
            const fetchedMessages = data.messages || [];

            const chatKey = `chat_customer_${getCustomerId()}`;
            let currentLocalChat = JSON.parse(localStorage.getItem(chatKey) || '[]');

            // Filter out bot messages from local chat if they are not from agent
            // This is to avoid issues where bot messages might be mixed with agent messages
            const filteredLocalChat = currentLocalChat.filter(msg => msg.sender !== 'bot' || (msg.sender === 'bot' && msg.is_agent_message));

            // Find new messages by comparing fetched messages with current local chat
            // Assuming messages have unique text + time + sender for simplicity
            const newMessages = fetchedMessages.filter(fetchedMsg => {
                return !filteredLocalChat.some(localMsg => 
                    localMsg.text === fetchedMsg.text && localMsg.time === fetchedMsg.time && localMsg.sender === fetchedMsg.sender
                );
            });

            if (newMessages.length > 0) {
                newMessages.forEach(msg => {
                    // Add message to UI and local storage
                    addMessage(msg.text, msg.sender, true); // Save to local storage
                });
                console.log("New agent messages received and displayed for customer.");
            }

        } catch (error) {
            console.error('Error polling agent messages:', error);
        }
    }, 1000); // Poll every second
}


function generateBotResponse(userMessage) {
    // This function is now deprecated as we are using the Flask API
    // Kept for reference but will not be called in the new setup.
    const message = userMessage.toLowerCase();

    // Simple response logic
    if (message.includes('hello') || message.includes('hi')) {
        return "Hello! How can I assist you with your banking needs today?";
    } else if (message.includes('balance') || message.includes('account')) {
        return "Your current account balance is ₹25,000.00. Would you like to know more about your transactions?";
    } else if (message.includes('transfer') || message.includes('send money')) {
        return "To transfer money, please use our mobile app or visit your nearest branch. I can help you with the process.";
    } else if (message.includes('statement') || message.includes('transaction')) {
        return "You can download your account statements from the dashboard or I can help you request one.";
    } else if (message.includes('password') || message.includes('reset')) {
        return "For password reset, please visit our website or call our customer service at 1800-VISTA-BANK.";
    } else if (message.includes('help') || message.includes('support')) {
        return "I'm here to help! You can ask me about account balance, transfers, statements, or any banking queries.";
    } else if (message.includes('thank')) {
        return "You're welcome! Is there anything else I can help you with?";
    } else {
        return "I understand you're asking about '" + userMessage + "'. Let me connect you with a customer service representative for better assistance.";
    }
}

function startSpeechRecognition() {
    if (!recognition) {
        // Replace alert with a custom message box
        alert('Speech recognition is not supported in your browser. Please type your message.');
        return;
    }

    try {
        recognition.start();
        const speechBtn = document.querySelector('.speech-btn');
        speechBtn.textContent = '&#128266;'; // Microphone with waves icon
        speechBtn.style.background = '#e74c3c';

        setTimeout(() => {
            speechBtn.textContent = '&#127908;'; // Microphone icon
            speechBtn.style.background = '#3498db';
        }, 3000);
    } catch (error) {
        console.error('Speech recognition error:', error);
        // Replace alert with a custom message box
        alert('Speech recognition failed. Please try typing your message.');
    }
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        // Replace alert with a custom message box
        alert('File size should be less than 5MB.');
        return;
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
        // Replace alert with a custom message box
        alert('Please upload only images (JPEG, PNG, GIF), PDF, or text files.');
        return;
    }

    // Add file message to chat
    const fileName = file.name;
    addMessage(`&#128190; Uploaded: ${fileName}`, 'user');

    // Simulate bot response
    setTimeout(() => {
        addMessage(`I've received your file "${fileName}". Our team will review it and get back to you soon.`, 'bot');
    }, 1000);

    // Clear the file input
    event.target.value = '';
}

// Add CSS animation for chat icon
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(style);

