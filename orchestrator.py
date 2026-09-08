"""Lightweight transaction-query orchestration for VISTA.

This module intentionally uses keyword matching only; it does not load an AI
model or require GPU support.
"""


class OrchestratorAgent:
    """Identify transaction requests and prepare a processing confirmation."""

    def is_transactional(self, message, lang="en"):
        """Return whether *message* appears to be about banking transactions.

        ``lang`` is retained for compatibility with callers that pass the
        detected language. Keyword matching is currently English-only.
        """
        if not message:
            return False

        message = message.lower()
        transaction_keywords = (
            "transaction",
            "transactions",
            "transaction history",
            "payment",
            "payments",
            "transfer",
            "transfers",
            "refund",
            "refunds",
            "withdrawal",
            "withdrawals",
            "deposit",
            "deposits",
            "debited",
            "credited",
            "charged",
            "money deducted",
            "money transferred",
            "failed transaction",
            "wrong transaction",
            "bank statement",
            "statement",
        )
        return any(keyword in message for keyword in transaction_keywords)

    def orchestrate_transaction(
        self,
        original_query,
        lang,
        customer_id,
        transaction_month,
    ):
        """Return the current confirmation for a transaction-related query."""
        return (
            f"I received your transaction request: '{original_query}'. "
            f"Customer ID: {customer_id}. "
            f"Transaction month: {transaction_month}. "
            "Your request is ready to be processed."
        )


# Object imported by app.py.
orchestrator_agent = OrchestratorAgent()
