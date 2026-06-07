package proxy

import (
	"fmt"
	"net"
	"testing"
)

func TestReserveAvailablePortHoldsPortUntilClosed(t *testing.T) {
	reservation, err := reserveAvailablePort()
	if err != nil {
		t.Fatalf("reserveAvailablePort returned error: %v", err)
	}
	if reservation.Port <= 0 {
		t.Fatalf("expected a positive port, got %d", reservation.Port)
	}

	addr := fmt.Sprintf("127.0.0.1:%d", reservation.Port)
	listener, err := net.Listen("tcp", addr)
	if err == nil {
		listener.Close()
		reservation.Close()
		t.Fatalf("expected %s to stay reserved until Close", addr)
	}

	if err := reservation.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}

	listener, err = net.Listen("tcp", addr)
	if err != nil {
		t.Fatalf("expected %s to be available after Close: %v", addr, err)
	}
	listener.Close()
}

func TestShortNodeKey(t *testing.T) {
	if got := shortNodeKey("abcdef123456"); got != "abcdef12" {
		t.Fatalf("shortNodeKey returned %q", got)
	}
	if got := shortNodeKey("short"); got != "short" {
		t.Fatalf("shortNodeKey changed a short key to %q", got)
	}
}
