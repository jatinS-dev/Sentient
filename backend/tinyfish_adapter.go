package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"hash/crc32"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type TinyFishStep struct {
	Action     string            `json:"action"`
	URL        string            `json:"url,omitempty"`
	Selector   string            `json:"selector,omitempty"`
	Text       string            `json:"text,omitempty"`
	MS         int               `json:"ms,omitempty"`
	MaxScrolls int               `json:"maxScrolls,omitempty"`
	Limit      int               `json:"limit,omitempty"`
	Fields     map[string]string `json:"fields,omitempty"`
}

type TinyFishAdapter interface {
	CreateSession(runID string) (string, error)
	RunSteps(sessionID string, steps []TinyFishStep) (map[string]any, error)
	CloseSession(sessionID string) error
	IsDemoMode() bool
}

type tinyFishHTTPAdapter struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

type tinyFishMockAdapter struct{}

func newTinyFishAdapter() TinyFishAdapter {
	if agentDemoMode {
		return &tinyFishMockAdapter{}
	}
	return &tinyFishHTTPAdapter{
		baseURL: strings.TrimSuffix(strings.TrimSpace(tinyFishBaseURL), "/"),
		apiKey:  strings.TrimSpace(tinyFishAPIKey),
		client:  &http.Client{Timeout: 60 * time.Second},
	}
}

func (a *tinyFishHTTPAdapter) IsDemoMode() bool { return false }

func (a *tinyFishHTTPAdapter) CreateSession(runID string) (string, error) {
	payload := map[string]any{"runId": runID}
	respBody, err := a.request(http.MethodPost, "/sessions", payload)
	if err != nil {
		return "", err
	}

	if sessionID, ok := respBody["sessionId"].(string); ok && strings.TrimSpace(sessionID) != "" {
		return sessionID, nil
	}
	if sessionID, ok := respBody["id"].(string); ok && strings.TrimSpace(sessionID) != "" {
		return sessionID, nil
	}
	return "", fmt.Errorf("tinyfish createSession missing session id")
}

func (a *tinyFishHTTPAdapter) RunSteps(sessionID string, steps []TinyFishStep) (map[string]any, error) {
	payload := map[string]any{
		"steps": steps,
	}
	return a.request(http.MethodPost, "/sessions/"+url.PathEscape(sessionID)+"/run", payload)
}

func (a *tinyFishHTTPAdapter) CloseSession(sessionID string) error {
	_, err := a.request(http.MethodDelete, "/sessions/"+url.PathEscape(sessionID), nil)
	return err
}

func (a *tinyFishHTTPAdapter) request(method, path string, payload any) (map[string]any, error) {
	endpoint := a.baseURL + path
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if a.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+a.apiKey)
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("tinyfish %s %s failed (%d): %s", method, path, resp.StatusCode, strings.TrimSpace(string(respBytes)))
	}

	if len(bytes.TrimSpace(respBytes)) == 0 {
		return map[string]any{}, nil
	}

	var decoded map[string]any
	if err := json.Unmarshal(respBytes, &decoded); err != nil {
		return nil, fmt.Errorf("tinyfish decode error: %w", err)
	}
	return decoded, nil
}

func (a *tinyFishMockAdapter) IsDemoMode() bool { return true }

func (a *tinyFishMockAdapter) CreateSession(runID string) (string, error) {
	return "mock-session-" + runID, nil
}

func (a *tinyFishMockAdapter) RunSteps(_ string, steps []TinyFishStep) (map[string]any, error) {
	query := ""
	visitURL := ""
	for _, step := range steps {
		if step.Action == "type" && strings.TrimSpace(step.Text) != "" {
			query = step.Text
		}
		if step.Action == "goto" && strings.TrimSpace(step.URL) != "" {
			visitURL = step.URL
		}
	}

	if query != "" {
		domains := []string{
			"reddit.com",
			"github.com",
			"g2.com",
			"capterra.com",
			"product.example.blog",
			"docs.example.com",
		}
		results := make([]map[string]any, 0, 5)
		for i := 0; i < 5; i++ {
			domain := domains[(mockHash(query)+i)%len(domains)]
			pathSlug := sanitizeSlug(query)
			link := fmt.Sprintf("https://%s/%s/%d", domain, pathSlug, i+1)
			results = append(results, map[string]any{
				"title": fmt.Sprintf("%s insight %d", strings.Title(pathSlug), i+1),
				"url":   link,
			})
		}
		return map[string]any{
			"results":      results,
			"pagesVisited": 1,
		}, nil
	}

	if visitURL != "" {
		host := extractHost(visitURL)
		baseSnippet := fmt.Sprintf("Users repeatedly mention demand for this feature when evaluating %s workflows.", host)
		return map[string]any{
			"url":          visitURL,
			"title":        fmt.Sprintf("Feature demand analysis on %s", host),
			"snippets":     []any{baseSnippet, "Teams describe clear usability impact and adoption upside.", "Multiple threads ask for roadmap timing and rollout details."},
			"published_at": time.Now().AddDate(0, 0, -mockHash(visitURL)%170).UTC().Format(time.RFC3339),
			"engagement":   0.45 + float64(mockHash(visitURL)%45)/100,
		}, nil
	}

	return map[string]any{}, nil
}

func (a *tinyFishMockAdapter) CloseSession(_ string) error { return nil }

func mockHash(input string) int {
	return int(crc32.ChecksumIEEE([]byte(strings.ToLower(strings.TrimSpace(input)))))
}

func sanitizeSlug(v string) string {
	s := strings.ToLower(strings.TrimSpace(v))
	s = strings.ReplaceAll(s, " ", "-")
	s = strings.ReplaceAll(s, "/", "-")
	s = strings.ReplaceAll(s, "?", "")
	s = strings.ReplaceAll(s, "&", "-")
	if s == "" {
		return "feature"
	}
	return s
}

func extractHost(rawURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" {
		return "web"
	}
	return strings.TrimPrefix(parsed.Host, "www.")
}
