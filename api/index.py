from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit

from app import AppHandler, init_db


init_db()


class handler(AppHandler):
    """Route Vercel's rewritten API requests through the existing app handler."""

    def _restore_request_path(self) -> None:
        parsed = urlsplit(self.path)
        query = parse_qsl(parsed.query, keep_blank_values=True)
        requested_path = next((value for key, value in query if key == "__route"), "")
        if requested_path:
            remaining = [(key, value) for key, value in query if key != "__route"]
            self.path = requested_path
            if remaining:
                self.path += "?" + urlencode(remaining)

    def do_GET(self) -> None:
        self._restore_request_path()
        super().do_GET()

    def do_POST(self) -> None:
        self._restore_request_path()
        super().do_POST()

    def do_PATCH(self) -> None:
        self._restore_request_path()
        super().do_PATCH()

    def do_DELETE(self) -> None:
        self._restore_request_path()
        super().do_DELETE()
