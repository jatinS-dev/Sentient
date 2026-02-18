package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
)

type leadPayload struct {
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	WorkEmail   string `json:"workEmail"`
	CompanyName string `json:"companyName"`
}

type errorResponse struct {
	Error string `json:"error"`
}

type okResponse struct {
	Status string `json:"status"`
}

var (
	smtpHost               string
	smtpPort               string
	smtpUser               string
	smtpPass               string
	smtpFrom               string
	smtpTo                 string
	waToken                string
	waPhoneID              string
	waTo                   string
	waTemplate             string
	waLang                 string
	slackClientID          string
	slackClientSecret      string
	slackSigningSecret     string
	slackRedirectURL       string
	slackBotScopes         string
	appUIBaseURL           string
	integrationsStatePath  string
	integrationsEncryptKey string
	integrationsKeyPath    string
	supabaseURL            string
	supabaseServiceRoleKey string
	supabaseSignalsTable   string
	decisionOperatorAPIURL string
	tinyFishBaseURL        string
	tinyFishAPIKey         string
	agentDemoMode          bool
)

func main() {
	// Load config
	loadConfig()
	if err := initIntegrations(); err != nil {
		log.Fatalf("failed to initialize integrations subsystem: %v", err)
	}

	// Initialize Clerk
	clerkSecretKey := strings.TrimSpace(os.Getenv("CLERK_SECRET_KEY"))
	if clerkSecretKey == "" {
		log.Println("WARNING: CLERK_SECRET_KEY is missing. Authentication Middleware will not work correctly.")
	}
	clerk.SetKey(clerkSecretKey)

	mux := http.NewServeMux()

	// Public routes
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/api/integrations", handleIntegrations)
	mux.HandleFunc("/api/integrations/slack/connect-url", handleSlackConnectURL)
	mux.HandleFunc("/api/integrations/slack/setup", handleSlackSetup)
	mux.HandleFunc("/api/integrations/slack/setup/validate", handleSlackSetupValidate)
	mux.HandleFunc("/api/integrations/slack/callback", handleSlackCallback)
	mux.HandleFunc("/api/integrations/slack/channels", handleSlackChannels)
	mux.HandleFunc("/api/integrations/slack/channels/import", handleSlackChannelsImport)
	mux.HandleFunc("/api/integrations/slack/webhook", handleSlackWebhook)
	mux.HandleFunc("/api/integrations/slack/disconnect", handleSlackDisconnect)
	mux.HandleFunc("/api/signals", handleSignals)
	mux.HandleFunc("/api/operator/health", handleOperatorHealth)
	mux.HandleFunc("/api/operator/connections/slack/import-from-state", handleOperatorSlackImportFromState)
	mux.HandleFunc("/api/operator/connections/slack", handleOperatorSlackConnection)
	mux.HandleFunc("/api/operator/connections/jira", handleOperatorJiraConnection)
	mux.HandleFunc("/api/operator/decision-runs", handleOperatorDecisionRuns)
	mux.HandleFunc("/api/operator/decision-runs/", handleOperatorDecisionRunByID)
	mux.HandleFunc("/api/agent/config", handleAgentConfig)
	mux.HandleFunc("/api/agent/feature-research", handleAgentFeatureResearch)
	mux.HandleFunc("/api/agent/runs/", handleAgentRuns)

	// Lead API - could be protected or public depending on requirements
	// For now keeping it open as it's a contact form
	mux.HandleFunc("/api/lead", handleLead)

	// Protected routes
	mux.Handle("/api/me", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(handleMe)))

	addr := ":8080"
	if configuredPort := strings.TrimSpace(os.Getenv("PORT")); configuredPort != "" {
		if strings.HasPrefix(configuredPort, ":") {
			addr = configuredPort
		} else {
			addr = ":" + configuredPort
		}
	}
	log.Printf("listening on %s", addr)

	// Apply global middleware: Logging -> CORS (if needed) -> Handler
	// Note: We are manually wrapping specific routes with Clerk auth if needed,
	// or we could wrap the entire mux if everything was protected.
	if err := http.ListenAndServe(addr, logRequest(mux)); err != nil {
		log.Fatal(err)
	}
}

func loadConfig() {
	smtpHost = strings.TrimSpace(os.Getenv("SMTP_HOST"))
	smtpPort = strings.TrimSpace(os.Getenv("SMTP_PORT"))
	smtpUser = strings.TrimSpace(os.Getenv("SMTP_USER"))
	smtpPass = strings.TrimSpace(os.Getenv("SMTP_PASS"))
	smtpFrom = strings.TrimSpace(os.Getenv("SMTP_FROM"))
	smtpTo = strings.TrimSpace(os.Getenv("SMTP_TO"))

	waToken = strings.TrimSpace(os.Getenv("WHATSAPP_TOKEN"))
	waPhoneID = strings.TrimSpace(os.Getenv("WHATSAPP_PHONE_NUMBER_ID"))
	waTo = strings.TrimSpace(os.Getenv("WHATSAPP_TO"))
	waTemplate = strings.TrimSpace(os.Getenv("WHATSAPP_TEMPLATE_NAME"))
	waLang = strings.TrimSpace(os.Getenv("WHATSAPP_TEMPLATE_LANG"))
	if waLang == "" {
		waLang = "en_US"
	}

	if waToken == "" || waPhoneID == "" || waTo == "" || waTemplate == "" {
		log.Println("WARNING: WhatsApp config missing.")
	}

	slackClientID = strings.TrimSpace(os.Getenv("SLACK_CLIENT_ID"))
	slackClientSecret = strings.TrimSpace(os.Getenv("SLACK_CLIENT_SECRET"))
	slackSigningSecret = strings.TrimSpace(os.Getenv("SLACK_SIGNING_SECRET"))
	slackRedirectURL = strings.TrimSpace(os.Getenv("SLACK_REDIRECT_URL"))
	slackBotScopes = strings.TrimSpace(os.Getenv("SLACK_BOT_SCOPES"))
	appUIBaseURL = strings.TrimSpace(os.Getenv("APP_UI_BASE_URL"))
	integrationsEncryptKey = strings.TrimSpace(os.Getenv("INTEGRATIONS_ENCRYPTION_KEY"))
	integrationsStatePath = strings.TrimSpace(os.Getenv("INTEGRATIONS_STATE_PATH"))
	integrationsKeyPath = strings.TrimSpace(os.Getenv("INTEGRATIONS_KEY_PATH"))
	supabaseURL = strings.TrimSpace(os.Getenv("SUPABASE_URL"))
	supabaseServiceRoleKey = strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	supabaseSignalsTable = strings.TrimSpace(os.Getenv("SUPABASE_SIGNALS_TABLE"))
	decisionOperatorAPIURL = strings.TrimSpace(os.Getenv("DECISION_OPERATOR_API_BASE_URL"))
	tinyFishBaseURL = strings.TrimSpace(os.Getenv("TINYFISH_BASE_URL"))
	tinyFishAPIKey = strings.TrimSpace(os.Getenv("TINYFISH_API_KEY"))
	agentDemoMode = parseBoolEnv(os.Getenv("DEMO_MODE"), true)

	if slackRedirectURL == "" {
		log.Println("INFO: SLACK_REDIRECT_URL not set. It will be auto-generated by Slack setup wizard.")
	}
	if slackBotScopes == "" {
		slackBotScopes = defaultSlackBotScopes
	}
	if appUIBaseURL == "" {
		log.Println("INFO: APP_UI_BASE_URL not set. It will be auto-generated by Slack setup wizard.")
	}
	if integrationsStatePath == "" {
		integrationsStatePath = filepath.Join("data", "integrations_state.json")
	}
	if integrationsKeyPath == "" {
		integrationsKeyPath = filepath.Join("data", "integrations.key")
	}
	if supabaseSignalsTable == "" {
		supabaseSignalsTable = "signals"
	}
	if decisionOperatorAPIURL == "" {
		decisionOperatorAPIURL = "http://localhost:8000"
	}
	if tinyFishBaseURL == "" {
		tinyFishBaseURL = "http://localhost:8787"
	}

	if slackClientID == "" || slackClientSecret == "" {
		log.Println("INFO: Slack OAuth env config not set. You can configure Slack from the UI setup wizard.")
	}
	if slackSigningSecret == "" {
		log.Println("INFO: Slack signing secret not set in env. You can configure it from the UI setup wizard.")
	}
	if integrationsEncryptKey == "" {
		generatedKey, err := ensureIntegrationEncryptionKey(integrationsKeyPath)
		if err != nil {
			log.Printf("WARNING: unable to auto-generate integrations encryption key: %v", err)
		} else {
			integrationsEncryptKey = generatedKey
			log.Printf("INFO: INTEGRATIONS_ENCRYPTION_KEY not set; generated local key at %s", integrationsKeyPath)
		}
	}
	if (supabaseURL != "" && supabaseServiceRoleKey == "") || (supabaseURL == "" && supabaseServiceRoleKey != "") {
		log.Println("WARNING: Supabase is partially configured. Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable DB persistence.")
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, okResponse{Status: "ok"})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := clerk.SessionClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "unauthorized"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "authenticated",
		"claims": claims,
	})
}

func handleLead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload leadPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid json"})
		return
	}

	payload.FirstName = strings.TrimSpace(payload.FirstName)
	payload.LastName = strings.TrimSpace(payload.LastName)
	payload.WorkEmail = strings.TrimSpace(payload.WorkEmail)
	payload.CompanyName = strings.TrimSpace(payload.CompanyName)

	if payload.WorkEmail == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "workEmail is required"})
		return
	}

	// Try sending via WhatsApp if configured
	if waToken != "" && waPhoneID != "" && waTo != "" && waTemplate != "" {
		if err := sendWhatsAppTemplate(waToken, waPhoneID, waTo, waTemplate, waLang, payload); err != nil {
			log.Printf("whatsapp send failed: %v", err)
		}
	}

	// Try sending via Email if configured
	if smtpHost != "" && smtpPort != "" && smtpUser != "" && smtpPass != "" && smtpFrom != "" && smtpTo != "" {
		log.Printf("Attempting to send email to %s via %s:%s...", smtpTo, smtpHost, smtpPort)
		if err := sendEmail(smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpTo, payload); err != nil {
			log.Printf("ERROR: email send failed: %v", err)
		} else {
			log.Println("SUCCESS: email sent successfully")
		}
	} else {
		log.Println("SMTP config missing or incomplete.")
	}

	writeJSON(w, http.StatusOK, okResponse{Status: "ok"})
}

func sendWhatsAppTemplate(token, phoneNumberID, to, templateName, lang string, payload leadPayload) error {
	endpoint := fmt.Sprintf("https://graph.facebook.com/v19.0/%s/messages", phoneNumberID)

	bodyParams := []map[string]string{
		{"type": "text", "text": safe(payload.FirstName)},
		{"type": "text", "text": safe(payload.LastName)},
		{"type": "text", "text": safe(payload.WorkEmail)},
		{"type": "text", "text": safe(payload.CompanyName)},
		{"type": "text", "text": time.Now().Format(time.RFC3339)},
	}

	msg := map[string]any{
		"messaging_product": "whatsapp",
		"to":                to,
		"type":              "template",
		"template": map[string]any{
			"name": templateName,
			"language": map[string]string{
				"code": lang,
			},
			"components": []map[string]any{
				{
					"type":       "body",
					"parameters": bodyParams,
				},
			},
		},
	}

	payloadBytes, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payloadBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("whatsapp api status %d", resp.StatusCode)
	}

	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func logRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).String())
	})
}

func safe(v string) string {
	if v == "" {
		return "-"
	}
	return v
}

func parseBoolEnv(raw string, defaultValue bool) bool {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	if normalized == "" {
		return defaultValue
	}

	switch normalized {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return defaultValue
	}
}

func sendEmail(host, port, user, pass, from, to string, payload leadPayload) error {
	auth := smtp.PlainAuth("", user, pass, host)
	addr := fmt.Sprintf("%s:%s", host, port)

	subject := "New Sentient Demo Request"
	body := fmt.Sprintf("New lead received:\n\nName: %s %s\nEmail: %s\nCompany: %s\nTime: %s",
		payload.FirstName, payload.LastName, payload.WorkEmail, payload.CompanyName, time.Now().Format(time.RFC3339))

	msg := []byte(fmt.Sprintf("To: %s\r\nSubject: %s\r\n\r\n%s", to, subject, body))

	return smtp.SendMail(addr, auth, from, []string{to}, msg)
}
