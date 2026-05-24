import re
from typing import Optional

def strip_thinking_tokens(text: Optional[str]) -> Optional[str]:
    """
    Strips internal reasoning/thinking blocks enclosed in XML-style tags
    (like <think>, <thinking>, <thought>, <scratchpad>) from LLM output.
    """
    if not text:
        return text

    # Define regex pattern for matching tags and their contents case-insensitively
    pattern = re.compile(
        r"<(think|thinking|thought|scratchpad)\b[^>]*>.*?</\1>",
        re.DOTALL | re.IGNORECASE
    )

    # Replace matched blocks with an empty string
    cleaned = re.sub(pattern, "", text)

    # Strip leading and trailing whitespace from the final result
    return cleaned.strip()

if __name__ == "__main__":
    # Test cases
    test_cases = [
        ("<think>This is qwen thinking</think>Here is the answer.", "Here is the answer."),
        ("<thinking>\nSome deep thought...\n</thinking>Result is 42.", "Result is 42."),
        ("<thought>Gemma thinking</thought>   Output here.", "Output here."),
        ("<scratchpad>Some notes</scratchpad>\n\nFinal output", "Final output"),
    ]

    all_passed = True
    for i, (input_text, expected) in enumerate(test_cases, 1):
        actual = strip_thinking_tokens(input_text)
        if actual == expected:
            print(f"Test {i}: PASS")
        else:
            print(f"Test {i}: FAIL (Expected: {repr(expected)}, Got: {repr(actual)})")
            all_passed = False

    if all_passed:
        print("All tests passed!")
