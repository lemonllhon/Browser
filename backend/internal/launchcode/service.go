package launchcode

import (
	"crypto/rand"
	"fmt"
	"regexp"
	"strings"
	"sync"
)

const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const codeLen = 6
const maxRetries = 10
const customCodeMinLen = 4
const customCodeMaxLen = 32

var customCodePattern = regexp.MustCompile(`^[A-Z0-9_-]+$`)

// LaunchCodeService 负责 Launch Code 的生成、缓存与管理
type LaunchCodeService struct {
	dao           LaunchCodeDAO
	codeToProfile map[string]string
	profileToCode map[string]string
	mu            sync.RWMutex
}

// NewLaunchCodeService 创建 LaunchCodeService
func NewLaunchCodeService(dao LaunchCodeDAO) *LaunchCodeService {
	return &LaunchCodeService{
		dao:           dao,
		codeToProfile: make(map[string]string),
		profileToCode: make(map[string]string),
	}
}

// EnsureCode 为 profile 生成并持久化 code（幂等：已有则直接返回）
func (s *LaunchCodeService) EnsureCode(profileId string) (string, error) {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return "", fmt.Errorf("profile id is required")
	}

	if s.dao != nil {
		code, err := s.dao.FindCode(profileId)
		if err == nil {
			code = normalizeCode(code)
			s.cacheMapping(profileId, code)
			return code, nil
		}
		if !isLaunchCodeNotFound(err) {
			if code, ok := s.cachedCodeForProfile(profileId); ok {
				return code, nil
			}
			return "", err
		}
		s.forgetProfile(profileId)
	} else if code, ok := s.cachedCodeForProfile(profileId); ok {
		return code, nil
	}

	code, err := s.generateUniqueCode()
	if err != nil {
		return "", err
	}

	if s.dao == nil {
		s.cacheMapping(profileId, code)
		return code, nil
	}
	if err := s.dao.Upsert(profileId, code); err != nil {
		return "", err
	}

	s.cacheMapping(profileId, code)

	return code, nil
}

// SetCode 为指定 profile 设置自定义 launch code。
// code 会自动 trim 并转为大写；格式限制为 4-32 位，字符集 [A-Z0-9_-]。
func (s *LaunchCodeService) SetCode(profileId, code string) (string, error) {
	code = normalizeCode(code)
	if err := validateCustomCode(code); err != nil {
		return "", err
	}

	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return "", fmt.Errorf("profile id is required")
	}

	if s.dao != nil {
		ownerProfile, err := s.dao.FindProfileId(code)
		if err == nil && ownerProfile != profileId {
			return "", fmt.Errorf("launch code already exists")
		}
		if err != nil && !isLaunchCodeNotFound(err) {
			return "", err
		}
	} else if ownerProfile, exists := s.cachedProfileForCode(code); exists && ownerProfile != profileId {
		return "", fmt.Errorf("launch code already exists")
	}

	if s.dao != nil {
		if err := s.dao.Upsert(profileId, code); err != nil {
			return "", err
		}
	}

	s.cacheMapping(profileId, code)
	return code, nil
}

// RegenerateCode 重新生成 code（废弃旧 code）
func (s *LaunchCodeService) RegenerateCode(profileId string) (string, error) {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return "", fmt.Errorf("profile id is required")
	}
	s.forgetProfile(profileId)

	code, err := s.generateUniqueCode()
	if err != nil {
		return "", err
	}

	if s.dao != nil {
		if err := s.dao.Upsert(profileId, code); err != nil {
			return "", err
		}
	}

	s.cacheMapping(profileId, code)
	return code, nil
}

// Resolve 根据 code 查找 profileId（以持久化存储为准并同步内存缓存）
func (s *LaunchCodeService) Resolve(code string) (string, error) {
	code = normalizeCode(code)
	if code == "" {
		return "", fmt.Errorf("launch code not found: %s", code)
	}

	if s.dao != nil {
		profileId, err := s.dao.FindProfileId(code)
		if err == nil {
			s.cacheMapping(profileId, code)
			return profileId, nil
		}
		if isLaunchCodeNotFound(err) {
			s.forgetCode(code)
			return "", fmt.Errorf("launch code not found: %s", code)
		}
		if profileId, ok := s.cachedProfileForCode(code); ok {
			return profileId, nil
		}
		return "", err
	}

	profileId, ok := s.cachedProfileForCode(code)
	if !ok {
		return "", fmt.Errorf("launch code not found: %s", code)
	}
	return profileId, nil
}

func (s *LaunchCodeService) cachedCodeForProfile(profileId string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	code, ok := s.profileToCode[profileId]
	return code, ok
}

func (s *LaunchCodeService) cachedProfileForCode(code string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	profileId, ok := s.codeToProfile[code]
	return profileId, ok
}

func (s *LaunchCodeService) cacheMapping(profileId, code string) {
	profileId = strings.TrimSpace(profileId)
	code = normalizeCode(code)
	if profileId == "" || code == "" {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if oldCode, ok := s.profileToCode[profileId]; ok && oldCode != code {
		delete(s.codeToProfile, oldCode)
	}
	if oldProfile, ok := s.codeToProfile[code]; ok && oldProfile != profileId {
		if currentCode, currentOK := s.profileToCode[oldProfile]; currentOK && currentCode == code {
			delete(s.profileToCode, oldProfile)
		}
	}
	s.profileToCode[profileId] = code
	s.codeToProfile[code] = profileId
}

func (s *LaunchCodeService) forgetProfile(profileId string) {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if code, ok := s.profileToCode[profileId]; ok {
		delete(s.codeToProfile, code)
		delete(s.profileToCode, profileId)
	}
}

func (s *LaunchCodeService) forgetCode(code string) {
	code = normalizeCode(code)
	if code == "" {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if profileId, ok := s.codeToProfile[code]; ok {
		delete(s.codeToProfile, code)
		if currentCode, currentOK := s.profileToCode[profileId]; currentOK && currentCode == code {
			delete(s.profileToCode, profileId)
		}
	}
}

func isLaunchCodeNotFound(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "not found") || strings.Contains(msg, "不存在")
}

func (s *LaunchCodeService) codeExists(code string) bool {
	if _, exists := s.cachedProfileForCode(code); exists {
		return true
	}
	if s.dao == nil {
		return false
	}
	_, err := s.dao.FindProfileId(code)
	return err == nil
}

// Remove 删除 profile 对应的 code（同时清理内存缓存和数据库）
func (s *LaunchCodeService) Remove(profileId string) error {
	s.forgetProfile(profileId)

	if s.dao == nil {
		return nil
	}
	return s.dao.Delete(profileId)
}

// LoadAll 启动时从数据库加载所有映射到内存
func (s *LaunchCodeService) LoadAll() error {
	if s.dao == nil {
		return nil
	}
	profileToCode, err := s.dao.LoadAll()
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.profileToCode = make(map[string]string, len(profileToCode))
	s.codeToProfile = make(map[string]string, len(profileToCode))

	for profileId, code := range profileToCode {
		normalizedCode := normalizeCode(code)
		s.profileToCode[profileId] = normalizedCode
		s.codeToProfile[normalizedCode] = profileId
	}
	return nil
}

// generateUniqueCode 生成一个在内存缓存和持久化存储中唯一的 code
func (s *LaunchCodeService) generateUniqueCode() (string, error) {
	for i := 0; i < maxRetries; i++ {
		code, err := randomCode()
		if err != nil {
			return "", fmt.Errorf("生成 launch code 失败: %w", err)
		}

		if !s.codeExists(code) {
			return code, nil
		}
	}
	return "", fmt.Errorf("无法在 %d 次重试内生成唯一 launch code", maxRetries)
}

// randomCode 使用 crypto/rand 生成一个随机 6 位字符串
func randomCode() (string, error) {
	buf := make([]byte, codeLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	result := make([]byte, codeLen)
	for i, b := range buf {
		result[i] = charset[int(b)%len(charset)]
	}
	return string(result), nil
}

func normalizeCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

func validateCustomCode(code string) error {
	if len(code) < customCodeMinLen || len(code) > customCodeMaxLen {
		return fmt.Errorf("launch code must be %d-%d characters", customCodeMinLen, customCodeMaxLen)
	}
	if !customCodePattern.MatchString(code) {
		return fmt.Errorf("launch code format invalid: only A-Z, 0-9, _ and - are allowed")
	}
	return nil
}
