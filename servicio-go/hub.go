package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // el gateway y el frontend estan en otros origenes
	},
}

// Hub: guarda todas las conexiones WebSocket y hace broadcast.
// Solo la goroutine run() toca el mapa de clientes, asi no hay condiciones de carrera.
type Hub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan []byte
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	total      atomic.Int64
}

func newHub() *Hub {
	return &Hub{
		clients:    make(map[*websocket.Conn]bool),
		broadcast:  make(chan []byte, 64),
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			h.total.Store(int64(len(h.clients)))
			h.enviarATodos(mensajeConectados(len(h.clients)))
		case client := <-h.unregister:
			if h.clients[client] {
				delete(h.clients, client)
				client.Close()
				h.total.Store(int64(len(h.clients)))
				h.enviarATodos(mensajeConectados(len(h.clients)))
			}
		case msg := <-h.broadcast:
			h.enviarATodos(msg)
		}
	}
}

func (h *Hub) enviarATodos(msg []byte) {
	for client := range h.clients {
		client.SetWriteDeadline(time.Now().Add(5 * time.Second))
		if err := client.WriteMessage(websocket.TextMessage, msg); err != nil {
			delete(h.clients, client)
			client.Close()
		}
	}
	h.total.Store(int64(len(h.clients)))
}

// Publicar envia un mensaje JSON a todos los clientes conectados
func (h *Hub) Publicar(tipo string, data any) {
	msg, err := json.Marshal(map[string]any{
		"tipo": tipo,
		"data": data,
		"hora": time.Now().Format(time.RFC3339),
	})
	if err != nil {
		log.Println("error serializando mensaje WS:", err)
		return
	}
	h.broadcast <- msg
}

func (h *Hub) Conectados() int {
	return int(h.total.Load())
}

func mensajeConectados(n int) []byte {
	msg, _ := json.Marshal(map[string]any{"tipo": "conectados", "data": map[string]int{"total": n}})
	return msg
}

// wsHandler: GET /ws -> Upgrade HTTP a WebSocket
func (h *Hub) wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("error en upgrade WS:", err)
		return
	}
	h.register <- conn

	// Leemos hasta que el cliente se desconecte; el canal es de solo
	// notificaciones, asi que lo que envie el cliente se descarta
	go func() {
		defer func() { h.unregister <- conn }()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()
}
