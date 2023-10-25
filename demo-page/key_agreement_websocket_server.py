#!/usr/bin/env python3
from simple_websocket_server import WebSocketServer, WebSocket


class KeyAgreementDemo(WebSocket):
    def handle(self):
        print(self.data)
        for client in clients:
            if client == self:
                continue
            client.send_message(self.data)

    def connected(self):
        print(self.address, 'connected')
        clients.append(self)

    def handle_close(self):
        clients.remove(self)
        print(self.address, 'closed')


clients = []

server = WebSocketServer('', 8001, KeyAgreementDemo)
server.serve_forever()