import sys
import os

# Add backend directory to sys.path so we can import routers.shared
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from routers.shared import get_holdback_length, _generate_retrieval_progress_update

def test_get_holdback_length_partial_tags():
    # Suffix matches target tag prefix
    assert get_holdback_length("some text <pub") == 4
    assert get_holdback_length("some text </publi") == 7
    assert get_holdback_length("some text <rout") == 5
    assert get_holdback_length("some text </rout") == 6
    assert get_holdback_length("some text <thi") == 4
    assert get_holdback_length("some text </thi") == 5

    # Case insensitivity
    assert get_holdback_length("some text <PUB") == 4
    assert get_holdback_length("some text </PUBLI") == 7

    # Suffix matches tag prefix exactly but is the full tag (should not hold back if completed)
    assert get_holdback_length("some text <public_thought>") == 0
    assert get_holdback_length("some text </public_thought>") == 0
    assert get_holdback_length("some text <routing>") == 0
    assert get_holdback_length("some text </routing>") == 0
    
    # Suffix matches a partial but is longer than the prefix
    assert get_holdback_length("some text <hello") == 0
    assert get_holdback_length("some text </hello>") == 0
    
    # Empty raw text or no partial tag
    assert get_holdback_length("") == 0
    assert get_holdback_length("hello world") == 0

def test_generate_retrieval_progress_update():
    # Single citation with course and topic
    cit1 = [{"course": "PCH 412", "topic": "General Anaesthetics"}]
    assert _generate_retrieval_progress_update(cit1, {}) == "I found the relevant details in **PCH 412 — General Anaesthetics** and will use them to prepare a focused explanation."
    
    # Single citation with course only
    cit2 = [{"course": "PCH 412", "topic": ""}]
    assert _generate_retrieval_progress_update(cit2, {}) == "I found the relevant details in **PCH 412** and will use them to prepare a focused explanation."

    # Single citation with topic only
    cit3 = [{"course": "", "topic": "General Anaesthetics"}]
    assert _generate_retrieval_progress_update(cit3, {}) == "I found the relevant details in **General Anaesthetics** and will use them to prepare a focused explanation."

    # Single citation with title only
    cit4 = [{"course": "", "topic": "", "title": "Lecture Notes on Chemistry.pdf"}]
    assert _generate_retrieval_progress_update(cit4, {}) == "I found the relevant details in **Lecture Notes on Chemistry** and will use them to prepare a focused explanation."

    # Multiple citations
    cit_multi = [{"course": "PCH 412"}, {"course": "PTE 411"}]
    assert _generate_retrieval_progress_update(cit_multi, {}) == "I found relevant details across the available course materials and will combine the key points into a clear explanation."

    # Empty citations, fetch_timetable is True
    assert _generate_retrieval_progress_update([], {"fetch_timetable": True}) == "I checked the available class schedule and will use it to prepare the response."

    # Empty citations, fetch_faculty is True
    assert _generate_retrieval_progress_update([], {"fetch_faculty": True}) == "I found the relevant curriculum details and will use them to prepare the response."

    # Empty citations, default fallback
    assert _generate_retrieval_progress_update([], {}) == "I checked the available materials and will use them to prepare the response."

if __name__ == "__main__":
    test_get_holdback_length_partial_tags()
    test_generate_retrieval_progress_update()
    print("All tests passed successfully!")
