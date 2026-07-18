"""
Utils module.
"""
# [GRACEFUL SHUTDOWN]
class BackgroundTaskTracker:
    def __init__(self):
        self._active_tasks = 0

    def increment(self):
        self._active_tasks += 1

    def decrement(self):
        self._active_tasks = max(0, self._active_tasks - 1)

    @property
    def active_tasks(self) -> int:
        return self._active_tasks

background_task_tracker = BackgroundTaskTracker()
