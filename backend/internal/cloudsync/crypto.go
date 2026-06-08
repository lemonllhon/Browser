package cloudsync

import (
	"bufio"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	EncryptionAlgorithm       = "AES-256-GCM+PBKDF2-SHA256"
	encryptionKDF             = "PBKDF2-SHA256"
	encryptionKDFIterations   = 210000
	encryptionKeyBytes        = 32
	encryptionSaltBytes       = 16
	encryptionNoncePrefixSize = 4
	encryptionNonceSize       = 12
	encryptionChunkSize       = 1024 * 1024
	encryptionMagic           = "TRACE-BROWSER-CLOUD-BACKUP-ENC-v1\n"
	encryptionVerifierMessage = "trace-browser-cloud-sync-encryption-verifier-v1"
)

type EncryptionStatus struct {
	Configured bool   `json:"configured"`
	Enabled    bool   `json:"enabled"`
	Unlocked   bool   `json:"unlocked"`
	Algorithm  string `json:"algorithm"`
	KDF        string `json:"kdf"`
	UpdatedAt  string `json:"updatedAt"`
}

type EncryptionSetupInput struct {
	Password string `json:"password"`
}

type EncryptionUnlockInput struct {
	Password string `json:"password"`
}

type encryptionConfig struct {
	Enabled    bool   `json:"enabled"`
	Algorithm  string `json:"algorithm"`
	KDF        string `json:"kdf"`
	Iterations int    `json:"iterations"`
	Salt       string `json:"salt"`
	Verifier   string `json:"verifier"`
	UpdatedAt  string `json:"updatedAt"`
}

type encryptedBackupHeader struct {
	Version     int    `json:"version"`
	Algorithm   string `json:"algorithm"`
	KDF         string `json:"kdf"`
	ChunkSize   int    `json:"chunkSize"`
	NoncePrefix string `json:"noncePrefix"`
	CreatedAt   string `json:"createdAt"`
}

func (m *Manager) EncryptionStatus() EncryptionStatus {
	if m == nil || m.store == nil {
		return EncryptionStatus{Algorithm: EncryptionAlgorithm, KDF: encryptionKDF}
	}
	cfg, err := m.store.LoadEncryptionConfig()
	if err != nil {
		return EncryptionStatus{Algorithm: EncryptionAlgorithm, KDF: encryptionKDF}
	}
	m.mu.Lock()
	unlocked := len(m.encryptionKey) == encryptionKeyBytes
	m.mu.Unlock()
	return EncryptionStatus{
		Configured: true,
		Enabled:    cfg.Enabled,
		Unlocked:   cfg.Enabled && unlocked,
		Algorithm:  firstNonEmpty(cfg.Algorithm, EncryptionAlgorithm),
		KDF:        firstNonEmpty(cfg.KDF, encryptionKDF),
		UpdatedAt:  cfg.UpdatedAt,
	}
}

func (m *Manager) SetupEncryption(password string) (EncryptionStatus, error) {
	if m == nil || m.store == nil {
		return EncryptionStatus{}, errors.New("cloud sync manager is not initialized")
	}
	key, salt, err := deriveNewEncryptionKey(password)
	if err != nil {
		return EncryptionStatus{}, err
	}
	cfg := encryptionConfig{
		Enabled:    true,
		Algorithm:  EncryptionAlgorithm,
		KDF:        encryptionKDF,
		Iterations: encryptionKDFIterations,
		Salt:       base64.StdEncoding.EncodeToString(salt),
		Verifier:   base64.StdEncoding.EncodeToString(encryptionVerifier(key)),
		UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	if err := m.store.SaveEncryptionConfig(cfg); err != nil {
		return EncryptionStatus{}, err
	}
	m.setEncryptionKey(key)
	return m.EncryptionStatus(), nil
}

func (m *Manager) UnlockEncryption(password string) (EncryptionStatus, error) {
	if m == nil || m.store == nil {
		return EncryptionStatus{}, errors.New("cloud sync manager is not initialized")
	}
	cfg, err := m.store.LoadEncryptionConfig()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return EncryptionStatus{}, errors.New("请先设置同步加密密码")
		}
		return EncryptionStatus{}, err
	}
	key, err := deriveEncryptionKey(password, cfg)
	if err != nil {
		return EncryptionStatus{}, err
	}
	expected, err := base64.StdEncoding.DecodeString(strings.TrimSpace(cfg.Verifier))
	if err != nil {
		return EncryptionStatus{}, fmt.Errorf("同步加密配置损坏: %w", err)
	}
	if !hmac.Equal(encryptionVerifier(key), expected) {
		return EncryptionStatus{}, errors.New("同步加密密码不正确")
	}
	m.setEncryptionKey(key)
	return m.EncryptionStatus(), nil
}

func (m *Manager) DisableEncryption() (EncryptionStatus, error) {
	if m == nil || m.store == nil {
		return EncryptionStatus{}, errors.New("cloud sync manager is not initialized")
	}
	if err := m.store.ClearEncryptionConfig(); err != nil {
		return EncryptionStatus{}, err
	}
	m.setEncryptionKey(nil)
	return m.EncryptionStatus(), nil
}

func (m *Manager) EncryptBackupFile(srcPath, dstPath string, onProgress TransferProgressFunc) error {
	key, err := m.requireEncryptionKey()
	if err != nil {
		return err
	}
	return encryptBackupFile(srcPath, dstPath, key, onProgress)
}

func (m *Manager) DecryptBackupFile(srcPath, dstPath string, onProgress TransferProgressFunc) error {
	key, err := m.requireEncryptionKey()
	if err != nil {
		return err
	}
	return decryptBackupFile(srcPath, dstPath, key, onProgress)
}

func (m *Manager) requireEncryptionKey() ([]byte, error) {
	if m == nil {
		return nil, errors.New("cloud sync manager is not initialized")
	}
	status := m.EncryptionStatus()
	if !status.Configured || !status.Enabled {
		return nil, errors.New("请先设置同步加密密码")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.encryptionKey) != encryptionKeyBytes {
		return nil, errors.New("请先解锁同步加密密码")
	}
	key := make([]byte, len(m.encryptionKey))
	copy(key, m.encryptionKey)
	return key, nil
}

func (m *Manager) setEncryptionKey(key []byte) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(key) == 0 {
		m.encryptionKey = nil
		return
	}
	m.encryptionKey = make([]byte, len(key))
	copy(m.encryptionKey, key)
}

func deriveNewEncryptionKey(password string) ([]byte, []byte, error) {
	password = strings.TrimSpace(password)
	if len([]rune(password)) < 8 {
		return nil, nil, errors.New("同步加密密码至少需要 8 个字符")
	}
	salt := make([]byte, encryptionSaltBytes)
	if _, err := rand.Read(salt); err != nil {
		return nil, nil, err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, encryptionKDFIterations, encryptionKeyBytes)
	if err != nil {
		return nil, nil, err
	}
	return key, salt, nil
}

func deriveEncryptionKey(password string, cfg encryptionConfig) ([]byte, error) {
	password = strings.TrimSpace(password)
	if password == "" {
		return nil, errors.New("请填写同步加密密码")
	}
	if !cfg.Enabled {
		return nil, errors.New("同步加密尚未启用")
	}
	if !strings.EqualFold(firstNonEmpty(cfg.Algorithm, EncryptionAlgorithm), EncryptionAlgorithm) {
		return nil, fmt.Errorf("不支持的同步加密算法: %s", cfg.Algorithm)
	}
	salt, err := base64.StdEncoding.DecodeString(strings.TrimSpace(cfg.Salt))
	if err != nil || len(salt) < encryptionSaltBytes {
		return nil, errors.New("同步加密配置损坏")
	}
	iterations := cfg.Iterations
	if iterations <= 0 {
		iterations = encryptionKDFIterations
	}
	return pbkdf2.Key(sha256.New, password, salt, iterations, encryptionKeyBytes)
}

func encryptionVerifier(key []byte) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(encryptionVerifierMessage))
	return mac.Sum(nil)
}

func encryptBackupFile(srcPath, dstPath string, key []byte, onProgress TransferProgressFunc) error {
	in, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dstPath), 0700); err != nil {
		return err
	}
	tmpPath := dstPath + ".tmp"
	out, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	writeErr := encryptBackupStream(in, out, key, info.Size(), onProgress)
	closeErr := out.Close()
	if writeErr != nil {
		_ = os.Remove(tmpPath)
		return writeErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return closeErr
	}
	return os.Rename(tmpPath, dstPath)
}

func decryptBackupFile(srcPath, dstPath string, key []byte, onProgress TransferProgressFunc) error {
	in, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dstPath), 0700); err != nil {
		return err
	}
	tmpPath := dstPath + ".tmp"
	out, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	readErr := decryptBackupStream(in, out, key, info.Size(), onProgress)
	closeErr := out.Close()
	if readErr != nil {
		_ = os.Remove(tmpPath)
		return readErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return closeErr
	}
	return os.Rename(tmpPath, dstPath)
}

func encryptBackupStream(in io.Reader, out io.Writer, key []byte, totalBytes int64, onProgress TransferProgressFunc) error {
	aead, err := newEncryptionAEAD(key)
	if err != nil {
		return err
	}
	noncePrefix := make([]byte, encryptionNoncePrefixSize)
	if _, err := rand.Read(noncePrefix); err != nil {
		return err
	}
	header := encryptedBackupHeader{
		Version:     1,
		Algorithm:   EncryptionAlgorithm,
		KDF:         encryptionKDF,
		ChunkSize:   encryptionChunkSize,
		NoncePrefix: base64.StdEncoding.EncodeToString(noncePrefix),
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	headerData, err := json.Marshal(header)
	if err != nil {
		return err
	}
	writer := bufio.NewWriter(out)
	if _, err := writer.Write([]byte(encryptionMagic)); err != nil {
		return err
	}
	if err := binary.Write(writer, binary.BigEndian, uint32(len(headerData))); err != nil {
		return err
	}
	if _, err := writer.Write(headerData); err != nil {
		return err
	}

	tracker := newTransferProgressTracker(totalBytes, onProgress)
	tracker.emit(true)
	buffer := make([]byte, encryptionChunkSize)
	var index uint64
	for {
		n, readErr := io.ReadFull(in, buffer)
		final := false
		switch readErr {
		case nil:
		case io.EOF:
			final = true
		case io.ErrUnexpectedEOF:
			final = true
		default:
			return readErr
		}
		nonce := encryptionNonce(noncePrefix, index)
		recordHeader := encryptionRecordHeader(index, final)
		ciphertext := aead.Seal(nil, nonce, buffer[:n], encryptionAAD(headerData, recordHeader))
		if err := writeEncryptedRecord(writer, recordHeader, ciphertext); err != nil {
			return err
		}
		tracker.add(n)
		index++
		if final {
			break
		}
	}
	tracker.done()
	return writer.Flush()
}

func decryptBackupStream(in io.Reader, out io.Writer, key []byte, totalBytes int64, onProgress TransferProgressFunc) error {
	aead, err := newEncryptionAEAD(key)
	if err != nil {
		return err
	}
	reader := bufio.NewReader(in)
	magic := make([]byte, len(encryptionMagic))
	if _, err := io.ReadFull(reader, magic); err != nil {
		return err
	}
	if string(magic) != encryptionMagic {
		return errors.New("云端备份不是受支持的加密格式")
	}
	var headerLen uint32
	if err := binary.Read(reader, binary.BigEndian, &headerLen); err != nil {
		return err
	}
	if headerLen == 0 || headerLen > 64*1024 {
		return errors.New("云端备份加密头无效")
	}
	headerData := make([]byte, int(headerLen))
	if _, err := io.ReadFull(reader, headerData); err != nil {
		return err
	}
	var header encryptedBackupHeader
	if err := json.Unmarshal(headerData, &header); err != nil {
		return err
	}
	if header.Version != 1 || !strings.EqualFold(header.Algorithm, EncryptionAlgorithm) {
		return fmt.Errorf("不支持的云端备份加密算法: %s", header.Algorithm)
	}
	noncePrefix, err := base64.StdEncoding.DecodeString(header.NoncePrefix)
	if err != nil || len(noncePrefix) != encryptionNoncePrefixSize {
		return errors.New("云端备份加密头损坏")
	}

	tracker := newTransferProgressTracker(totalBytes, onProgress)
	tracker.emit(true)
	var index uint64
	for {
		recordHeader, ciphertext, err := readEncryptedRecord(reader)
		if err != nil {
			return err
		}
		if binary.BigEndian.Uint64(recordHeader[:8]) != index {
			return errors.New("云端备份加密分片顺序异常")
		}
		plaintext, err := aead.Open(nil, encryptionNonce(noncePrefix, index), ciphertext, encryptionAAD(headerData, recordHeader))
		if err != nil {
			return errors.New("云端备份解密失败，请检查同步加密密码")
		}
		if _, err := out.Write(plaintext); err != nil {
			return err
		}
		tracker.add(len(ciphertext))
		final := recordHeader[8] == 1
		index++
		if final {
			if _, err := reader.Peek(1); err == nil {
				return errors.New("云端备份加密文件存在多余数据")
			} else if !errors.Is(err, io.EOF) {
				return err
			}
			break
		}
	}
	tracker.done()
	return nil
}

func newEncryptionAEAD(key []byte) (cipher.AEAD, error) {
	if len(key) != encryptionKeyBytes {
		return nil, errors.New("同步加密密钥无效")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func encryptionNonce(prefix []byte, index uint64) []byte {
	nonce := make([]byte, encryptionNonceSize)
	copy(nonce, prefix)
	binary.BigEndian.PutUint64(nonce[encryptionNoncePrefixSize:], index)
	return nonce
}

func encryptionRecordHeader(index uint64, final bool) []byte {
	header := make([]byte, 9)
	binary.BigEndian.PutUint64(header[:8], index)
	if final {
		header[8] = 1
	}
	return header
}

func encryptionAAD(headerData []byte, recordHeader []byte) []byte {
	aad := make([]byte, 0, len(encryptionMagic)+len(headerData)+len(recordHeader))
	aad = append(aad, []byte(encryptionMagic)...)
	aad = append(aad, headerData...)
	aad = append(aad, recordHeader...)
	return aad
}

func writeEncryptedRecord(out io.Writer, recordHeader []byte, ciphertext []byte) error {
	if _, err := out.Write(recordHeader); err != nil {
		return err
	}
	if err := binary.Write(out, binary.BigEndian, uint32(len(ciphertext))); err != nil {
		return err
	}
	_, err := out.Write(ciphertext)
	return err
}

func readEncryptedRecord(in io.Reader) ([]byte, []byte, error) {
	recordHeader := make([]byte, 9)
	if _, err := io.ReadFull(in, recordHeader); err != nil {
		return nil, nil, err
	}
	var cipherLen uint32
	if err := binary.Read(in, binary.BigEndian, &cipherLen); err != nil {
		return nil, nil, err
	}
	if cipherLen > encryptionChunkSize+64*1024 {
		return nil, nil, errors.New("云端备份加密分片过大")
	}
	ciphertext := make([]byte, int(cipherLen))
	if _, err := io.ReadFull(in, ciphertext); err != nil {
		return nil, nil, err
	}
	return recordHeader, ciphertext, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
