package backend

import (
	"fmt"
	"net"
	"testing"
)

func TestReserveAvailablePortHoldsBackendPortUntilClosed(t *testing.T) {
	reservation, err := reserveAvailablePort()
	if err != nil {
		t.Fatalf("reserveAvailablePort returned error: %v", err)
	}

	addr := fmt.Sprintf("127.0.0.1:%d", reservation.Port)
	listener, err := net.Listen("tcp", addr)
	if err == nil {
		listener.Close()
		reservation.Close()
		t.Fatalf("expected %s to remain reserved before Close", addr)
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

func TestShortKeyPrefix(t *testing.T) {
	if got := shortKeyPrefix("abcdef123456"); got != "abcdef12" {
		t.Fatalf("shortKeyPrefix returned %q", got)
	}
	if got := shortKeyPrefix("tiny"); got != "tiny" {
		t.Fatalf("shortKeyPrefix changed short key to %q", got)
	}
}
