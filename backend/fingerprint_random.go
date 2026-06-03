package backend

import (
	"fmt"
	"math/rand"
	"strings"
	"time"
)

const autoHardwareFingerprintArg = "--fingerprint-auto-hardware"

type fingerprintArg struct {
	raw string
	key string
	val string
}

func resolveFingerprintArgsForLaunch(args []string) []string {
	parsed := parseFingerprintArgs(args)
	autoHardware := false
	lang := ""
	out := make([]string, 0, len(args)+16)
	existing := make(map[string]struct{})

	for _, item := range parsed {
		if item.key == autoHardwareFingerprintArg {
			autoHardware = strings.EqualFold(strings.TrimSpace(item.val), "true")
			continue
		}
		if item.key == "--fingerprint-region" {
			continue
		}
		if item.key == "--lang" {
			lang = strings.TrimSpace(item.val)
		}
		out = append(out, item.raw)
		if item.key != "" {
			existing[item.key] = struct{}{}
		}
	}

	if !autoHardware {
		return out
	}

	randomized := randomHardwareFingerprintArgs(lang)
	for _, arg := range randomized {
		key := fingerprintArgKey(arg)
		if key == "" {
			continue
		}
		if _, ok := existing[key]; ok {
			continue
		}
		out = append(out, arg)
		existing[key] = struct{}{}
	}
	return out
}

func parseFingerprintArgs(args []string) []fingerprintArg {
	out := make([]fingerprintArg, 0, len(args))
	for _, raw := range args {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		eq := strings.Index(raw, "=")
		if eq < 0 {
			out = append(out, fingerprintArg{raw: raw, key: raw})
			continue
		}
		out = append(out, fingerprintArg{
			raw: raw,
			key: raw[:eq],
			val: raw[eq+1:],
		})
	}
	return out
}

func fingerprintArgKey(arg string) string {
	eq := strings.Index(arg, "=")
	if eq < 0 {
		return strings.TrimSpace(arg)
	}
	return strings.TrimSpace(arg[:eq])
}

func randomHardwareFingerprintArgs(lang string) []string {
	r := newFingerprintRand()
	platform := pickString(r, []string{"windows", "windows", "windows", "mac", "linux"})
	brand := pickString(r, []string{"Chrome", "Chrome", "Edge"})
	if platform == "mac" {
		brand = pickString(r, []string{"Chrome", "Safari"})
	}

	vendor := pickString(r, []string{"Intel", "Intel", "NVIDIA", "AMD"})
	if platform == "mac" {
		vendor = "Apple"
	} else if platform == "linux" {
		vendor = pickString(r, []string{"Intel", "AMD"})
	}
	renderer := randomRendererForVendor(r, vendor)
	highEnd := (vendor == "NVIDIA" || vendor == "AMD" || vendor == "Apple") && r.Float64() > 0.35
	resolution := pickString(r, []string{"1920,1080", "1366,768", "1440,900", "1600,900", "1280,800"})
	hardwareConcurrency := pickString(r, []string{"4", "6", "8"})
	deviceMemory := pickString(r, []string{"4", "8", "16"})
	if highEnd {
		resolution = pickString(r, []string{"1920,1080", "2560,1440", "1600,900", "1440,900"})
		hardwareConcurrency = pickString(r, []string{"8", "10", "12", "16"})
		deviceMemory = pickString(r, []string{"8", "16", "32"})
	}
	touchPoints := "0"
	if platform == "windows" && r.Float64() < 0.12 {
		touchPoints = pickString(r, []string{"1", "5"})
	}

	return []string{
		newRandomFingerprintSeedArg(r),
		fmt.Sprintf("--fingerprint-brand=%s", brand),
		fmt.Sprintf("--fingerprint-platform=%s", platform),
		fmt.Sprintf("--window-size=%s", resolution),
		fmt.Sprintf("--fingerprint-color-depth=%s", pickString(r, colorDepthOptions(platform))),
		fmt.Sprintf("--fingerprint-hardware-concurrency=%s", hardwareConcurrency),
		fmt.Sprintf("--fingerprint-device-memory=%s", deviceMemory),
		"--fingerprint-canvas-noise=true",
		fmt.Sprintf("--fingerprint-webgl-vendor=%s", vendor),
		fmt.Sprintf("--fingerprint-webgl-renderer=%s", renderer),
		"--fingerprint-audio-noise=true",
		fmt.Sprintf("--fingerprint-fonts=%s", pickString(r, commonFonts(platform, lang))),
		"--webrtc-ip-handling-policy=disable_non_proxied_udp",
		"--fingerprint-do-not-track=false",
		fmt.Sprintf("--fingerprint-media-devices=%s", pickString(r, []string{"1,1,1", "2,1,1", "0,1,1"})),
		fmt.Sprintf("--fingerprint-touch-points=%s", touchPoints),
	}
}

func regenerateFingerprintArgsForProfileReset(profileArgs []string, defaultArgs []string) []string {
	baseArgs := normalizedFingerprintArgs(profileArgs)
	if len(baseArgs) == 0 {
		baseArgs = normalizedFingerprintArgs(defaultArgs)
	}
	if len(baseArgs) == 0 {
		return []string{newRandomFingerprintSeedArg(newFingerprintRand())}
	}

	parsed := parseFingerprintArgs(baseArgs)
	autoHardware := false
	lang := ""
	for _, item := range parsed {
		if item.key == autoHardwareFingerprintArg && strings.EqualFold(strings.TrimSpace(item.val), "true") {
			autoHardware = true
			continue
		}
		if item.key == "--lang" {
			lang = strings.TrimSpace(item.val)
		}
	}

	if autoHardware {
		return regenerateAutoHardwareFingerprintArgs(parsed, lang)
	}

	out := make([]string, 0, len(baseArgs)+1)
	seedReplaced := false
	seedArg := newRandomFingerprintSeedArg(newFingerprintRand())
	for _, item := range parsed {
		if item.key == "--fingerprint" {
			if !seedReplaced {
				out = append(out, seedArg)
				seedReplaced = true
			}
			continue
		}
		out = append(out, item.raw)
	}
	if !seedReplaced {
		out = append([]string{seedArg}, out...)
	}
	return out
}

func regenerateAutoHardwareFingerprintArgs(parsed []fingerprintArg, lang string) []string {
	randomized := randomHardwareFingerprintArgs(lang)
	randomizedKeys := make(map[string]struct{}, len(randomized)+1)
	for _, arg := range randomized {
		if key := fingerprintArgKey(arg); key != "" {
			randomizedKeys[key] = struct{}{}
		}
	}
	randomizedKeys[autoHardwareFingerprintArg] = struct{}{}

	out := append([]string{}, randomized...)
	existing := make(map[string]struct{}, len(randomizedKeys))
	for key := range randomizedKeys {
		existing[key] = struct{}{}
	}
	for _, item := range parsed {
		if item.raw == "" {
			continue
		}
		if item.key != "" {
			if _, replaced := randomizedKeys[item.key]; replaced {
				continue
			}
			if _, duplicate := existing[item.key]; duplicate {
				continue
			}
			existing[item.key] = struct{}{}
		}
		out = append(out, item.raw)
	}
	return out
}

func normalizedFingerprintArgs(args []string) []string {
	out := make([]string, 0, len(args))
	for _, arg := range args {
		arg = strings.TrimSpace(arg)
		if arg != "" {
			out = append(out, arg)
		}
	}
	return out
}

func newRandomFingerprintSeedArg(r *rand.Rand) string {
	return fmt.Sprintf("--fingerprint=%d", r.Intn(2147483647)+1)
}

func newFingerprintRand() *rand.Rand {
	return rand.New(rand.NewSource(time.Now().UnixNano()))
}

func pickString(r *rand.Rand, items []string) string {
	return items[r.Intn(len(items))]
}

func randomRendererForVendor(r *rand.Rand, vendor string) string {
	switch vendor {
	case "NVIDIA":
		return pickString(r, []string{"NVIDIA GeForce RTX 3080", "NVIDIA GeForce RTX 3060", "NVIDIA GeForce GTX 1660", "NVIDIA GeForce GTX 1080 Ti"})
	case "AMD":
		return pickString(r, []string{"AMD Radeon RX 6600", "AMD Radeon RX 580", "AMD Radeon Vega 8"})
	case "Apple":
		return pickString(r, []string{"Apple M1", "Apple M2", "Apple M3"})
	default:
		return pickString(r, []string{"Intel(R) UHD Graphics 630", "Intel(R) UHD Graphics 620", "Intel(R) HD Graphics 520", "Intel(R) Iris(R) Xe Graphics"})
	}
}

func colorDepthOptions(platform string) []string {
	if platform == "mac" {
		return []string{"24", "30"}
	}
	return []string{"24", "24", "32"}
}

func commonFonts(platform string, lang string) []string {
	normalizedLang := strings.ToLower(strings.TrimSpace(lang))
	if strings.HasPrefix(normalizedLang, "zh") {
		switch platform {
		case "mac":
			return []string{
				"Arial,Helvetica,PingFang SC,Hiragino Sans GB,STHeiti,Songti SC,Times New Roman",
				"Arial,Helvetica,PingFang SC,Heiti SC,Kaiti SC,Times New Roman",
			}
		case "linux":
			return []string{
				"Arial,Noto Sans CJK SC,WenQuanYi Micro Hei,Noto Sans,DejaVu Sans,Times New Roman",
				"Arial,Noto Serif CJK SC,Noto Sans CJK SC,Liberation Sans,Times New Roman",
			}
		default:
			return []string{
				"Arial,Segoe UI,Microsoft YaHei,SimSun,SimHei,Calibri,Times New Roman",
				"Arial,Microsoft YaHei UI,Microsoft YaHei,SimSun,FangSong,Times New Roman",
			}
		}
	}

	if strings.HasPrefix(normalizedLang, "ja") {
		switch platform {
		case "mac":
			return []string{
				"Arial,Helvetica,Hiragino Kaku Gothic ProN,Yu Gothic,Hiragino Mincho ProN,Times New Roman",
				"Arial,Helvetica,Yu Gothic,Hiragino Sans,Osaka,Times New Roman",
			}
		case "linux":
			return []string{
				"Arial,Noto Sans CJK JP,Noto Serif CJK JP,Noto Sans,DejaVu Sans,Times New Roman",
				"Arial,Noto Sans JP,Noto Serif JP,Liberation Sans,Times New Roman",
			}
		default:
			return []string{
				"Arial,Segoe UI,Yu Gothic,Meiryo,MS Gothic,Times New Roman",
				"Arial,Yu Gothic UI,Meiryo,MS PGothic,Times New Roman",
			}
		}
	}

	if strings.HasPrefix(normalizedLang, "ko") {
		switch platform {
		case "mac":
			return []string{
				"Arial,Helvetica,Apple SD Gothic Neo,Arial Unicode MS,Times New Roman",
				"Arial,Helvetica,AppleGothic,Apple SD Gothic Neo,Times New Roman",
			}
		case "linux":
			return []string{
				"Arial,Noto Sans CJK KR,Noto Serif CJK KR,Noto Sans,DejaVu Sans,Times New Roman",
				"Arial,Noto Sans KR,Noto Serif KR,Liberation Sans,Times New Roman",
			}
		default:
			return []string{
				"Arial,Segoe UI,Malgun Gothic,Gulim,Dotum,Times New Roman",
				"Arial,Malgun Gothic,Microsoft JhengHei,Times New Roman",
			}
		}
	}

	if strings.HasPrefix(normalizedLang, "ar") {
		return []string{
			"Arial,Segoe UI,Tahoma,Arial Unicode MS,Times New Roman",
			"Arial,Tahoma,Noto Naskh Arabic,Noto Sans Arabic,Times New Roman",
		}
	}

	switch platform {
	case "mac":
		return []string{
			"Arial,Helvetica,PingFang SC,Hiragino Sans GB,STHeiti,Times New Roman",
			"Arial,Helvetica,San Francisco,Menlo,Georgia,Times New Roman",
			"Arial,Helvetica,Hiragino Kaku Gothic ProN,Yu Gothic,Times New Roman",
		}
	case "linux":
		return []string{
			"Arial,Noto Sans,Ubuntu,DejaVu Sans,Liberation Sans,Times New Roman",
			"Arial,Noto Sans,Roboto,DejaVu Serif,Liberation Mono,Times New Roman",
		}
	default:
		return []string{
			"Arial,Segoe UI,Calibri,Microsoft YaHei,SimSun,Times New Roman,Courier New",
			"Arial,Helvetica,Verdana,Tahoma,Times New Roman,Courier New,Georgia",
			"Arial,Segoe UI,Calibri,Verdana,Microsoft YaHei,Times New Roman",
		}
	}
}
