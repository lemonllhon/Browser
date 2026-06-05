package backend

const defaultWindowSyncMasterColor = "#2563eb"

const windowSyncBindingName = "__traceWindowSyncEvent"

const (
	windowSyncLayoutScopeAppScreen     = "app-screen"
	windowSyncLayoutScopeToolbarScreen = "toolbar-screen"
	windowSyncLayoutScopeAllScreens    = "all-screens"
)

type windowSyncTarget struct {
	Id           string
	Title        string
	Url          string
	Attached     bool
	Index        int
	WebSocketURL string
}

type WindowSyncLayoutSettings struct {
	Mode      string `json:"mode"`
	Scope     string `json:"scope"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	GapX      int    `json:"gapX"`
	GapY      int    `json:"gapY"`
	PerRow    int    `json:"perRow"`
	UpdatedAt string `json:"updatedAt"`
}

type WindowSyncCandidate struct {
	ProfileId    string `json:"profileId"`
	ProfileName  string `json:"profileName"`
	DebugPort    int    `json:"debugPort"`
	Pid          int    `json:"pid"`
	Running      bool   `json:"running"`
	DebugReady   bool   `json:"debugReady"`
	Role         string `json:"role"`
	Master       bool   `json:"master"`
	CanSync      bool   `json:"canSync"`
	CanAutoStart bool   `json:"canAutoStart"`
	Unavailable  string `json:"unavailable"`
}

type WindowSyncStartInput struct {
	ProfileIds      []string `json:"profileIds"`
	MasterProfileId string   `json:"masterProfileId"`
}

type WindowSyncState struct {
	SessionId       string                   `json:"sessionId"`
	Active          bool                     `json:"active"`
	Paused          bool                     `json:"paused"`
	MasterProfileId string                   `json:"masterProfileId"`
	ProfileIds      []string                 `json:"profileIds"`
	Windows         []WindowSyncCandidate    `json:"windows"`
	MasterColor     string                   `json:"masterColor"`
	SyncKeyboard    bool                     `json:"syncKeyboard"`
	SyncMouse       bool                     `json:"syncMouse"`
	Layout          WindowSyncLayoutSettings `json:"layout"`
	StartedAt       string                   `json:"startedAt"`
	UpdatedAt       string                   `json:"updatedAt"`
}

type WindowSyncSettings struct {
	MasterColor  string `json:"masterColor"`
	SyncKeyboard bool   `json:"syncKeyboard"`
	SyncMouse    bool   `json:"syncMouse"`
}

type WindowSyncBatchInputSameInput struct {
	Text string `json:"text"`
}

type WindowSyncBatchInputDifferentItem struct {
	ProfileId string `json:"profileId"`
	Text      string `json:"text"`
}

type WindowSyncBatchInputDifferentInput struct {
	Items []WindowSyncBatchInputDifferentItem `json:"items"`
}

type WindowSyncBatchInputResultItem struct {
	ProfileId   string `json:"profileId"`
	ProfileName string `json:"profileName"`
	Master      bool   `json:"master"`
	Success     bool   `json:"success"`
	Error       string `json:"error"`
}

type WindowSyncBatchInputResult struct {
	Total   int                              `json:"total"`
	Success int                              `json:"success"`
	Failed  int                              `json:"failed"`
	Results []WindowSyncBatchInputResultItem `json:"results"`
}

type WindowSyncOpenUrlsInput struct {
	Urls []string `json:"urls"`
}

type WindowSyncActionResultItem struct {
	ProfileId   string `json:"profileId"`
	ProfileName string `json:"profileName"`
	Master      bool   `json:"master"`
	Success     bool   `json:"success"`
	Error       string `json:"error"`
}

type WindowSyncActionResult struct {
	Total   int                          `json:"total"`
	Success int                          `json:"success"`
	Failed  int                          `json:"failed"`
	Results []WindowSyncActionResultItem `json:"results"`
}
