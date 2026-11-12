# { "Depends": "py-genlayer:latest" }

from genlayer import *


class Ping(gl.Contract):
    value: str

    def __init__(self):
        self.value = "pong"

    @gl.public.view
    def get_value(self) -> str:
        return self.value
