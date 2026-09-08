from flask import Flask, request, jsonify
from flask_cors import CORS

from database import init_db, save_conversation
from language import TranslationError, detect_language, translate_text
from semantic_search import get_best_answer
from orchestrator import orchestrator_agent

import uuid
import time


# ============================================================
# FLASK APP
# ============================================================

app = Flask(__name__)
CORS(app)

app.secret_key = "super_secret_key"

# Initialize SQLite database
init_db()


# ============================================================
# IN-MEMORY SESSION STORAGE
# ============================================================

session_contexts = {}

# Customer ID -> list of chat messages
agent_customer_chats = {}


# ============================================================
# HELPER
# ============================================================

def create_session_context():
    return {
        "awaiting_customer_id": False,
        "awaiting_transaction_month": False,
        "user_query_for_orchestration": None,
        "customer_id": None,
        "transaction_month": None,
        "is_connected_to_agent": False,
        "customer_original_lang": "en",
        "customer_name": "Customer"
    }


# ============================================================
# MAIN CHAT ENDPOINT
# ============================================================

@app.route("/chat", methods=["POST"])
def chat():

    data = request.get_json(silent=True) or {}

    user_message = data.get("message")
    session_id = data.get("session_id")
    is_agent_chat = data.get("is_agent_chat", False)
    sender_type = data.get("sender_type")
    customer_id_for_agent = data.get("customer_id")

    # --------------------------------------------------------
    # Create session ID
    # --------------------------------------------------------

    if not session_id:
        session_id = str(uuid.uuid4())

    # --------------------------------------------------------
    # Initialize session
    # --------------------------------------------------------

    if session_id not in session_contexts:
        session_contexts[session_id] = create_session_context()

    current_context = session_contexts[session_id]

    # --------------------------------------------------------
    # Validate message
    # --------------------------------------------------------

    if not user_message:
        return jsonify({
            "error": "No message provided",
            "session_id": session_id
        }), 400

    current_time = time.strftime("%H:%M")


    # ========================================================
    # AGENT-CUSTOMER CHAT
    # ========================================================

    if is_agent_chat:

        target_customer_id = (
            customer_id_for_agent
            if sender_type == "agent"
            else current_context.get("customer_id")
        )

        if not target_customer_id:
            return jsonify({
                "error": "Customer ID missing for agent chat",
                "session_id": session_id
            }), 400

        if target_customer_id not in agent_customer_chats:
            agent_customer_chats[target_customer_id] = []


        # ====================================================
        # CUSTOMER -> AGENT
        # ====================================================

        if sender_type == "customer":

            detected_lang = detect_language(user_message)

            current_context["customer_original_lang"] = detected_lang
            current_context["customer_id"] = target_customer_id
            current_context["is_connected_to_agent"] = True

            # Translate customer message to English
            translated_to_english = translate_text(
                user_message,
                source=detected_lang,
                target="en"
            )

            message_obj = {
                "sender": "user",
                "original_text": user_message,
                "translated_text": translated_to_english,
                "lang": detected_lang,
                "timestamp": current_time,
                "read_by_agent": False
            }

            agent_customer_chats[target_customer_id].append(message_obj)

            # Save to SQLite
            save_conversation(
                session_id=session_id,
                message=user_message,
                response=translated_to_english,
                language=detected_lang,
                sender_type="customer",
                customer_id=target_customer_id
            )

            print(
                f"Customer -> Agent | "
                f"{detected_lang}: {user_message} -> "
                f"{translated_to_english}"
            )

            return jsonify({
                "status": "Message sent to agent",
                "session_id": session_id
            })


        # ====================================================
        # AGENT -> CUSTOMER
        # ====================================================

        elif sender_type == "agent":

            customer_lang = current_context.get(
                "customer_original_lang",
                "en"
            )

            translated_to_customer_lang = translate_text(
                user_message,
                source="en",
                target=customer_lang
            )

            message_obj = {
                "sender": "agent",
                "original_text": user_message,
                "translated_text": translated_to_customer_lang,
                "lang": "en",
                "timestamp": current_time
            }

            agent_customer_chats[target_customer_id].append(message_obj)

            # Save to SQLite
            save_conversation(
                session_id=session_id,
                message=user_message,
                response=translated_to_customer_lang,
                language=customer_lang,
                sender_type="agent",
                customer_id=target_customer_id
            )

            print(
                f"Agent -> Customer | "
                f"en: {user_message} -> "
                f"{translated_to_customer_lang}"
            )

            return jsonify({
                "status": "Message sent to customer",
                "session_id": session_id
            })


        else:

            return jsonify({
                "error": "Invalid sender type for agent chat",
                "session_id": session_id
            }), 400


    # ========================================================
    # CUSTOMER -> BOT
    # ========================================================

    else:

        try:

            # ------------------------------------------------
            # DETECT CUSTOMER LANGUAGE
            # ------------------------------------------------

            lang = detect_language(user_message)

            current_context["customer_original_lang"] = lang

            print(f"Detected language: {lang}")


            # =================================================
            # WAITING FOR CUSTOMER ID
            # =================================================

            if current_context["awaiting_customer_id"]:

                current_context["customer_id"] = user_message.strip()
                current_context["awaiting_customer_id"] = False
                current_context["awaiting_transaction_month"] = True

                bot_response = (
                    "Thank you. Please enter the transaction month "
                    "(e.g., 2024-05):"
                )


            # =================================================
            # WAITING FOR TRANSACTION MONTH
            # =================================================

            elif current_context["awaiting_transaction_month"]:

                current_context["transaction_month"] = user_message.strip()
                current_context["awaiting_transaction_month"] = False

                original_query = current_context[
                    "user_query_for_orchestration"
                ]

                customer_id = current_context["customer_id"]
                transaction_month = current_context["transaction_month"]


                if original_query and customer_id and transaction_month:

                    print("[Orchestrator Activated]")

                    orchestration_result = (
                        orchestrator_agent.orchestrate_transaction(
                            original_query,
                            lang,
                            customer_id,
                            transaction_month
                        )
                    )

                    bot_response = orchestration_result

                else:

                    bot_response = (
                        "I seem to have lost track of our conversation. "
                        "Please start your query again."
                    )


                # Reset transaction state
                current_context["awaiting_customer_id"] = False
                current_context["awaiting_transaction_month"] = False
                current_context["user_query_for_orchestration"] = None


            # =================================================
            # NEW QUERY
            # =================================================

            else:

                # ------------------------------------------------
                # TRANSACTION QUERY
                # ------------------------------------------------

                if orchestrator_agent.is_transactional(
                    user_message,
                    lang
                ):

                    print("[Transactional Intent Detected]")

                    current_context["awaiting_customer_id"] = True
                    current_context["user_query_for_orchestration"] = (
                        user_message
                    )

                    bot_response = (
                        "I can help with that! "
                        "Please provide your Customer ID:"
                    )


                # ------------------------------------------------
                # NORMAL BANKING QUERY
                # ------------------------------------------------

                else:

                    # Translate non-English query to English
                    search_query = user_message

                    if lang != "en":

                        search_query = translate_text(
                            user_message,
                            source=lang,
                            target="en"
                        )

                    print(
                        f"Search query: {search_query}"
                    )


                    # Semantic search happens in English
                    result = get_best_answer(
                        search_query,
                        source_lang="en"
                    )


                    bot_response = result.get(
                        "translated_answer",
                        "I'm sorry, I couldn't find an answer."
                    )


                    # Translate answer back to customer language
                    if lang != "en":

                        bot_response = translate_text(
                            bot_response,
                            source="en",
                            target=lang
                        )


                    print(
                        f"Final response ({lang}): "
                        f"{bot_response}"
                    )


                    # Clean context
                    current_context["awaiting_customer_id"] = False
                    current_context["awaiting_transaction_month"] = False
                    current_context["user_query_for_orchestration"] = None


            # =================================================
            # SAVE CUSTOMER-BOT CONVERSATION TO SQLITE
            # =================================================

            save_conversation(
                session_id=session_id,
                message=user_message,
                response=bot_response,
                language=lang,
                sender_type="customer",
                customer_id=current_context.get("customer_id")
            )


            # =================================================
            # RETURN RESPONSE
            # =================================================

            return jsonify({
                "response": bot_response,
                "session_id": session_id,
                "language": lang
            })


        # =====================================================
        # TRANSLATION ERROR
        # =====================================================

        except TranslationError as e:

            app.logger.exception("Translation failed")

            return jsonify({
                "error": "translation_failed",
                "detail": str(e),
                "session_id": session_id
            }), 502


        # =====================================================
        # GENERAL ERROR
        # =====================================================

        except Exception as e:

            app.logger.exception("Error processing message")

            return jsonify({
                "error": "internal_server_error",
                "detail": str(e),
                "session_id": session_id
            }), 500


# ============================================================
# GET AGENT MESSAGES
# ============================================================

@app.route("/get_agent_messages", methods=["POST"])
def get_agent_messages():

    data = request.get_json(silent=True) or {}

    customer_id = data.get("customer_id")

    if not customer_id:
        return jsonify({
            "error": "Customer ID required"
        }), 400

    messages_for_agent = []

    if customer_id in agent_customer_chats:

        for msg in agent_customer_chats[customer_id]:

            if msg["sender"] == "user":

                messages_for_agent.append({
                    "sender": "user",
                    "text": msg["translated_text"],
                    "time": msg["timestamp"]
                })

                msg["read_by_agent"] = True


            elif msg["sender"] == "agent":

                messages_for_agent.append({
                    "sender": "agent",
                    "text": msg["original_text"],
                    "time": msg["timestamp"]
                })


            elif msg["sender"] == "bot":

                messages_for_agent.append({
                    "sender": "bot",
                    "text": msg["translated_text"],
                    "time": msg["timestamp"]
                })


    return jsonify({
        "messages": messages_for_agent
    })


# ============================================================
# GET CUSTOMER MESSAGES
# ============================================================

@app.route("/get_customer_messages", methods=["POST"])
def get_customer_messages():

    data = request.get_json(silent=True) or {}

    session_id = data.get("session_id")

    if not session_id:
        return jsonify({
            "error": "Session ID required"
        }), 400

    if session_id not in session_contexts:
        return jsonify({
            "error": "Session not found"
        }), 404

    customer_id = session_contexts[session_id].get("customer_id")

    if not customer_id:
        return jsonify({
            "error": "Customer ID not found for session"
        }), 400

    messages_for_customer = []

    if customer_id in agent_customer_chats:

        for msg in agent_customer_chats[customer_id]:

            if msg["sender"] == "agent":

                messages_for_customer.append({
                    "sender": "bot",
                    "text": msg["translated_text"],
                    "time": msg["timestamp"]
                })


            elif msg["sender"] == "user":

                messages_for_customer.append({
                    "sender": "user",
                    "text": msg["original_text"],
                    "time": msg["timestamp"]
                })


            elif msg["sender"] == "bot":

                messages_for_customer.append({
                    "sender": "bot",
                    "text": msg["original_text"],
                    "time": msg["timestamp"]
                })


    return jsonify({
        "messages": messages_for_customer
    })


# ============================================================
# INITIATE AGENT CHAT
# ============================================================

@app.route("/initiate_agent_chat", methods=["POST"])
def initiate_agent_chat():

    data = request.get_json(silent=True) or {}

    session_id = data.get("session_id")
    customer_name = data.get("customer_name")
    customer_id = data.get("customer_id")
    chat_history = data.get("chat_history")


    if not session_id or not customer_name or not customer_id or not chat_history:

        return jsonify({
            "error": "Missing data for agent chat initiation"
        }), 400


    if session_id not in session_contexts:

        session_contexts[session_id] = create_session_context()


    session_contexts[session_id]["is_connected_to_agent"] = True
    session_contexts[session_id]["customer_id"] = customer_id
    session_contexts[session_id]["customer_name"] = customer_name


    if customer_id not in agent_customer_chats:

        agent_customer_chats[customer_id] = []


    for msg in chat_history:

        if msg["sender"] == "user":

            detected_lang = detect_language(msg["text"])

            session_contexts[session_id][
                "customer_original_lang"
            ] = detected_lang


            translated_to_english = translate_text(
                msg["text"],
                source=detected_lang,
                target="en"
            )


            agent_customer_chats[customer_id].append({
                "sender": "user",
                "original_text": msg["text"],
                "translated_text": translated_to_english,
                "lang": detected_lang,
                "timestamp": msg["time"],
                "read_by_agent": False
            })


        elif msg["sender"] == "bot":

            agent_customer_chats[customer_id].append({
                "sender": "bot",
                "original_text": msg["text"],
                "translated_text": msg["text"],
                "lang": "en",
                "timestamp": msg["time"]
            })


        elif msg["sender"] == "agent":

            agent_customer_chats[customer_id].append({
                "sender": "agent",
                "original_text": msg["text"],
                "translated_text": msg["text"],
                "lang": "en",
                "timestamp": msg["time"]
            })


    print(
        f"Agent chat initiated for customer {customer_id}"
    )


    return jsonify({
        "status": "Agent chat initiated",
        "session_id": session_id
    })


# ============================================================
# ACTIVE CUSTOMER CHATS
# ============================================================

@app.route("/get_active_customer_chats", methods=["GET"])
def get_active_customer_chats():

    active_chats_summary = []


    for customer_id, messages in agent_customer_chats.items():

        customer_name = customer_id


        for sess_id, context in session_contexts.items():

            if context.get("customer_id") == customer_id:

                customer_name = context.get(
                    "customer_name",
                    customer_id
                )

                break


        last_message = messages[-1] if messages else None

        last_message_text = "No messages"
        last_message_time = ""


        if last_message:

            if last_message["sender"] == "user":

                last_message_text = last_message["translated_text"]


            elif last_message["sender"] == "agent":

                last_message_text = last_message["original_text"]


            elif last_message["sender"] == "bot":

                last_message_text = last_message["translated_text"]


            last_message_time = last_message["timestamp"]


        unread_count = sum(
            1
            for msg in messages
            if msg["sender"] == "user"
            and not msg.get("read_by_agent", False)
        )


        active_chats_summary.append({
            "id": customer_id,
            "name": customer_name,
            "avatar": "👤",
            "lastMessage": last_message_text,
            "lastTime": last_message_time,
            "unread": unread_count
        })


    return jsonify({
        "chats": active_chats_summary
    })


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    app.run(
        debug=True,
        port=5000
    )