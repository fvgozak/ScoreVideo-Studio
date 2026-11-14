"""Shared cancellation signal for the web server and renderer."""


class RenderCancelled(Exception):
    pass
