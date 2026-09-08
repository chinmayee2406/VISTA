from sentence_transformers import SentenceTransformer
import pandas as pd
import numpy as np


MODEL_NAME = "all-MiniLM-L6-v2"

EMBEDDINGS_PATH = "models/question_embeddings.npy"
DATA_PATH = "models/cleaned_banking_data.csv"

CONFIDENCE_THRESHOLD = 0.50


# Load model once
model = SentenceTransformer(
    MODEL_NAME,
    device="cpu"
)

# Load saved data
df = pd.read_csv(DATA_PATH)
embeddings = np.load(EMBEDDINGS_PATH)


def get_top_matches(query, top_k=3):
    """
    Return the top-k most semantically similar
    banking questions.
    """

    # Convert query into embedding
    query_embedding = model.encode(
        query,
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    # Calculate cosine similarity
    scores = np.dot(embeddings, query_embedding)

    # Get indices of top matches
    top_indices = np.argsort(scores)[::-1][:top_k]

    results = []

    for index in top_indices:

        score = float(scores[index])

        results.append({
            "question": df.iloc[index]["question"],
            "answer": df.iloc[index]["answer"],
            "score": score
        })

    return results


def get_best_answer(query, source_lang="en"):
    """
    Return the best semantic-search answer.

    source_lang is accepted for compatibility with app.py.
    Translation is handled separately by language.py.
    """

    results = get_top_matches(query, top_k=3)

    best_match = results[0]

    if best_match["score"] < CONFIDENCE_THRESHOLD:
        return {
            "question": None,
            "answer": "I couldn't find a reliable answer to your question.",
            "translated_answer": "I couldn't find a reliable answer to your question.",
            "score": best_match["score"],
            "top_matches": results
        }

    return {
        "question": best_match["question"],
        "answer": best_match["answer"],
        "translated_answer": best_match["answer"],
        "score": best_match["score"],
        "top_matches": results
    }


if __name__ == "__main__":

    test_queries = [
        "I forgot my ATM PIN and cannot remember it",
        "My ATM PIN is locked",
        "I forgot my debit card PIN"
    ]

    for query in test_queries:

        result = get_best_answer(query)

        print("\n" + "=" * 70)
        print("USER QUERY:", query)
        print("BEST MATCH:", result["question"])
        print("BEST SCORE:", round(result["score"], 4))
        print("ANSWER:", result["answer"])

        print("\nTOP 3 MATCHES:")

        for i, match in enumerate(result["top_matches"], start=1):

            print(
                f"{i}. "
                f"{match['question']} "
                f"(score: {match['score']:.4f})"
            )