from datasets import load_dataset
import pandas as pd
import re


def clean_text(text):
    """Clean and normalize text."""
    text = str(text).strip()
    text = re.sub(r"\s+", " ", text)
    return text


def load_and_preprocess_dataset():
    print("Loading Banking dataset...")

    dataset = load_dataset(
        "SohamNale/Banking_Dataset_for_LLM_Finetuning"
    )

    df = dataset["train"].to_pandas()

    # Keep only the fields needed for semantic search
    df = df[["question", "answer"]]

    # Remove missing values
    df = df.dropna(subset=["question", "answer"])

    # Clean text
    df["question"] = df["question"].apply(clean_text)
    df["answer"] = df["answer"].apply(clean_text)

    # Remove duplicate questions
    df = df.drop_duplicates(subset=["question"])

    # Reset index
    df = df.reset_index(drop=True)

    print(f"Dataset size: {len(df)}")
    print("\nSample:")
    print("Question:", df.iloc[0]["question"])
    print("Answer:", df.iloc[0]["answer"])

    return df


if __name__ == "__main__":
    df = load_and_preprocess_dataset()

