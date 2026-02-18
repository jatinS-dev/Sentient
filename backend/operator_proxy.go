package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func handleOperatorHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	proxyDecisionOperator(w, r, http.MethodGet, "/api/health", nil)
}

func handleOperatorSlackImportFromState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}
	if len(bytes.TrimSpace(body)) == 0 {
		body = []byte("{}")
	}
	proxyDecisionOperator(w, r, http.MethodPost, "/api/connections/slack/import-from-state", body)
}

func handleOperatorSlackConnection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}
	proxyDecisionOperator(w, r, http.MethodPost, "/api/connections/slack", body)
}

func handleOperatorJiraConnection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}
	proxyDecisionOperator(w, r, http.MethodPost, "/api/connections/jira", body)
}

func handleOperatorDecisionRuns(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		proxyDecisionOperator(w, r, http.MethodGet, "/api/decision-runs", nil)
	case http.MethodPost:
		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
			return
		}
		proxyDecisionOperator(w, r, http.MethodPost, "/api/decision-runs", body)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleOperatorDecisionRunByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	prefix := "/api/operator/decision-runs/"
	raw := strings.TrimPrefix(r.URL.Path, prefix)
	raw = strings.TrimSpace(raw)
	if raw == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "missing decision run id"})
		return
	}

	target := "/api/decision-runs/" + raw
	proxyDecisionOperator(w, r, http.MethodGet, target, nil)
}

func proxyDecisionOperator(w http.ResponseWriter, r *http.Request, method string, targetPath string, body []byte) {
	base := strings.TrimSuffix(strings.TrimSpace(decisionOperatorAPIURL), "/")
	if base == "" {
		base = "http://localhost:8000"
	}
	targetURL := base + targetPath
	if rawQuery := strings.TrimSpace(r.URL.RawQuery); rawQuery != "" {
		targetURL = targetURL + "?" + rawQuery
	}

	var bodyReader io.Reader
	if len(body) > 0 {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, targetURL, bodyReader)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to build operator request"})
		return
	}
	req.Header.Set("Accept", "application/json")
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		if tryLocalDecisionOperatorFallback(w, method, targetPath, body, fmt.Sprintf("upstream request failed: %v", err)) {
			return
		}
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: fmt.Sprintf("decision operator unreachable: %v", err)})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		if tryLocalDecisionOperatorFallback(w, method, targetPath, body, "failed to read upstream response body") {
			return
		}
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: "failed to read decision operator response"})
		return
	}

	if resp.StatusCode >= http.StatusInternalServerError {
		upstreamErr := fmt.Sprintf("upstream returned %d", resp.StatusCode)
		if len(bytes.TrimSpace(respBody)) > 0 {
			upstreamErr = upstreamErr + ": " + string(respBody)
		}
		if tryLocalDecisionOperatorFallback(w, method, targetPath, body, upstreamErr) {
			return
		}
	}

	contentType := resp.Header.Get("Content-Type")
	if strings.TrimSpace(contentType) == "" {
		contentType = "application/json"
	}
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}
