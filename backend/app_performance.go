package backend

import (
	goruntime "runtime"
	"time"
)

type AppPerformanceSnapshot struct {
	TimestampMS             int64
	AppVersion              string
	Platform                string
	Arch                    string
	MemAllocMB              int32
	MemSysMB                int32
	MemHeapInuseMB          int32
	MemNumGC                int32
	Goroutines              int32
	TotalInstances          int32
	RunningInstances        int32
	BrowserProcesses        int32
	ProxyBridgeRefs         int32
	XrayBridgeRefs          int32
	ClashBridgeRefs         int32
	SwitchBridgeRefs        int32
	AuthProxyBridgeRefs     int32
	WindowSyncActive        bool
	WindowSyncWindows       int32
	WindowSyncControllable  int32
	WindowSyncEventsTotal   int64
	WindowSyncDispatchTotal int64
}

func (a *App) GetPerformanceSnapshot() AppPerformanceSnapshot {
	var mem goruntime.MemStats
	goruntime.ReadMemStats(&mem)

	appVersion := "dev"
	if a != nil {
		appVersion = a.appVersion()
	}

	snapshot := AppPerformanceSnapshot{
		TimestampMS:    time.Now().UnixMilli(),
		AppVersion:     appVersion,
		Platform:       goruntime.GOOS,
		Arch:           goruntime.GOARCH,
		MemAllocMB:     bytesToMB(mem.Alloc),
		MemSysMB:       bytesToMB(mem.Sys),
		MemHeapInuseMB: bytesToMB(mem.HeapInuse),
		MemNumGC:       int32(mem.NumGC),
		Goroutines:     int32(goruntime.NumGoroutine()),
	}

	if a != nil && a.browserMgr != nil {
		a.browserMgr.Mutex.Lock()
		snapshot.TotalInstances = int32(len(a.browserMgr.Profiles))
		snapshot.BrowserProcesses = int32(len(a.browserMgr.BrowserProcesses))
		for _, profile := range a.browserMgr.Profiles {
			if profile != nil && profile.Running {
				snapshot.RunningInstances++
			}
		}
		a.browserMgr.Mutex.Unlock()
	}

	if a != nil {
		snapshot.WindowSyncEventsTotal = a.windowSyncEventsTotal.Load()
		snapshot.WindowSyncDispatchTotal = a.windowSyncDispatchTotal.Load()

		a.bridgeMu.Lock()
		snapshot.XrayBridgeRefs = int32(len(a.xrayBridgeRefs))
		snapshot.ClashBridgeRefs = int32(len(a.clashBridgeRefs))
		snapshot.SwitchBridgeRefs = int32(len(a.switchBridgeRefs))
		snapshot.AuthProxyBridgeRefs = int32(len(a.authProxyBridgeRefs))
		snapshot.ProxyBridgeRefs = snapshot.XrayBridgeRefs +
			snapshot.ClashBridgeRefs +
			snapshot.SwitchBridgeRefs +
			snapshot.AuthProxyBridgeRefs
		a.bridgeMu.Unlock()

		a.windowSyncMu.Lock()
		if a.windowSyncState != nil && a.windowSyncState.Active {
			snapshot.WindowSyncActive = true
			snapshot.WindowSyncWindows = int32(len(a.windowSyncState.Windows))
			for _, item := range a.windowSyncState.Windows {
				if windowSyncCandidateControllable(item) {
					snapshot.WindowSyncControllable++
				}
			}
		}
		a.windowSyncMu.Unlock()
	}

	return snapshot
}

func bytesToMB(value uint64) int32 {
	return int32(value / 1024 / 1024)
}
