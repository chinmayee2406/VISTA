"""Language detection and lightweight MyMemory translation helpers."""

import argparse
from functools import lru_cache

from deep_translator import MyMemoryTranslator
from deep_translator.exceptions import (
    LanguageNotSupportedException,
    RequestError,
    TooManyRequests,
    TranslationNotFound,
)
from langdetect import DetectorFactory, LangDetectException, detect


# Make langdetect return the same result for the same text across requests.
DetectorFactory.seed = 0


# langdetect returns ISO 639-1 codes. MyMemory needs a locale-specific code.
# Add further langdetect-code: MyMemory-code pairs here when needed.
LANGDETECT_TO_MYMEMORY = {
    "en": "en-GB",
    "hi": "hi-IN",
    "te": "te-IN",
    "ta": "ta-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "mr": "mr-IN",
    "gu": "gu-IN",
    "bn": "bn-IN",
    "pa": "pa-IN",
    "or": "or-IN",
    "ur": "ur-PK",
}


class TranslationError(RuntimeError):
    """A detection or MyMemory translation failure suitable for Flask handling."""


def detect_language(text: str) -> str:
    """Detect and return a langdetect code such as ``en``, ``hi``, or ``te``."""
    if not isinstance(text, str) or not text.strip():
        raise TranslationError("Cannot detect the language of empty text.")

    try:
        return detect(text)
    except LangDetectException as exc:
        raise TranslationError("Could not detect the input language.") from exc


def to_mymemory_code(language: str) -> str:
    """Map ``te`` to ``te-IN`` and accept an already-normalized MyMemory code."""
    if not isinstance(language, str) or not language.strip():
        raise TranslationError("A non-empty source and target language are required.")

    normalized = language.strip().lower()
    if normalized in LANGDETECT_TO_MYMEMORY:
        return LANGDETECT_TO_MYMEMORY[normalized]

    # Permit explicit MyMemory codes such as hi-IN too.
    for mymemory_code in LANGDETECT_TO_MYMEMORY.values():
        if normalized == mymemory_code.lower():
            return mymemory_code

    supported = ", ".join(sorted(LANGDETECT_TO_MYMEMORY))
    raise TranslationError(
        f"Unsupported language '{language}'. Configured langdetect codes: {supported}."
    )


@lru_cache(maxsize=32)
def _translator(source: str, target: str) -> MyMemoryTranslator:
    """Create one reusable translator per language pair."""
    return MyMemoryTranslator(source=source, target=target)


def translate_text(text: str, source: str, target: str) -> str:
    """Translate *text* with MyMemory and return only the translated string.

    Compatible with ``translate_text(text, source='te', target='en')`` and
    ``translate_text(text, source='en', target='te')``.
    """
    if not isinstance(text, str) or not text.strip():
        raise TranslationError("Cannot translate empty text.")

    source_code = to_mymemory_code(source)
    target_code = to_mymemory_code(target)

    if source_code == target_code:
        return text

    try:
        translated = _translator(source_code, target_code).translate(text=text)
    except (
        LanguageNotSupportedException,
        TranslationNotFound,
        TooManyRequests,
        RequestError,
    ) as exc:
        raise TranslationError(
            f"MyMemory translation failed ({source_code} -> {target_code}): {exc}"
        ) from exc
    except Exception as exc:
        # Preserve the original provider exception text for diagnosis.
        raise TranslationError(
            f"Unexpected MyMemory error ({source_code} -> {target_code}): {exc}"
        ) from exc

    if not translated:
        raise TranslationError(
            f"MyMemory returned no translation ({source_code} -> {target_code})."
        )
    return translated


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Translate text through MyMemory.")
    parser.add_argument("--text", required=True, help="Text to translate")
    parser.add_argument("--source", required=True, help="Source code, e.g. te")
    parser.add_argument("--target", required=True, help="Target code, e.g. en")
    args = parser.parse_args()

    print(translate_text(args.text, source=args.source, target=args.target))
