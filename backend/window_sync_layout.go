package backend

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

func (a *App) applyWindowSyncLayoutToState(settings WindowSyncLayoutSettings, state *WindowSyncState) error {
	if state == nil || len(state.Windows) == 0 {
		return fmt.Errorf("窗口同步未启动")
	}
	rects := calculateWindowSyncLayoutRects(settings, orderedWindowSyncWindows(state), a.windowSyncLayoutWorkArea(settings))
	failures := make([]string, 0)
	for _, item := range orderedWindowSyncWindows(state) {
		rect, ok := rects[item.ProfileId]
		if !ok {
			continue
		}
		if err := a.setWindowSyncProfileBounds(item.ProfileId, rect); err != nil {
			name := strings.TrimSpace(item.ProfileName)
			if name == "" {
				name = item.ProfileId
			}
			failures = append(failures, fmt.Sprintf("%s：%v", name, err))
		}
	}

	if strings.EqualFold(strings.TrimSpace(settings.Mode), "stack") {
		_ = a.showWindowSyncProfile(state.MasterProfileId)
	}
	if len(failures) > 0 {
		return fmt.Errorf("部分窗口布局失败：%s", strings.Join(failures, "；"))
	}
	return nil
}

func (a *App) windowSyncLayoutWorkArea(settings WindowSyncLayoutSettings) workAreaRect {
	switch normalizeWindowSyncLayoutScope(settings.Scope) {
	case windowSyncLayoutScopeAllScreens:
		return allWorkAreasUnion()
	case windowSyncLayoutScopeToolbarScreen:
		if x, y, ok := a.windowSyncToolbarCenterPoint(); ok {
			return workAreaForPoint(x, y)
		}
	}
	if x, y, ok := a.windowSyncAppWindowCenterPoint(); ok {
		return workAreaForPoint(x, y)
	}
	if x, y, ok := appWindowCenterPoint(); ok {
		return workAreaForPoint(x, y)
	}
	return primaryWorkArea()
}

func (a *App) windowSyncToolbarCenterPoint() (int, int, bool) {
	toolbar := a.currentWindowSyncToolbarAdapter()
	if toolbar == nil {
		return 0, 0, false
	}
	if positioned, ok := toolbar.(interface {
		CenterPoint() (int, int, bool)
	}); ok {
		return positioned.CenterPoint()
	}
	return 0, 0, false
}

func (a *App) windowSyncAppWindowCenterPoint() (int, int, bool) {
	if a == nil || a.ctx == nil {
		return 0, 0, false
	}
	defer func() {
		_ = recover()
	}()
	x, y := a.appRuntime().GetWindowPosition(a.ctx)
	width, height := a.appRuntime().GetWindowSize(a.ctx)
	if width <= 0 || height <= 0 {
		return 0, 0, false
	}
	return x + width/2, y + height/2, true
}

func (a *App) setWindowSyncProfileBounds(profileId string, rect workAreaRect) error {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return fmt.Errorf("profile id is required")
	}

	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists || profile == nil {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("实例不存在")
	}
	if !profile.Running || !profile.DebugReady || profile.DebugPort <= 0 {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("实例未运行或调试端口未就绪")
	}
	debugPort := profile.DebugPort
	pid := profile.Pid
	a.browserMgr.Mutex.Unlock()

	targetID, err := firstPageTargetID(debugPort)
	if err != nil {
		return err
	}
	windowInfo, err := cdpBrowserCallResult(debugPort, "Browser.getWindowForTarget", map[string]any{"targetId": targetID})
	if err != nil {
		return err
	}
	windowID, ok := numericResult(windowInfo["windowId"])
	if !ok {
		return fmt.Errorf("无法获取浏览器窗口 ID")
	}
	if _, err := cdpBrowserCallResult(debugPort, "Browser.setWindowBounds", map[string]any{
		"windowId": windowID,
		"bounds": map[string]any{
			"windowState": "normal",
			"left":        rect.Left,
			"top":         rect.Top,
			"width":       rect.Width,
			"height":      rect.Height,
		},
	}); err != nil {
		return err
	}
	_, _ = cdpCall(debugPort, "Page.bringToFront", nil)
	time.Sleep(120 * time.Millisecond)
	if pid > 0 {
		_ = setBrowserWindowsBoundsByPID(pid, rect.Left, rect.Top, rect.Width, rect.Height)
	}
	_ = a.ensureWindowSyncProfileBounds(debugPort, windowID, rect)
	if pid > 0 {
		_ = setBrowserWindowsBoundsByPID(pid, rect.Left, rect.Top, rect.Width, rect.Height)
	}
	return nil
}

func (a *App) ensureWindowSyncProfileBounds(debugPort int, windowID int, rect workAreaRect) error {
	windowInfo, err := cdpBrowserCallResult(debugPort, "Browser.getWindowBounds", map[string]any{"windowId": windowID})
	if err != nil {
		return err
	}
	bounds, _ := windowInfo["bounds"].(map[string]any)
	left, leftOK := numericResult(bounds["left"])
	top, topOK := numericResult(bounds["top"])
	width, widthOK := numericResult(bounds["width"])
	height, heightOK := numericResult(bounds["height"])
	if leftOK && topOK && widthOK && heightOK &&
		absInt(left-rect.Left) <= 6 &&
		absInt(top-rect.Top) <= 6 &&
		absInt(width-rect.Width) <= 8 &&
		absInt(height-rect.Height) <= 8 {
		return nil
	}
	_, err = cdpBrowserCallResult(debugPort, "Browser.setWindowBounds", map[string]any{
		"windowId": windowID,
		"bounds": map[string]any{
			"windowState": "normal",
			"left":        rect.Left,
			"top":         rect.Top,
			"width":       rect.Width,
			"height":      rect.Height,
		},
	})
	return err
}

func (a *App) reapplyWindowSyncStartupLayout(sessionId string) {
	for _, delay := range []time.Duration{500 * time.Millisecond, 1200 * time.Millisecond} {
		time.Sleep(delay)
		state := a.WindowSyncGetState()
		if state == nil || !state.Active || state.SessionId != sessionId {
			return
		}
		_ = a.applyWindowSyncLayoutToState(state.Layout, state)
		a.updateWindowSyncToolbar(state)
	}
}

func calculateWindowSyncLayoutRects(settings WindowSyncLayoutSettings, windows []WindowSyncCandidate, area workAreaRect) map[string]workAreaRect {
	settings = normalizeWindowSyncLayoutSettings(settings)
	rects := make(map[string]workAreaRect, len(windows))
	count := len(windows)
	if count == 0 {
		return rects
	}

	switch strings.ToLower(strings.TrimSpace(settings.Mode)) {
	case "stack":
		offset := 24
		width := maxInt(320, area.Width)
		height := maxInt(240, area.Height)
		for index, item := range windows {
			left := area.Left + index*offset
			top := area.Top + index*offset
			if left+width > area.Left+area.Width {
				left = area.Left
			}
			if top+height > area.Top+area.Height {
				top = area.Top
			}
			rects[item.ProfileId] = workAreaRect{
				Left:   left,
				Top:    top,
				Width:  width,
				Height: height,
			}
		}
	case "custom":
		perRow := maxInt(1, settings.PerRow)
		width := maxInt(320, settings.Width)
		height := maxInt(240, settings.Height)
		for index, item := range windows {
			col := index % perRow
			row := index / perRow
			rects[item.ProfileId] = workAreaRect{
				Left:   area.Left + col*(width+settings.GapX),
				Top:    area.Top + row*(height+settings.GapY),
				Width:  width,
				Height: height,
			}
		}
	default:
		if count == 5 {
			gapX, gapY := 8, 8
			width := maxInt(160, (area.Width-gapX)/2)
			height := maxInt(120, (area.Height-gapY)/2)
			positions := []workAreaRect{
				{Left: area.Left, Top: area.Top, Width: width, Height: height},
				{Left: area.Left + area.Width - width, Top: area.Top, Width: width, Height: height},
				{Left: area.Left, Top: area.Top + area.Height - height, Width: width, Height: height},
				{Left: area.Left + area.Width - width, Top: area.Top + area.Height - height, Width: width, Height: height},
				{Left: area.Left + (area.Width-width)/2, Top: area.Top + (area.Height-height)/2, Width: width, Height: height},
			}
			for index, item := range windows {
				rects[item.ProfileId] = positions[index]
			}
			return rects
		}
		cols, rows := bestWindowSyncGrid(count, area)
		gapX, gapY := 8, 8
		width := maxInt(160, (area.Width-gapX*(cols-1))/cols)
		height := maxInt(120, (area.Height-gapY*(rows-1))/rows)
		for index, item := range windows {
			col := index % cols
			row := index / cols
			rects[item.ProfileId] = workAreaRect{
				Left:   area.Left + col*(width+gapX),
				Top:    area.Top + row*(height+gapY),
				Width:  width,
				Height: height,
			}
		}
	}
	return rects
}

func bestWindowSyncGrid(count int, area workAreaRect) (int, int) {
	if count <= 1 {
		return 1, 1
	}
	screenRatio := float64(maxInt(1, area.Width)) / float64(maxInt(1, area.Height))
	bestCols, bestRows := count, 1
	bestScore := math.MaxFloat64
	for cols := 1; cols <= count; cols++ {
		rows := int(math.Ceil(float64(count) / float64(cols)))
		cellRatio := (float64(area.Width) / float64(cols)) / (float64(area.Height) / float64(rows))
		score := math.Abs(math.Log(cellRatio))
		if cols < rows && screenRatio >= 1 {
			score += 0.2
		}
		if score < bestScore {
			bestScore = score
			bestCols = cols
			bestRows = rows
		}
	}
	return bestCols, bestRows
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func orderedWindowSyncWindows(state *WindowSyncState) []WindowSyncCandidate {
	if state == nil {
		return nil
	}
	windows := append([]WindowSyncCandidate{}, state.Windows...)
	sort.SliceStable(windows, func(i, j int) bool {
		if windows[i].ProfileId == state.MasterProfileId {
			return true
		}
		if windows[j].ProfileId == state.MasterProfileId {
			return false
		}
		return i < j
	})
	return windows
}

func (a *App) normalizedWindowSyncLayoutSettings(settings WindowSyncLayoutSettings) WindowSyncLayoutSettings {
	return normalizeWindowSyncLayoutSettings(settings)
}

func normalizeWindowSyncLayoutSettings(settings WindowSyncLayoutSettings) WindowSyncLayoutSettings {
	mode := strings.ToLower(strings.TrimSpace(settings.Mode))
	if mode != "grid" && mode != "stack" && mode != "custom" {
		mode = "grid"
	}
	out := WindowSyncLayoutSettings{
		Mode:      mode,
		Scope:     normalizeWindowSyncLayoutScope(settings.Scope),
		Width:     settings.Width,
		Height:    settings.Height,
		GapX:      maxInt(0, settings.GapX),
		GapY:      maxInt(0, settings.GapY),
		PerRow:    settings.PerRow,
		UpdatedAt: settings.UpdatedAt,
	}
	if out.Width <= 0 {
		out.Width = 1500
	}
	if out.Height <= 0 {
		out.Height = 500
	}
	if out.PerRow <= 0 {
		out.PerRow = 2
	}
	return out
}

func normalizeWindowSyncLayoutScope(scope string) string {
	value := strings.ToLower(strings.TrimSpace(scope))
	switch value {
	case windowSyncLayoutScopeToolbarScreen, "current-screen", "toolbar", "current":
		return windowSyncLayoutScopeToolbarScreen
	case windowSyncLayoutScopeAllScreens, "all", "all-screen":
		return windowSyncLayoutScopeAllScreens
	default:
		return windowSyncLayoutScopeAppScreen
	}
}

func defaultWindowSyncLayoutSettings() WindowSyncLayoutSettings {
	return WindowSyncLayoutSettings{
		Mode:   "grid",
		Scope:  windowSyncLayoutScopeAppScreen,
		Width:  1500,
		Height: 500,
		GapX:   10,
		GapY:   10,
		PerRow: 2,
	}
}
