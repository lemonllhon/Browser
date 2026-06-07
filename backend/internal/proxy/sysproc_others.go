//go:build !windows
// +build !windows

package proxy

import (
	"errors"
	"os/exec"
	"syscall"
)

func hideWindow(cmd *exec.Cmd) {
	// do nothing on non-windows platforms
}

func stopProcessTree(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	return cmd.Process.Kill()
}

func isProcessAlive(pid int) (bool, error) {
	if pid <= 0 {
		return false, nil
	}
	err := syscall.Kill(pid, 0)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, syscall.ESRCH) {
		return false, nil
	}
	return true, err
}
