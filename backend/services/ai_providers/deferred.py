"""Resolve only the provider needed for an operation."""
from threading import Lock


class DeferredProvider:
    def __init__(self, factory, model):
        self.factory, self.model, self.provider = factory, model, None
        self.lock = Lock()

    def __getattr__(self, name):
        with self.lock:
            if self.provider is None:
                self.provider = self.factory(model=self.model)
        return getattr(self.provider, name)
