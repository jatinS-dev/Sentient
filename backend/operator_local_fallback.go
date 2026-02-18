package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

type localOperatorRun struct {
	ID          string
	WorkspaceID string
	FeatureName string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type localOperatorStore struct {
	mu             sync.Mutex
	runs           map[string]*localOperatorRun
	jiraConnected  bool
	slackConnected bool
}

var operatorLocalStore = localOperatorStore{
	runs: map[string]*localOperatorRun{},
}

func tryLocalDecisionOperatorFallback(w http.ResponseWriter, method string, targetPath string, body []byte, upstreamError string) bool {
	if !localOperatorFallbackEnabled() {
		return false
	}

	status, payload, ok := handleLocalOperatorRequest(method, targetPath, body, upstreamError)
	if !ok {
		return false
	}

	writeJSON(w, status, payload)
	return true
}

func localOperatorFallbackEnabled() bool {
	flag := strings.ToLower(strings.TrimSpace(os.Getenv("DECISION_OPERATOR_FALLBACK")))
	switch flag {
	case "0", "false", "off", "disabled", "no":
		return false
	default:
		return true
	}
}

func handleLocalOperatorRequest(method string, targetPath string, body []byte, upstreamError string) (int, any, bool) {
	switch {
	case targetPath == "/api/health" && method == "GET":
		payload := map[string]any{
			"status": "ok",
			"mode":   "local_fallback",
		}
		if strings.TrimSpace(upstreamError) != "" {
			payload["upstream_error"] = upstreamError
		}
		return 200, payload, true

	case targetPath == "/api/connections/slack/import-from-state" && method == "POST":
		operatorLocalStore.mu.Lock()
		operatorLocalStore.slackConnected = true
		operatorLocalStore.mu.Unlock()
		return 200, map[string]any{
			"status":                 "connected",
			"tool":                   "slack",
			"team_name":              "Sentinent Labs",
			"selected_channel_count": 8,
			"mode":                   "local_fallback",
		}, true

	case targetPath == "/api/connections/slack" && method == "POST":
		operatorLocalStore.mu.Lock()
		operatorLocalStore.slackConnected = true
		operatorLocalStore.mu.Unlock()
		return 200, map[string]any{
			"status": "connected",
			"tool":   "slack",
			"mode":   "local_fallback",
		}, true

	case targetPath == "/api/connections/jira" && method == "POST":
		var payload struct {
			CredentialBlob struct {
				BaseURL string `json:"base_url"`
			} `json:"credential_blob"`
		}
		_ = json.Unmarshal(body, &payload)
		isConnected := strings.TrimSpace(payload.CredentialBlob.BaseURL) != ""
		operatorLocalStore.mu.Lock()
		operatorLocalStore.jiraConnected = isConnected
		operatorLocalStore.mu.Unlock()
		return 200, map[string]any{
			"status":   "connected",
			"tool":     "jira",
			"base_url": strings.TrimSpace(payload.CredentialBlob.BaseURL),
			"mode":     "local_fallback",
		}, true

	case targetPath == "/api/decision-runs" && method == "GET":
		return 200, localDecisionRunSummaries(), true

	case targetPath == "/api/decision-runs" && method == "POST":
		var payload struct {
			FeatureName string `json:"feature_name"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			return 400, errorResponse{Error: "invalid request body"}, true
		}
		featureName := strings.TrimSpace(payload.FeatureName)
		if featureName == "" {
			return 400, errorResponse{Error: "feature_name is required"}, true
		}

		now := time.Now().UTC()
		runID := fmt.Sprintf("run_%d", now.UnixNano())
		operatorLocalStore.mu.Lock()
		operatorLocalStore.runs[runID] = &localOperatorRun{
			ID:          runID,
			WorkspaceID: "local-workspace",
			FeatureName: featureName,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		operatorLocalStore.mu.Unlock()

		return 202, map[string]any{
			"decision_run_id": runID,
			"status":          "queued",
			"mode":            "local_fallback",
		}, true

	case strings.HasPrefix(targetPath, "/api/decision-runs/") && method == "GET":
		runID := strings.TrimPrefix(targetPath, "/api/decision-runs/")
		runID = strings.Trim(runID, "/ ")
		if runID == "" {
			return 400, errorResponse{Error: "missing decision run id"}, true
		}
		return localDecisionRunDetail(runID)
	}

	return 0, nil, false
}

func localDecisionRunSummaries() []map[string]any {
	runs, jiraConnected := snapshotLocalRuns()
	sort.Slice(runs, func(i, j int) bool {
		return runs[i].CreatedAt.After(runs[j].CreatedAt)
	})

	summaries := make([]map[string]any, 0, len(runs))
	for _, run := range runs {
		projection := projectLocalRun(run, jiraConnected)
		summaries = append(summaries, map[string]any{
			"id":           run.ID,
			"feature_name": run.FeatureName,
			"status":       projection.Status,
			"current_step": projection.CurrentStep,
			"created_at":   run.CreatedAt.Format(time.RFC3339),
			"updated_at":   projection.UpdatedAt.Format(time.RFC3339),
		})
	}

	return summaries
}

func localDecisionRunDetail(runID string) (int, any, bool) {
	operatorLocalStore.mu.Lock()
	run, ok := operatorLocalStore.runs[runID]
	jiraConnected := operatorLocalStore.jiraConnected
	operatorLocalStore.mu.Unlock()
	if !ok {
		return 404, errorResponse{Error: "decision run not found"}, true
	}

	projection := projectLocalRun(run, jiraConnected)
	return 200, map[string]any{
		"id":           run.ID,
		"workspace_id": run.WorkspaceID,
		"feature_name": run.FeatureName,
		"status":       projection.Status,
		"current_step": projection.CurrentStep,
		"error":        nil,
		"artifacts":    projection.Artifacts,
		"created_at":   run.CreatedAt.Format(time.RFC3339),
		"updated_at":   projection.UpdatedAt.Format(time.RFC3339),
	}, true
}

type localRunProjection struct {
	Status      string
	CurrentStep string
	Artifacts   []map[string]any
	UpdatedAt   time.Time
}

func projectLocalRun(run *localOperatorRun, jiraConnected bool) localRunProjection {
	now := time.Now().UTC()
	elapsed := now.Sub(run.CreatedAt)

	status := "queued"
	currentStep := "SLACK_EXTRACT"
	if elapsed >= 2*time.Second {
		status = "running"
		currentStep = "SLACK_EXTRACT"
	}
	if elapsed >= 6*time.Second {
		status = "running"
		currentStep = "COMPETITOR_SCAN"
	}
	if elapsed >= 10*time.Second {
		status = "running"
		currentStep = "DECISION_SYNTHESIS"
	}
	if jiraConnected {
		if elapsed >= 14*time.Second {
			status = "running"
			currentStep = "JIRA_CREATE_EPIC"
		}
		if elapsed >= 18*time.Second {
			status = "completed"
			currentStep = "DONE"
		}
	} else if elapsed >= 14*time.Second {
		status = "completed"
		currentStep = "DONE"
	}

	return localRunProjection{
		Status:      status,
		CurrentStep: currentStep,
		Artifacts:   buildLocalArtifacts(run, jiraConnected, elapsed),
		UpdatedAt:   now,
	}
}

func buildLocalArtifacts(run *localOperatorRun, jiraConnected bool, elapsed time.Duration) []map[string]any {
	feature := strings.TrimSpace(run.FeatureName)
	if feature == "" {
		feature = "Feature"
	}
	featureLower := strings.ToLower(feature)

	artifacts := make([]map[string]any, 0, 5)
	logs := localRunLogs(run, jiraConnected, elapsed)

	if elapsed >= 6*time.Second {
		artifacts = append(artifacts, map[string]any{
			"id":         run.ID + "_slack",
			"type":       "slack_signals",
			"created_at": run.CreatedAt.Add(6 * time.Second).Format(time.RFC3339),
			"json": map[string]any{
				"total_mentions": 42,
				"channels": []map[string]any{
					{"name": "#support", "count": 18},
					{"name": "#product-feedback", "count": 12},
					{"name": "#sales", "count": 8},
				},
				"messages": []map[string]any{
					{
						"text":      fmt.Sprintf("Can we add %s? Users asked for this in onboarding.", featureLower),
						"user":      "A. Rivera",
						"ts":        run.CreatedAt.Add(4 * time.Second).Format(time.RFC3339),
						"permalink": "https://slack.example.com/archives/C001/p123",
					},
					{
						"text":      fmt.Sprintf("%s would reduce eye strain for night usage.", feature),
						"user":      "S. Chen",
						"ts":        run.CreatedAt.Add(5 * time.Second).Format(time.RFC3339),
						"permalink": "https://slack.example.com/archives/C004/p234",
					},
				},
				"themes": []map[string]any{
					{"label": "eye strain", "count": 14},
					{"label": "night usage", "count": 11},
					{"label": "accessibility", "count": 8},
				},
			},
		})
	}

	if elapsed >= 10*time.Second {
		artifacts = append(artifacts, map[string]any{
			"id":         run.ID + "_competitor",
			"type":       "competitor_scan",
			"created_at": run.CreatedAt.Add(10 * time.Second).Format(time.RFC3339),
			"json": map[string]any{
				"feature": featureLower,
				"findings": []map[string]any{
					{"competitor": "Linear", "page": "changelog", "evidence": "Dark mode improvements for project views", "url": "https://linear.app/changelog"},
					{"competitor": "Jira", "page": "release notes", "evidence": "Custom theme support available in cloud", "url": "https://www.atlassian.com/software/jira/release-notes"},
					{"competitor": "Notion", "page": "help center", "evidence": "Theme toggle for low-light environments", "url": "https://www.notion.so/help"},
				},
			},
		})
	}

	if elapsed >= 14*time.Second {
		artifacts = append(artifacts, map[string]any{
			"id":         run.ID + "_decision",
			"type":       "decision_object",
			"created_at": run.CreatedAt.Add(14 * time.Second).Format(time.RFC3339),
			"json": map[string]any{
				"feature": feature,
				"signals": map[string]any{
					"total_mentions": 42,
					"top_channels": []map[string]any{
						{"name": "#support", "count": 18},
						{"name": "#product-feedback", "count": 12},
					},
					"themes": []map[string]any{
						{"label": "eye strain", "count": 14},
						{"label": "night usage", "count": 11},
					},
					"sample_quotes": []map[string]any{
						{
							"text":   fmt.Sprintf("I need %s to use this after work hours.", featureLower),
							"source": "slack",
							"url":    "https://slack.example.com/archives/C001/p123",
						},
					},
				},
				"competitors": []map[string]any{
					{"name": "Linear", "evidence": "Found in changelog feature rollouts", "url": "https://linear.app/changelog"},
					{"name": "Jira", "evidence": "Found in release notes for cloud experience", "url": "https://www.atlassian.com/software/jira/release-notes"},
				},
				"assumptions": []map[string]any{
					{"statement": "Users churn in night workflows due to brightness", "risk": "medium", "validation": "A/B theme toggle", "metric": "retention +2%"},
					{"statement": "Support load drops when accessibility options increase", "risk": "low", "validation": "Track support tags", "metric": "ticket volume -10%"},
					{"statement": "Theme parity is expected by enterprise buyers", "risk": "medium", "validation": "Sales call tracking", "metric": "objection frequency -20%"},
					{"statement": "Competitor coverage creates urgency", "risk": "low", "validation": "Win/loss notes", "metric": "win rate +3%"},
					{"statement": "Users discover theme controls in settings", "risk": "medium", "validation": "Onboarding tooltip", "metric": "feature adoption 40%"},
				},
				"recommendation": map[string]any{
					"priority":   "High",
					"confidence": 0.72,
					"next_steps": []string{"Create Jira epic", "Run prototype usability test", "Measure retention for night users"},
				},
			},
		})
	}

	if jiraConnected && elapsed >= 18*time.Second {
		artifacts = append(artifacts, map[string]any{
			"id":         run.ID + "_jira",
			"type":       "jira_epic",
			"created_at": run.CreatedAt.Add(18 * time.Second).Format(time.RFC3339),
			"json": map[string]any{
				"epic_key": "PROD-123",
				"url":      "https://your-org.atlassian.net/browse/PROD-123",
			},
		})
	}

	artifacts = append(artifacts, map[string]any{
		"id":         run.ID + "_logs",
		"type":       "run_logs",
		"created_at": time.Now().UTC().Format(time.RFC3339),
		"json":       logs,
	})

	return artifacts
}

func localRunLogs(run *localOperatorRun, jiraConnected bool, elapsed time.Duration) []map[string]any {
	logs := []map[string]any{
		{"step": "SLACK_EXTRACT", "status": "queued", "message": "Run accepted and waiting for worker.", "at": run.CreatedAt.Format(time.RFC3339)},
	}

	if elapsed >= 2*time.Second {
		logs = append(logs, map[string]any{
			"step":    "SLACK_EXTRACT",
			"status":  "success",
			"message": "Collected and normalized Slack messages.",
			"at":      run.CreatedAt.Add(6 * time.Second).Format(time.RFC3339),
		})
	}
	if elapsed >= 6*time.Second {
		logs = append(logs, map[string]any{
			"step":    "COMPETITOR_SCAN",
			"status":  "success",
			"message": "Extracted evidence snippets from competitor pages.",
			"at":      run.CreatedAt.Add(10 * time.Second).Format(time.RFC3339),
		})
	}
	if elapsed >= 10*time.Second {
		logs = append(logs, map[string]any{
			"step":    "DECISION_SYNTHESIS",
			"status":  "success",
			"message": "Generated strict decision object JSON.",
			"at":      run.CreatedAt.Add(14 * time.Second).Format(time.RFC3339),
		})
	}
	if jiraConnected && elapsed >= 14*time.Second {
		logs = append(logs, map[string]any{
			"step":    "JIRA_CREATE_EPIC",
			"status":  "success",
			"message": "Created Jira epic from decision object.",
			"at":      run.CreatedAt.Add(18 * time.Second).Format(time.RFC3339),
		})
	}
	if (!jiraConnected && elapsed >= 14*time.Second) || (jiraConnected && elapsed >= 18*time.Second) {
		logs = append(logs, map[string]any{
			"step":    "DONE",
			"status":  "success",
			"message": "Run completed in local fallback mode.",
			"at":      time.Now().UTC().Format(time.RFC3339),
		})
	}

	return logs
}

func snapshotLocalRuns() ([]*localOperatorRun, bool) {
	operatorLocalStore.mu.Lock()
	defer operatorLocalStore.mu.Unlock()

	runs := make([]*localOperatorRun, 0, len(operatorLocalStore.runs))
	for _, run := range operatorLocalStore.runs {
		runs = append(runs, &localOperatorRun{
			ID:          run.ID,
			WorkspaceID: run.WorkspaceID,
			FeatureName: run.FeatureName,
			CreatedAt:   run.CreatedAt,
			UpdatedAt:   run.UpdatedAt,
		})
	}

	return runs, operatorLocalStore.jiraConnected
}
