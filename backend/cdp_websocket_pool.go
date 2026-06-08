package backend

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	cdpPooledCommandTimeout = 3 * time.Second
	cdpPooledIdleTTL        = 2 * time.Minute
)

type cdpWebSocketClient struct {
	wsURL    string
	mu       sync.Mutex
	conn     *websocket.Conn
	nextID   int
	lastUsed time.Time
}

var cdpWebSocketClients = struct {
	mu      sync.Mutex
	clients map[string]*cdpWebSocketClient
}{
	clients: make(map[string]*cdpWebSocketClient),
}

func cdpCallWebSocket(wsURL string, method string, params map[string]any) (map[string]any, error) {
	wsURL = strings.TrimSpace(wsURL)
	if wsURL == "" {
		return nil, fmt.Errorf("WebSocket 调试地址为空")
	}
	client := cdpPooledWebSocketClient(wsURL)
	result, err := client.call(method, params)
	if err == nil {
		return result, nil
	}
	cdpDropPooledWebSocketClient(wsURL, client)

	client = cdpPooledWebSocketClient(wsURL)
	result, retryErr := client.call(method, params)
	if retryErr != nil {
		cdpDropPooledWebSocketClient(wsURL, client)
		return nil, retryErr
	}
	return result, nil
}

func cdpPooledWebSocketClient(wsURL string) *cdpWebSocketClient {
	cdpWebSocketClients.mu.Lock()
	defer cdpWebSocketClients.mu.Unlock()
	cdpPruneIdleWebSocketClientsLocked(time.Now())
	client := cdpWebSocketClients.clients[wsURL]
	if client == nil {
		client = &cdpWebSocketClient{wsURL: wsURL, nextID: 1, lastUsed: time.Now()}
		cdpWebSocketClients.clients[wsURL] = client
	}
	return client
}

func cdpPruneIdleWebSocketClientsLocked(now time.Time) {
	for wsURL, client := range cdpWebSocketClients.clients {
		if client == nil {
			delete(cdpWebSocketClients.clients, wsURL)
			continue
		}
		client.mu.Lock()
		idle := !client.lastUsed.IsZero() && now.Sub(client.lastUsed) > cdpPooledIdleTTL
		client.mu.Unlock()
		if idle {
			client.close()
			delete(cdpWebSocketClients.clients, wsURL)
		}
	}
}

func cdpDropPooledWebSocketClient(wsURL string, client *cdpWebSocketClient) {
	if client != nil {
		client.close()
	}
	cdpWebSocketClients.mu.Lock()
	defer cdpWebSocketClients.mu.Unlock()
	if current := cdpWebSocketClients.clients[wsURL]; current == client {
		delete(cdpWebSocketClients.clients, wsURL)
	}
}

func (c *cdpWebSocketClient) call(method string, params map[string]any) (map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	conn, err := c.ensureConnLocked()
	if err != nil {
		return nil, err
	}
	c.lastUsed = time.Now()
	if c.nextID <= 0 {
		c.nextID = 1
	}
	id := c.nextID
	c.nextID++
	_ = conn.SetWriteDeadline(time.Now().Add(cdpPooledCommandTimeout))
	if err := conn.WriteJSON(cdpMessage{Id: id, Method: method, Params: params}); err != nil {
		c.closeLocked()
		return nil, fmt.Errorf("CDP 命令发送失败: %w", err)
	}

	deadline := time.Now().Add(cdpPooledCommandTimeout)
	for {
		_ = conn.SetReadDeadline(deadline)
		var resp cdpResponse
		if err := conn.ReadJSON(&resp); err != nil {
			c.closeLocked()
			return nil, fmt.Errorf("CDP 响应读取失败: %w", err)
		}
		if resp.Id != id {
			continue
		}
		if resp.Error != nil {
			return nil, fmt.Errorf("CDP 错误: %s", resp.Error.Message)
		}
		c.lastUsed = time.Now()
		return resp.Result, nil
	}
}

func (c *cdpWebSocketClient) ensureConnLocked() (*websocket.Conn, error) {
	if c.conn != nil {
		return c.conn, nil
	}
	conn, _, err := websocket.DefaultDialer.Dial(c.wsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("WebSocket 连接失败: %w", err)
	}
	c.conn = conn
	return conn, nil
}

func (c *cdpWebSocketClient) close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.closeLocked()
}

func (c *cdpWebSocketClient) closeLocked() {
	if c.conn != nil {
		_ = c.conn.Close()
		c.conn = nil
	}
}
