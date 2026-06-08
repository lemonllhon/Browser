//go:build !windows

package main

func ensureURLProtocolRegistration(scheme string, description string, startupDebugEnabled bool) error {
	return nil
}
